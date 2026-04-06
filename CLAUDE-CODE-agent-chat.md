# Claude Code Task: Agent Chat — Real-Time Conversations + Multi-Channel Messaging

Read CODEBASE-CONTEXT.md first.

## Overview

Add a real-time chat feature to HELIX Mission Control. Users can have conversations with AI agents directly — through the HELIX UI, WhatsApp, Telegram, Discord, or Slack. All messages are logged, traced, and budget-tracked. Access follows board permissions (same as task access).

This is a v1.4.0 feature. Build in phases — each phase is independently deployable.

---

## Phase 1: Chat in HELIX UI

### Database: New Tables

**conversations** — id (UUID PK), org_id (FK organizations NOT NULL), agent_id (FK agents NOT NULL), user_id (FK users NOT NULL — who started the conversation), board_id (FK boards — for permission checking), title (VARCHAR 200 — auto-generated from first message or user-set), channel (VARCHAR 20 DEFAULT 'web' — web|telegram|whatsapp|discord|slack), channel_thread_id (VARCHAR 200 nullable — external thread/chat ID for channel mapping), status (VARCHAR 20 DEFAULT 'active' — active|archived|closed), message_count (INT DEFAULT 0), last_message_at (TIMESTAMP), created_at, updated_at. Indexes: org_id, agent_id, user_id, channel+channel_thread_id

**conversation_messages** — id (UUID PK), conversation_id (FK conversations CASCADE NOT NULL), role (VARCHAR 20 — user|assistant|system), content (TEXT NOT NULL), channel_message_id (VARCHAR 200 nullable — external message ID), metadata (JSONB nullable — token counts, cost, trace_id, attachments), created_at. Index: conversation_id+created_at

### Backend: New Files

**`backend/app/models/conversation.py`**
- SQLAlchemy models for conversations and conversation_messages
- Relationships: conversation.agent, conversation.user, conversation.board, conversation.messages

