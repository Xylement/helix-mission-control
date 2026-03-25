"""
OpenClaw Gateway WebSocket client.

Connects to the OpenClaw Gateway using its native protocol (type: "req"/"res"/"event"),
dispatches tasks to AI agents via chat.send, and processes streaming results.
"""

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis
import websockets
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import async_session
from app.models.agent import Agent
from app.models.task import Task
from app.models.user import User
from app.models.comment import Comment
from app.models.activity import ActivityLog
from app.models.organization_settings import OrganizationSettings

logger = logging.getLogger("helix.gateway")

REDIS_ACTIVE_CHATS_KEY = "helix:gateway:active_chats"


class OpenClawGateway:
    def __init__(self):
        self.ws = None
        self._running = False
        self._pending: dict[str, asyncio.Future] = {}  # req_id -> future
        self._active_chats: dict[str, dict] = {}  # session_key -> {task_id, text, ...}
        self._receive_task: asyncio.Task | None = None
        self._reconnect_task: asyncio.Task | None = None
        self._agent_id_map: dict[str, str] = {}  # agent name -> gateway agent ID
        self._instance_id = str(uuid.uuid4())
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL)
        return self._redis

    async def _save_active_chat(self, session_key: str, chat_data: dict):
        """Persist an active chat to Redis."""
        try:
            r = await self._get_redis()
            # Store only serializable fields (no accumulated text)
            persist = {k: v for k, v in chat_data.items() if k != "text"}
            await r.hset(REDIS_ACTIVE_CHATS_KEY, session_key, json.dumps(persist))
        except Exception as e:
            logger.warning("Failed to save active chat to Redis: %s", e)

    async def _remove_active_chat(self, session_key: str):
        """Remove an active chat from Redis."""
        try:
            r = await self._get_redis()
            await r.hdel(REDIS_ACTIVE_CHATS_KEY, session_key)
        except Exception as e:
            logger.warning("Failed to remove active chat from Redis: %s", e)

    async def _restore_active_chats(self):
        """Restore active chats from Redis after a restart."""
        try:
            r = await self._get_redis()
            stored = await r.hgetall(REDIS_ACTIVE_CHATS_KEY)
            if not stored:
                return
            for session_key_bytes, data_bytes in stored.items():
                session_key = session_key_bytes.decode() if isinstance(session_key_bytes, bytes) else session_key_bytes
                data = json.loads(data_bytes)
                data["text"] = ""  # Reset accumulated text
                self._active_chats[session_key] = data
                logger.info("Restored active chat: session=%s task=%d agent=%s",
                            session_key, data.get("task_id"), data.get("agent_name"))
            if stored:
                logger.info("Restored %d active chat(s) from Redis", len(stored))
        except Exception as e:
            logger.warning("Failed to restore active chats from Redis: %s", e)

    async def _recover_stuck_tasks(self):
        """On startup, reset any tasks/agents stuck from a previous crash."""
        async with async_session() as db:
            # Find tasks stuck in in_progress with a busy agent
            stmt = (
                select(Task)
                .options(selectinload(Task.assigned_agent))
                .where(and_(
                    Task.status == "in_progress",
                    Task.assigned_agent_id.isnot(None),
                ))
            )
            stuck_tasks = (await db.execute(stmt)).scalars().all()

            # Check which ones are NOT tracked in _active_chats (truly orphaned)
            tracked_task_ids = {chat["task_id"] for chat in self._active_chats.values()}

            for task in stuck_tasks:
                if task.id in tracked_task_ids:
                    continue  # Still being tracked via Redis restore — let it finish

                logger.warning("Recovering stuck task %d (%s) — resetting to todo, agent %s -> online",
                               task.id, task.title, task.assigned_agent.name if task.assigned_agent else "?")

                task.status = "todo"
                task.updated_at = datetime.now(timezone.utc)
                if task.assigned_agent and task.assigned_agent.status == "busy":
                    task.assigned_agent.status = "online"

                db.add(ActivityLog(
                    actor_type="system",
                    actor_id=None,
                    action="task.recovered",
                    entity_type="task",
                    entity_id=task.id,
                    details={"reason": "stuck after restart"},
                    org_id=task.assigned_agent.org_id if task.assigned_agent else None,
                ))

            if stuck_tasks:
                await db.commit()
                recovered = len([t for t in stuck_tasks if t.id not in tracked_task_ids])
                if recovered:
                    logger.info("Recovered %d stuck task(s)", recovered)

    async def _send_and_recv(self, method: str, params: dict, timeout: float = 15) -> dict | None:
        """Send a request and directly wait for the matching response.
        Used during initial handshake before the receive loop is running.
        """
        req_id = str(uuid.uuid4())
        msg = {"type": "req", "id": req_id, "method": method, "params": params}
        await self.ws.send(json.dumps(msg))

        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            remaining = deadline - asyncio.get_event_loop().time()
            raw = await asyncio.wait_for(self.ws.recv(), timeout=remaining)
            data = json.loads(raw)
            if data.get("type") == "res" and data.get("id") == req_id:
                if data.get("ok"):
                    return data.get("payload", {})
                error = data.get("error", {})
                raise Exception(f"{error.get('code')}: {error.get('message')}")
            # Skip non-matching messages (events, other responses)
        return None

    async def connect(self) -> bool:
        """Connect to the OpenClaw Gateway and authenticate."""
        try:
            self.ws = await websockets.connect(
                settings.OPENCLAW_GATEWAY_URL,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5,
            )

            # Read and discard the connect.challenge
            challenge = await asyncio.wait_for(self.ws.recv(), timeout=10)
            data = json.loads(challenge)
            if data.get("event") != "connect.challenge":
                logger.warning("Unexpected first message: %s", data.get("event"))

            # Send connect request (direct send/recv, no receive loop yet)
            # Build connect params with device auth for operator scopes
            connect_params = {
                "minProtocol": 3,
                "maxProtocol": 3,
                "client": {
                    "id": "cli",
                    "version": "2026.3.11",
                    "platform": "linux",
                    "mode": "cli",
                    "instanceId": self._instance_id,
                },
                "caps": [],
                "auth": {"token": settings.OPENCLAW_GATEWAY_TOKEN},
                "role": "operator",
                "scopes": [
                    "operator.admin", "operator.read", "operator.write",
                    "operator.approvals", "operator.pairing",
                ],
            }
            # Add device token for operator scope grant
            device_auth = self._load_device_auth()
            if device_auth:
                connect_params["auth"]["deviceToken"] = device_auth["token"]

            connect_resp = await self._send_and_recv("connect", connect_params)

            if connect_resp is None:
                logger.error("No response to connect request")
                return False

            logger.info("Connected to OpenClaw Gateway (protocol %s, connId=%s)",
                        connect_resp.get("protocol"),
                        connect_resp.get("server", {}).get("connId", "?"))

            # Load agent ID map (also direct send/recv)
            try:
                agents_resp = await self._send_and_recv("agents.list", {})
                if agents_resp:
                    agents = agents_resp.get("agents", [])
                    for a in agents:
                        gw_id = a.get("id", "")
                        name = a.get("name", "")
                        clean_name = re.sub(r'^[^\w]+', '', name).strip()
                        if clean_name and gw_id:
                            self._agent_id_map[clean_name] = gw_id
                            if clean_name == "Helix Director":
                                self._agent_id_map["Helix"] = gw_id
                    logger.info("Loaded %d agent mappings", len(self._agent_id_map))
            except Exception as agents_err:
                logger.warning("Could not load agent list via API: %s. "
                               "Loading from config file instead.", agents_err)
                self._load_agents_from_config()

            # Register any DB agents missing from the gateway
            await self._register_missing_agents()

            return True

        except Exception as e:
            logger.error("Failed to connect to OpenClaw Gateway: %s", e)
            if self.ws:
                await self.ws.close()
                self.ws = None
            return False

    @staticmethod
    def _load_device_auth() -> dict | None:
        """Load device auth token from openclaw identity (grants operator scopes)."""
        import os
        auth_path = "/home/helix/.openclaw/identity/device-auth.json"
        if not os.path.exists(auth_path):
            return None
        try:
            with open(auth_path) as f:
                auth = json.load(f)
            operator = auth.get("tokens", {}).get("operator")
            if operator and operator.get("token"):
                return operator
        except Exception as e:
            logger.warning("Failed to load device auth: %s", e)
        return None

    def _load_agents_from_config(self):
        """Load agent ID map from the openclaw.json config file as fallback."""
        import os
        config_paths = [
            "/home/openclaw/.openclaw/openclaw.json",  # inside Docker
            "/home/helix/.openclaw/openclaw.json",     # host
        ]
        for config_path in config_paths:
            if not os.path.exists(config_path):
                continue
            try:
                with open(config_path) as f:
                    config = json.load(f)
                agents_list = config.get("agents", {}).get("list", [])
                for a in agents_list:
                    gw_id = a.get("id", "")
                    name = a.get("name", "")
                    clean_name = re.sub(r'^[^\w]+', '', name).strip()
                    if clean_name and gw_id:
                        self._agent_id_map[clean_name] = gw_id
                        if clean_name == "Helix Director":
                            self._agent_id_map["Helix"] = gw_id
                if self._agent_id_map:
                    logger.info("Loaded %d agent mappings from config file %s",
                                len(self._agent_id_map), config_path)
                    return
            except Exception as e:
                logger.warning("Failed to load agents from %s: %s", config_path, e)

    async def _register_missing_agents(self):
        """Check DB agents against gateway and register any missing ones."""
        try:
            async with async_session() as db:
                all_agents = (await db.execute(select(Agent))).scalars().all()
                if not all_agents:
                    return

                registered = 0
                for agent in all_agents:
                    if agent.name in self._agent_id_map:
                        continue  # Already in gateway
                    gw_id = await self._register_single_agent(agent.name, agent.system_prompt)
                    if gw_id:
                        registered += 1

                if registered:
                    logger.info("Registered %d missing agent(s) with gateway", registered)
        except Exception as e:
            logger.warning("Failed to register missing agents: %s", e)

    async def _register_single_agent(self, name: str, system_prompt: str | None = None) -> str | None:
        """Register a single agent with the OpenClaw gateway. Returns the gateway ID or None."""
        import os
        workspace_dir = f"/home/helix/.openclaw/workspaces/{name.lower()}"

        # Create workspace and SOUL.md if needed
        try:
            os.makedirs(workspace_dir, exist_ok=True)
            soul_path = os.path.join(workspace_dir, "SOUL.md")
            if not os.path.exists(soul_path):
                from app.routers.agents import sync_soul_md
                await sync_soul_md(name, system_prompt or f"You are {name}.")
        except Exception as e:
            logger.warning("Failed to create workspace for %s: %s", name, e)

        try:
            resp = await self._send_and_recv("agents.create", {
                "name": name,
                "workspace": workspace_dir,
            }, timeout=10)
            if resp is not None:
                # Read back the ID assigned by OpenClaw
                gw_id = resp.get("id") or resp.get("agent", {}).get("id", "")
                if not gw_id:
                    # Fallback: re-list agents to find the newly created one
                    gw_id = await self._find_agent_id_by_name(name)
                if gw_id:
                    self._agent_id_map[name] = gw_id
                    logger.info("Registered agent '%s' with gateway (id=%s)", name, gw_id)
                    return gw_id
                else:
                    logger.warning("Registered agent '%s' but could not determine gateway ID", name)
        except Exception as e:
            err_msg = str(e)
            # Agent may already exist — look it up
            if "already exists" in err_msg.lower() or "duplicate" in err_msg.lower():
                gw_id = await self._find_agent_id_by_name(name)
                if gw_id:
                    self._agent_id_map[name] = gw_id
                    logger.info("Agent '%s' already exists in gateway (id=%s)", name, gw_id)
                    return gw_id
            logger.warning("Failed to register agent '%s': %s", name, e)
        return None

    async def _find_agent_id_by_name(self, name: str) -> str | None:
        """Look up a gateway agent ID by name via agents.list."""
        try:
            resp = await self._send_and_recv("agents.list", {}, timeout=10)
            if resp:
                for a in resp.get("agents", []):
                    a_name = re.sub(r'^[^\w]+', '', a.get("name", "")).strip()
                    if a_name == name:
                        return a.get("id", "")
        except Exception as e:
            logger.warning("Failed to look up agent '%s': %s", name, e)
        return None

    async def unregister_agent(self, agent_name: str):
        """Remove an agent from the gateway."""
        gw_id = self._agent_id_map.pop(agent_name, None)
        if not gw_id or not self.ws or self.ws.state.name != "OPEN":
            return
        try:
            await self._send_and_recv("agents.delete", {"id": gw_id}, timeout=10)
            logger.info("Unregistered agent '%s' from gateway", agent_name)
        except Exception as e:
            logger.warning("Failed to unregister agent '%s': %s", agent_name, e)

    async def _request(self, method: str, params: dict, timeout: float = 30) -> dict | None:
        """Send a request and wait for the response."""
        req_id = str(uuid.uuid4())
        msg = {"type": "req", "id": req_id, "method": method, "params": params}

        future = asyncio.get_event_loop().create_future()
        self._pending[req_id] = future

        await self.ws.send(json.dumps(msg))

        try:
            result = await asyncio.wait_for(future, timeout=timeout)
            return result
        except asyncio.TimeoutError:
            self._pending.pop(req_id, None)
            logger.warning("Request %s timed out", method)
            return None

    async def start(self):
        """Start the gateway client with auto-reconnect."""
        self._running = True
        await self._restore_active_chats()
        await self._recover_stuck_tasks()
        self._reconnect_task = asyncio.create_task(self._reconnect_loop())
        logger.info("OpenClaw Gateway client started")

    async def stop(self):
        """Stop the gateway client."""
        self._running = False
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
        if self.ws:
            await self.ws.close()
            self.ws = None
        for future in self._pending.values():
            if not future.done():
                future.cancel()
        self._pending.clear()
        if self._redis:
            await self._redis.close()
            self._redis = None
        logger.info("OpenClaw Gateway client stopped")

    async def _reconnect_loop(self):
        """Maintain connection with exponential backoff."""
        backoff = 1
        while self._running:
            if self.ws is None or self.ws.state.name != "OPEN":
                success = await self.connect()
                if success:
                    backoff = 1
                    self._receive_task = asyncio.create_task(self._receive_loop())
                else:
                    await asyncio.sleep(min(backoff, 60))
                    backoff *= 2
                    continue
            await asyncio.sleep(5)

    async def _receive_loop(self):
        """Listen for messages from the gateway."""
        try:
            async for raw in self.ws:
                try:
                    data = json.loads(raw)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    logger.warning("Non-JSON message from gateway")
        except websockets.exceptions.ConnectionClosed:
            logger.warning("Gateway connection closed, will reconnect...")
            self.ws = None
        except Exception as e:
            logger.error("Error in receive loop: %s", e)
            self.ws = None

    async def _handle_message(self, data: dict):
        """Route incoming messages."""
        msg_type = data.get("type")

        if msg_type == "res":
            # Response to a request
            req_id = data.get("id")
            if req_id and req_id in self._pending:
                future = self._pending.pop(req_id)
                if not future.done():
                    if data.get("ok"):
                        future.set_result(data.get("payload", {}))
                    else:
                        error = data.get("error", {})
                        future.set_exception(
                            Exception(f"Gateway error: {error.get('code')}: {error.get('message')}")
                        )

        elif msg_type == "event":
            event = data.get("event")
            payload = data.get("payload", {})

            if event == "chat":
                await self._handle_chat_event(payload)

    async def _handle_chat_event(self, payload: dict):
        """Process chat stream events (delta/final/aborted)."""
        session_key = payload.get("sessionKey", "")
        state = payload.get("state")

        if session_key not in self._active_chats:
            return

        chat = self._active_chats[session_key]

        if state == "delta":
            # Extract text from delta message
            message = payload.get("message", {})
            content = message.get("content", [])
            text = self._extract_text(content)
            if text and len(text) > len(chat.get("text", "")):
                chat["text"] = text

        elif state == "final":
            message = payload.get("message", {})
            content = message.get("content", [])
            text = self._extract_text(content)
            if text:
                chat["text"] = text

            task_id = chat["task_id"]
            result_text = chat.get("text", "")
            chat_type = chat.get("chat_type", "task")
            agent_id = chat.get("agent_id")
            self._active_chats.pop(session_key, None)
            await self._remove_active_chat(session_key)

            # Log token usage from the final message
            usage = message.get("usage") or payload.get("usage") or {}
            await self._log_token_usage(
                task_id=task_id,
                agent_name=chat.get("agent_name"),
                input_tokens=usage.get("input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0),
                model_provider=chat.get("model_provider", "unknown"),
                model_name=chat.get("model_name", "unknown"),
            )

            if chat_type == "mention" and agent_id:
                await self._process_mention_result(task_id, agent_id, result_text)
            else:
                await self._process_task_result(task_id, result_text, "completed")

        elif state in ("aborted", "error"):
            task_id = chat["task_id"]
            result_text = chat.get("text", "") or f"Task {state}"
            chat_type = chat.get("chat_type", "task")
            agent_id = chat.get("agent_id")
            self._active_chats.pop(session_key, None)
            await self._remove_active_chat(session_key)

            if chat_type == "mention" and agent_id:
                # For mentions, post whatever partial response we got (or skip if empty)
                if result_text and result_text != f"Task {state}":
                    await self._process_mention_result(task_id, agent_id, result_text)
                else:
                    logger.warning("Mention chat %s for task %d — no response to post", state, task_id)
            else:
                await self._process_task_result(task_id, result_text, "error")

    @staticmethod
    def _extract_text(content) -> str:
        """Extract text from message content blocks."""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
            return "\n".join(parts)
        return ""

    async def _log_token_usage(self, task_id: int, agent_name: str | None,
                               input_tokens: int, output_tokens: int,
                               model_provider: str = "unknown",
                               model_name: str = "unknown"):
        """Log token usage to the token_usage table."""
        if input_tokens == 0 and output_tokens == 0:
            return
        try:
            from app.models.token_usage import TokenUsage
            async with async_session() as db:
                task = (await db.execute(
                    select(Task).options(selectinload(Task.assigned_agent))
                    .where(Task.id == task_id)
                )).scalar_one_or_none()
                if not task:
                    return

                org_id = task.assigned_agent.org_id if task.assigned_agent else None
                if not org_id:
                    return

                usage = TokenUsage(
                    org_id=org_id,
                    agent_id=task.assigned_agent_id,
                    model_provider=model_provider or "unknown",
                    model_name=model_name or "unknown",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=input_tokens + output_tokens,
                    task_id=task_id,
                )
                db.add(usage)
                await db.commit()
                logger.info("Token usage: task=%d agent=%s tokens=%d (%s/%s)",
                            task_id, agent_name, input_tokens + output_tokens,
                            model_provider, model_name)
        except Exception as e:
            logger.warning("Failed to log token usage: %s", e)

    @staticmethod
    async def resolve_agent_model(db, agent: Agent, org_id: int) -> dict:
        """Resolve which model to use: agent override takes priority, else org default."""
        from app.models.organization_settings import OrganizationSettings
        if agent.model_provider and agent.model_name:
            return {"provider": agent.model_provider, "model": agent.model_name}
        settings = (await db.execute(
            select(OrganizationSettings).where(OrganizationSettings.org_id == org_id)
        )).scalar_one_or_none()
        if settings and settings.model_provider:
            return {"provider": settings.model_provider, "model": settings.model_name}
        return {"provider": "unknown", "model": "unknown"}

    async def dispatch_task(self, task: Task, agent: Agent) -> None:
        """Send a task to an agent via chat.send."""
        if not self.ws or self.ws.state.name != "OPEN":
            raise ConnectionError("Not connected to OpenClaw Gateway")

        gw_agent_id = self._agent_id_map.get(agent.name)
        if not gw_agent_id:
            raise ValueError(f"Agent '{agent.name}' not found in gateway")

        session_key = f"agent:{gw_agent_id}:main"
        idem_key = str(uuid.uuid4())

        # Resolve model and active skills for this agent
        model_info = {"provider": "unknown", "model": "unknown"}
        skill_context = ""
        if agent.org_id:
            try:
                async with async_session() as db:
                    model_info = await self.resolve_agent_model(db, agent, agent.org_id)

                    # Resolve active skills for this task context
                    from app.services.skill_service import SkillService
                    skill_svc = SkillService(db)
                    task_tags = task.tags if hasattr(task, "tags") and task.tags else None
                    active_skills = await skill_svc.resolve_active_skills(
                        agent.id,
                        board_id=task.board_id,
                        task_tags=task_tags,
                    )
                    skill_context = SkillService.build_skill_context(active_skills)
                    if active_skills:
                        logger.info(
                            "Injected %d skill(s) into task %d prompt for agent %s",
                            len(active_skills), task.id, agent.name,
                        )
            except Exception:
                pass

        # Format the task as a chat message
        prompt = self._build_task_prompt(task, skill_context=skill_context)

        # Track this chat (include model info for token usage logging)
        import time as _time
        chat_data = {
            "task_id": task.id,
            "text": "",
            "agent_name": agent.name,
            "chat_type": "task",
            "model_provider": model_info["provider"],
            "model_name": model_info["model"],
            "started_at": _time.time(),
        }
        self._active_chats[session_key] = chat_data
        await self._save_active_chat(session_key, chat_data)

        try:
            result = await self._request("chat.send", {
                "sessionKey": session_key,
                "message": prompt,
                "idempotencyKey": idem_key,
                "deliver": False,
            }, timeout=15)

            if result is None:
                self._active_chats.pop(session_key, None)
                await self._remove_active_chat(session_key)
                raise ConnectionError("chat.send request timed out")

            logger.info("Dispatched task %d to agent %s (session %s)",
                        task.id, agent.name, session_key)

        except Exception as e:
            self._active_chats.pop(session_key, None)
            await self._remove_active_chat(session_key)
            raise ConnectionError(f"Failed to dispatch: {e}")

    @staticmethod
    def _build_task_prompt(task: Task, *, skill_context: str = "") -> str:
        """Build a chat prompt from a task, injecting skills and analytics data."""
        parts = []

        # Inject active skills before the task (agent reads these as domain context)
        if skill_context:
            parts.append(skill_context)

        parts.append(f"## Task: {task.title}")
        if task.description:
            parts.append(f"\n{task.description}")
        parts.append(f"\nPriority: {task.priority}")
        parts.append("\nPlease complete this task and provide your result.")

        # Inject live analytics data for analytics-related agents
        try:
            from app.services.analytics import should_inject_analytics, fetch_analytics_context
            agent = task.assigned_agent
            if agent and should_inject_analytics(agent.name, task.board_id):
                analytics_ctx = fetch_analytics_context(days=7)
                if analytics_ctx:
                    parts.append(analytics_ctx)
                    logger.info("Injected analytics context into task %d prompt for agent %s",
                                task.id, agent.name)
        except Exception as e:
            logger.warning("Failed to inject analytics context: %s", e)

        return "\n".join(parts)

    async def _process_task_result(self, task_id: int, result_text: str, status: str):
        """Update task in database with the agent's result."""
        result_text = self._clean_markdown(result_text)
        async with async_session() as db:
            stmt = (
                select(Task)
                .options(selectinload(Task.assigned_agent))
                .where(Task.id == task_id)
            )
            task = (await db.execute(stmt)).scalar_one_or_none()
            if not task:
                logger.warning("Task %d not found for result update", task_id)
                return

            task.result = result_text
            # Fix 3: Agent completion always goes to "review" — never directly to "done"
            task.status = "review"
            task.updated_at = datetime.now(timezone.utc)

            if task.assigned_agent:
                task.assigned_agent.status = "online"
                # Publish agent status change event
                try:
                    from app.services.event_bus import publish_event as _publish
                    await _publish({
                        "type": "agent.status_changed",
                        "org_id": str(task.assigned_agent.org_id or "default"),
                        "data": {
                            "agent_id": str(task.assigned_agent.id),
                            "agent_name": task.assigned_agent.name,
                            "status": "online",
                        }
                    })
                except Exception:
                    pass

            agent_name = task.assigned_agent.name if task.assigned_agent else "Agent"
            org_id = task.assigned_agent.org_id if task.assigned_agent else None

            from app.models.board import Board as _Board
            from app.models.department import Department as _Dept
            activity_meta = {
                "status": status,
                "result_preview": result_text[:200] if result_text else None,
                "actor_name": agent_name,
                "task_title": task.title,
            }
            board = (await db.execute(select(_Board).where(_Board.id == task.board_id))).scalar_one_or_none()
            if board:
                activity_meta["board_name"] = board.name
                activity_meta["board_id"] = board.id
                dept = (await db.execute(select(_Dept).where(_Dept.id == board.department_id))).scalar_one_or_none()
                if dept:
                    activity_meta["department_id"] = dept.id
                    activity_meta["department_name"] = dept.name

            db.add(ActivityLog(
                org_id=org_id,
                actor_type="agent",
                actor_id=task.assigned_agent_id,
                action="task.submitted_for_review" if status != "error" else "task.failed",
                entity_type="task",
                entity_id=task.id,
                details=activity_meta,
            ))

            await db.commit()
            logger.info("Task %d result saved, status -> %s", task_id, task.status)

            # Send notifications
            try:
                from app.services.notifications import create_notification
                agent_name = task.assigned_agent.name if task.assigned_agent else "Agent"

                if status == "error":
                    # Notify all admins about agent error
                    admins = (await db.execute(select(User).where(User.role == "admin"))).scalars().all()
                    for admin in admins:
                        await create_notification(
                            db, admin.id, "agent_error", "Agent error",
                            f"{agent_name} encountered an error on '{task.title}'",
                            target_type="task", target_id=task.id, org_id=task.assigned_agent.org_id if task.assigned_agent else None,
                        )
                    await db.commit()
                else:
                    # Task submitted for review → notify creator + admins
                    recipients = set()
                    if task.created_by_user_id:
                        recipients.add(task.created_by_user_id)
                    admins = (await db.execute(select(User).where(User.role == "admin"))).scalars().all()
                    for admin in admins:
                        recipients.add(admin.id)
                    for uid in recipients:
                        await create_notification(
                            db, uid, "task_review", "Task ready for review",
                            f"{agent_name} submitted '{task.title}' for review",
                            target_type="task", target_id=task.id, org_id=task.assigned_agent.org_id if task.assigned_agent else None,
                        )
                    await db.commit()
            except Exception as e:
                logger.warning("Failed to send task result notifications: %s", e)

    async def send_mention_chat(self, agent: Agent, task: Task, comment_content: str) -> None:
        """Send a mention-triggered chat to an agent. The response is posted as a comment."""
        if not self.ws or self.ws.state.name != "OPEN":
            raise ConnectionError("Not connected to OpenClaw Gateway")

        gw_agent_id = self._agent_id_map.get(agent.name)
        if not gw_agent_id:
            raise ValueError(f"Agent '{agent.name}' not found in gateway")

        session_key = f"agent:{gw_agent_id}:main"

        # If agent has a stale active chat (>5 min), clear it
        if session_key in self._active_chats:
            import time
            chat_start = self._active_chats[session_key].get("started_at", 0)
            if time.time() - chat_start > 300:  # 5 minutes
                logger.warning("Clearing stale active chat for agent %s (>5min)", agent.name)
                self._active_chats.pop(session_key, None)
                await self._remove_active_chat(session_key)
            else:
                logger.warning("Agent %s already has active chat, skipping mention", agent.name)
                return

        prompt = (
            f"You were @mentioned in a comment on a task.\n\n"
            f"TASK: {task.title}\n"
            f"DESCRIPTION: {task.description or 'N/A'}\n"
            f"CURRENT STATUS: {task.status}\n"
        )
        if task.result:
            prompt += f"CURRENT RESULT: {task.result[:500]}...\n"
        prompt += (
            f"\nCOMMENT:\n{comment_content}\n\n"
            f"Respond to this comment helpfully. Your response will be posted as a comment on the task."
        )

        idem_key = str(uuid.uuid4())

        # Track this chat as a mention (not a task dispatch)
        import time as _time
        chat_data = {
            "task_id": task.id,
            "agent_id": agent.id,
            "text": "",
            "agent_name": agent.name,
            "chat_type": "mention",
            "started_at": _time.time(),
        }
        self._active_chats[session_key] = chat_data
        await self._save_active_chat(session_key, chat_data)

        try:
            result = await self._request("chat.send", {
                "sessionKey": session_key,
                "message": prompt,
                "idempotencyKey": idem_key,
                "deliver": False,
            }, timeout=15)

            if result is None:
                self._active_chats.pop(session_key, None)
                await self._remove_active_chat(session_key)
                raise ConnectionError("chat.send request timed out")

            logger.info("Mention chat sent to agent %s for task %d", agent.name, task.id)

        except Exception as e:
            self._active_chats.pop(session_key, None)
            await self._remove_active_chat(session_key)
            raise ConnectionError(f"Failed to send mention chat: {e}")

    @staticmethod
    def _clean_markdown(text: str) -> str:
        """Strip markdown bold/italic markers that don't render in plain text comments."""
        # **bold** -> bold, *italic* -> italic, __bold__ -> bold, _italic_ -> italic
        cleaned = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        cleaned = re.sub(r'__(.+?)__', r'\1', cleaned)
        # Don't strip single * or _ as they're used in normal text
        return cleaned

    async def _process_mention_result(self, task_id: int, agent_id: int, result_text: str):
        """Post the agent's mention response as a comment on the task."""
        result_text = self._clean_markdown(result_text)
        async with async_session() as db:
            # Resolve agent name for display
            agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
            agent_name = agent.name if agent else "Agent"

            # Resolve task for metadata
            task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()

            comment = Comment(
                task_id=task_id,
                author_type="agent",
                author_id=agent_id,
                content=result_text,
                mentions=None,
            )
            db.add(comment)

            meta = {
                "trigger": "mention",
                "actor_name": agent_name,
                "task_title": task.title if task else "",
            }
            if task:
                meta["board_id"] = task.board_id

            db.add(ActivityLog(
                org_id=agent.org_id if agent else None,
                actor_type="agent",
                actor_id=agent_id,
                action="comment.added",
                entity_type="task",
                entity_id=task_id,
                details=meta,
            ))
            await db.commit()

            # Publish WebSocket event so frontend auto-refreshes comments
            try:
                from app.services.event_bus import publish_event
                await publish_event({
                    "type": "comment.added",
                    "org_id": str(agent.org_id if agent else "default"),
                    "data": {
                        "actor_type": "agent",
                        "actor_id": str(agent_id),
                        "actor_name": agent_name,
                        "target_type": "task",
                        "target_id": str(task_id),
                        "metadata": meta,
                    }
                })
            except Exception as e:
                logger.warning("Failed to publish comment event: %s", e)

            logger.info("Agent %s mention response posted as comment on task %d", agent_name, task_id)

    @property
    def is_connected(self) -> bool:
        return self.ws is not None and self.ws.state.name == "OPEN"


    async def sync_model_config_from_db(self):
        """If MODEL_API_KEY env var is empty, read model config from org_settings
        and write it to the openclaw.json config file for the gateway."""
        import os
        if os.environ.get("MODEL_API_KEY"):
            logger.info("MODEL_API_KEY set in env — skipping DB model config sync")
            return

        try:
            from app.core.encryption import decrypt_value
            async with async_session() as db:
                settings_row = (await db.execute(
                    select(OrganizationSettings).limit(1)
                )).scalar_one_or_none()
                if not settings_row or not settings_row.model_api_key_encrypted:
                    logger.info("No model config in DB — gateway will wait for onboarding")
                    return

                provider = settings_row.model_provider or "moonshot"
                model_name = settings_row.model_name or "kimi-k2.5"
                api_key = decrypt_value(settings_row.model_api_key_encrypted)
                base_url = settings_row.model_base_url or ""
                display_name = settings_row.model_display_name or model_name
                context_window = settings_row.model_context_window or 256000
                max_tokens = settings_row.model_max_tokens or 8192

            # Determine API type and key env name from provider
            from app.services.model_providers import get_provider_config
            provider_config = get_provider_config(provider)
            api_type = provider_config.get("api_type", "openai-completions")
            if not base_url:
                base_url = provider_config.get("base_url", "")

            # Map provider to env var name for the API key
            key_env_map = {
                "moonshot": "MOONSHOT_API_KEY",
                "openai": "OPENAI_API_KEY",
                "anthropic": "ANTHROPIC_API_KEY",
                "nvidia": "NVIDIA_API_KEY",
                "kimi_code": "KIMI_API_KEY",
                "custom": "CUSTOM_API_KEY",
            }
            api_key_env = key_env_map.get(provider, "CUSTOM_API_KEY")

            # Write/update openclaw.json
            config_path = "/home/helix/.openclaw/openclaw.json"
            config = {}
            if os.path.exists(config_path):
                try:
                    with open(config_path) as f:
                        config = json.load(f)
                except (json.JSONDecodeError, Exception):
                    config = {}

            # Update env section with API key
            if "env" not in config:
                config["env"] = {}
            config["env"][api_key_env] = api_key

            # Update models section
            config["models"] = {
                "mode": "merge",
                "providers": {
                    provider: {
                        "baseUrl": base_url,
                        "apiKey": f"${{{api_key_env}}}",
                        "api": api_type,
                        "models": [{
                            "id": model_name,
                            "name": display_name,
                            "reasoning": False,
                            "input": ["text"],
                            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
                            "contextWindow": context_window,
                            "maxTokens": max_tokens,
                        }],
                    }
                },
            }

            # Update agent defaults
            if "agents" not in config:
                config["agents"] = {}
            if "defaults" not in config["agents"]:
                config["agents"]["defaults"] = {}
            config["agents"]["defaults"]["model"] = {"primary": f"{provider}/{model_name}"}

            with open(config_path, "w") as f:
                json.dump(config, f, indent=2)

            logger.info("Synced model config from DB to openclaw.json: %s/%s", provider, model_name)

        except Exception as e:
            logger.warning("Failed to sync model config from DB: %s", e)


# Singleton instance
gateway = OpenClawGateway()
