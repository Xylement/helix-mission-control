import logging

from fastapi import WebSocket

logger = logging.getLogger("helix.websocket")


class ConnectionManager:
    def __init__(self):
        # Dict of org_id → set of (user_id, WebSocket) connections
        # Using "default" org for connections without org_id
        self.active_connections: dict[str, set] = {}

    async def connect(self, org_id: str, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if org_id not in self.active_connections:
            self.active_connections[org_id] = set()
        self.active_connections[org_id].add((user_id, websocket))
        logger.info("WebSocket connected: user=%s org=%s", user_id, org_id)

    async def disconnect(self, org_id: str, user_id: str, websocket: WebSocket):
        if org_id in self.active_connections:
            self.active_connections[org_id].discard((user_id, websocket))
            if not self.active_connections[org_id]:
                del self.active_connections[org_id]
        logger.info("WebSocket disconnected: user=%s org=%s", user_id, org_id)

    async def broadcast_to_org(self, org_id: str, event: dict):
        """Send event to all connected users in an org."""
        if org_id not in self.active_connections:
            return
        dead = []
        for user_id, ws in self.active_connections[org_id]:
            try:
                await ws.send_json(event)
            except Exception:
                dead.append((user_id, ws))
        for conn in dead:
            self.active_connections[org_id].discard(conn)

    async def send_to_user(self, org_id: str, user_id: str, event: dict):
        """Send event to a specific user (for notifications)."""
        if org_id not in self.active_connections:
            return
        dead = []
        for uid, ws in self.active_connections[org_id]:
            if uid == user_id:
                try:
                    await ws.send_json(event)
                except Exception:
                    dead.append((uid, ws))
        for conn in dead:
            self.active_connections[org_id].discard(conn)

    @property
    def connection_count(self) -> int:
        return sum(len(conns) for conns in self.active_connections.values())


manager = ConnectionManager()