**`backend/app/schemas/conversation.py`**
- ConversationCreate: agent_id (required), board_id (optional — defaults to agent's primary_board_id), title (optional)
- ConversationOut: all fields + agent_name, user_name, last_message preview
- ConversationMessageOut: all fields
- ConversationList: paginated list with unread indicators
- ChatRequest: content (required), conversation_id (optional — creates new if not provided)
- ChatResponse: message (ConversationMessageOut), conversation_id

**`backend/app/services/chat_service.py`**
Core chat logic:
- `create_conversation(org_id, agent_id, user_id, board_id, channel, title)` — creates conversation, checks board permissions
- `send_message(conversation_id, content, user_id)` — saves user message, dispatches to OpenClaw, streams response, saves assistant message, logs token usage
- `get_conversations(org_id, user_id, agent_id?, channel?)` — list conversations (filtered by board permissions)
- `get_messages(conversation_id, user_id, limit, before)` — paginated message history (permission-checked)
- `archive_conversation(conversation_id, user_id)` — soft archive
- `get_or_create_conversation(org_id, agent_id, user_id, channel, channel_thread_id)` — for channel integrations

**Chat dispatch to OpenClaw:**
- Build conversation context: system prompt (agent's system_prompt) + skills (resolve_active_skills) + goal context (if agent has linked goals) + message history (last N messages for context window)
- Send to OpenClaw gateway via WebSocket (same pattern as task dispatch but conversational — no task creation)
- Stream response back to frontend via SSE or WebSocket
- Log token usage to token_usage_log (same as task execution — budget tracking applies)
- Create execution trace (optional — configurable per conversation)

**`backend/app/routers/chat.py`**
Endpoints:
- `POST /api/chat` — Send message (creates conversation if needed). Body: `{ agent_id, content, conversation_id? }`. Returns streamed SSE response.
- `GET /api/conversations` — List user's conversations. Query: `agent_id?`, `channel?`, `limit?`, `offset?`
- `GET /api/conversations/{id}` — Get conversation detail with recent messages
- `GET /api/conversations/{id}/messages` — Paginated message history. Query: `limit?`, `before?`
- `PATCH /api/conversations/{id}` — Update title, archive
- `DELETE /api/conversations/{id}` — Delete conversation (admin only)
- `POST /api/chat/stream` — SSE streaming endpoint for real-time responses

**Permission enforcement:**
- All endpoints check board permissions via the conversation's board_id
- User must have at least `view` permission on the agent's primary board to start a conversation
- Admin bypasses all permission checks (same as task system)

### Backend: Modified Files

**`backend/app/main.py`**
- CREATE TABLE conversations, conversation_messages
- Register chat router

**`backend/app/services/gateway.py`**
- Add `chat_with_agent(agent, messages, skills, goal_context)` method — similar to dispatch_task but returns streaming response instead of writing to task result
- Reuse existing OpenClaw WebSocket connection
- Token counting and cost estimation on response

**`backend/app/services/budget_service.py`**
- Chat messages consume budget (same as task execution)
- Check budget before sending message, update after response

### Frontend: New Files

**`frontend/src/app/chat/page.tsx`**
- Chat page with conversation list sidebar + chat window
- Layout: left sidebar (conversation list, new chat button) + right panel (messages + input)
- Similar to modern chat apps (ChatGPT/Claude style)
- Real-time streaming via SSE (EventSource)
- Auto-scroll, loading indicators, typing animation for agent responses
- Agent avatar + name in header
- Markdown rendering for agent responses (reuse existing task result renderer)

**`frontend/src/app/chat/layout.tsx`**
- Layout with Sidebar component (same pattern as other pages)

**`frontend/src/components/chat/chat-window.tsx`**
- Main chat component: message list + input box
- SSE streaming for real-time agent response
- Message bubbles: user (right, blue), agent (left, themed)
- Timestamps, copy button on messages
- File attachment support (future)

**`frontend/src/components/chat/conversation-list.tsx`**
- List of conversations in sidebar
- Agent avatar, last message preview, timestamp
- New conversation button (opens agent picker)
- Search/filter conversations
- Active conversation highlighted

**`frontend/src/components/chat/agent-picker.tsx`**
- Modal/dropdown to select an agent to chat with
- Shows agents the user has board access to
- Agent status indicator (online/offline)
- Quick-start: click agent → creates conversation → opens chat

### Frontend: Modified Files

**`frontend/src/components/sidebar.tsx`**
- Add "Chat" nav item with MessageCircle icon, between Dashboard and Boards
- Badge showing unread message count (optional)

**`frontend/src/app/agents/[id]/page.tsx`**
- Add "Chat with Agent" button on agent detail page
- Opens /chat with this agent pre-selected

**`frontend/src/lib/api.ts`**
- Add chat API methods: sendMessage, getConversations, getConversation, getMessages, updateConversation, deleteConversation
- Add SSE stream helper for chat responses
- Add Conversation, ConversationMessage types

### Streaming Implementation

Use Server-Sent Events (SSE) for streaming agent responses:

```typescript
// Frontend: SSE streaming
const eventSource = new EventSource(`/api/chat/stream?conversation_id=${id}`);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'token') {
    // Append token to current message
    setCurrentResponse(prev => prev + data.content);
  } else if (data.type === 'done') {
    // Message complete
    eventSource.close();
  } else if (data.type === 'error') {
    // Handle error
    eventSource.close();
  }
};
```

```python
# Backend: SSE endpoint
@router.post("/api/chat")
async def chat(request: ChatRequest, user = Depends(get_current_user)):
    # ... permission checks, budget checks ...
    
    async def generate():
        async for token in gateway.chat_with_agent(agent, messages):
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'message_id': msg_id})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## Phase 2: Telegram Chat Integration

### Overview
Extend existing Telegram integration from task-based to conversational. Users can chat with agents via Telegram — each Telegram chat maps to a HELIX conversation.

### Backend: New/Modified Files

**`backend/app/services/telegram_chat.py`**
- Handle incoming Telegram messages
- Map Telegram chat_id to HELIX conversation (get_or_create_conversation with channel='telegram', channel_thread_id=chat_id)
- Route message to agent via chat_service
- Send agent response back to Telegram
- Support `/agent <name>` command to switch agents
- Support `/agents` command to list available agents
- Support `/history` to show recent conversation
- Support `/new` to start new conversation

**`backend/app/services/telegram_notify.py`** (modify)
- Add message handler for conversational mode (not just command mode)
- Detect if message is a command (starts with /) or a chat message
- Chat messages go to the active conversation's agent

**`backend/app/routers/telegram.py`** (modify or create)
- Webhook endpoint for Telegram Bot API
- Route incoming updates to telegram_chat service

### User Flow
1. User sends message to Telegram bot
2. If no active conversation: bot asks "Which agent?" with inline keyboard of available agents
3. User selects agent → conversation created
4. Subsequent messages go to that agent
5. Agent responds via Telegram
6. `/agent Marketing Writer` switches to different agent
7. All messages logged in HELIX conversation history
8. Visible in HELIX UI Chat page (channel: telegram)

---

## Phase 3: WhatsApp Integration

### Overview
Use WhatsApp Business API (via Twilio or Meta's Cloud API) to enable agent conversations over WhatsApp.

### Backend: New Files

**`backend/app/services/whatsapp_service.py`**
- WhatsApp Business API client (Meta Cloud API or Twilio)
- Handle incoming messages via webhook
- Map phone number to HELIX user (lookup by phone or create temporary session)
- Route to agent conversation via chat_service
- Send agent responses back via WhatsApp API
- Handle media messages (images, documents)

**`backend/app/routers/whatsapp.py`**
- `POST /api/webhooks/whatsapp` — incoming message webhook
- `GET /api/webhooks/whatsapp` — webhook verification (Meta requires this)
- Webhook signature verification for security

### Configuration
New org settings fields:
- `whatsapp_enabled` (bool)
- `whatsapp_phone_number_id` (from Meta Business)
- `whatsapp_access_token_encrypted` (Fernet encrypted)
- `whatsapp_verify_token` (for webhook verification)
- `whatsapp_default_agent_id` (which agent handles WhatsApp by default)

### Settings UI
New section in Settings: "WhatsApp Integration"
- Enable/disable toggle
- Phone Number ID input
- Access Token input (masked)
- Default agent selector
- Webhook URL display (for Meta Business setup)
- Test connection button

---

## Phase 4: Discord Integration

### Backend: New Files

**`backend/app/services/discord_service.py`**
- Discord bot using discord.py or direct API calls
- Map Discord channel/thread to HELIX conversation
- Route messages to agents via chat_service
- Bot commands: `/helix chat <agent>`, `/helix agents`, `/helix new`
- Support server-specific agent assignment (different Discord channels → different agents)

**`backend/app/routers/discord.py`**
- Discord interaction webhook endpoint
- Slash command registration

### Configuration
New org settings fields:
- `discord_enabled` (bool)
- `discord_bot_token_encrypted`
- `discord_guild_id`
- `discord_channel_agent_mapping` (JSONB — map channel IDs to agent IDs)

---

## Phase 5: Slack Integration

### Backend: New Files

**`backend/app/services/slack_service.py`**
- Slack app using Slack Events API
- Map Slack channel/thread to HELIX conversation
- Support DM with bot and channel mentions
- Slash commands: `/helix chat <agent>`, `/helix agents`
- Thread-based conversations (each Slack thread = one HELIX conversation)

**`backend/app/routers/slack.py`**
- `POST /api/webhooks/slack/events` — Slack Events API endpoint
- `POST /api/webhooks/slack/commands` — Slash command handler
- `POST /api/webhooks/slack/interactions` — Interactive message handler
- Request signature verification

### Configuration
New org settings fields:
- `slack_enabled` (bool)
- `slack_bot_token_encrypted`
- `slack_signing_secret_encrypted`
- `slack_app_id`
- `slack_default_agent_id`

---

## Shared Architecture

### Channel Abstraction Layer

**`backend/app/services/channel_manager.py`**
Abstract base for all channels:

```python
class ChannelHandler(ABC):
    @abstractmethod
    async def send_message(self, conversation: Conversation, content: str) -> str:
        """Send message to external channel. Returns channel_message_id."""
        pass
    
    @abstractmethod
    async def handle_incoming(self, raw_payload: dict) -> ChatRequest:
        """Parse incoming webhook payload into ChatRequest."""
        pass

class WebChannelHandler(ChannelHandler): ...
class TelegramChannelHandler(ChannelHandler): ...
class WhatsAppChannelHandler(ChannelHandler): ...
class DiscordChannelHandler(ChannelHandler): ...
class SlackChannelHandler(ChannelHandler): ...
```

### Message Flow (All Channels)

```
User sends message (any channel)
    ↓
Channel webhook/UI receives message
    ↓
channel_manager.handle_incoming() → ChatRequest
    ↓
Permission check (board access)
    ↓
Budget check (agent token budget)
    ↓
chat_service.send_message()
    ↓
Build context (system_prompt + skills + goals + history)
    ↓
gateway.chat_with_agent() → streaming response
    ↓
Save assistant message to conversation_messages
    ↓
Log token usage
    ↓
channel_manager.send_message() → deliver to channel
    ↓
Update conversation (message_count, last_message_at)
```

### Settings UI: Integrations Page

**`frontend/src/app/settings/integrations/page.tsx`**
- New settings page showing all channel integrations
- Cards for each channel: Telegram, WhatsApp, Discord, Slack
- Each card: enable/disable, configure, test connection, status indicator
- Connected channels show green dot, disconnected show gray

### Plan Gating

- Web chat: available on all plans (Starter+)
- Telegram chat: Pro+ (already gated)
- WhatsApp: Scale+ (requires WhatsApp Business API costs)
- Discord: Pro+
- Slack: Pro+

---

## Implementation Priority

Build in this order:

1. **Database tables** (conversations, conversation_messages) — foundation for everything
2. **chat_service.py + chat router** — core chat logic
3. **Frontend chat UI** — /chat page with conversation list + chat window
4. **Agent detail "Chat" button** — quick entry point
5. **Telegram conversational mode** — extend existing integration
6. **Channel abstraction layer** — prepare for WhatsApp/Discord/Slack
7. **WhatsApp integration**
8. **Discord integration**
9. **Slack integration**
10. **Settings integrations page**

## Build Scope for This Session

Given the scope, focus on **items 1-5** (database, core chat, UI, Telegram chat). Items 6-10 can be a follow-up session.

If time is limited, at minimum build **items 1-4** (database, core chat, UI, agent chat button). This gives a working chat feature in the HELIX UI.

---

## Design Notes

- Chat page dark theme matches existing HELIX UI
- Agent responses render markdown (code blocks, lists, bold, etc.)
- Message input: multi-line textarea, Shift+Enter for newline, Enter to send
- Streaming animation: blinking cursor while agent is thinking
- Conversation titles auto-generated from first user message (first 50 chars)
- Sidebar shows "Chat" with MessageCircle icon between Dashboard and Boards
- Mobile responsive: conversation list collapses to drawer on mobile

## Important Constraints

- helix user has no sudo
- Docker env vars must be explicit in docker-compose.yml
- Budget tracking applies to chat (same as task execution)
- Board permissions enforced (default-closed model)
- All messages stored in helix_mc database (org-scoped)
- OpenClaw gateway connection reused (same WebSocket pattern as task dispatch)

## After Completion

Update CODEBASE-CONTEXT.md:
- Add conversations and conversation_messages to Section 3 (Database Schema)
- Add chat_service, channel_manager to Section 5 (Backend Services)
- Add chat page to Section 6b (Frontend Additions)
- Add to Recent Changes

Then:
```bash
cd ~/helix-mission-control
git add -A && git commit -m "feat: agent chat — real-time conversations in HELIX UI with multi-channel foundation" && git push
docker compose up -d --build backend frontend
```

For staging:
```bash
cd ~/helix-staging
# cherry-pick or merge from main
git add -A && git commit -m "feat: agent chat" && git push
docker compose up -d --build backend frontend
```
