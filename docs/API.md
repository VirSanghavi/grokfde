# Grok FDE — Part B API

Base URL: `http://localhost:3000`

All errors:

```json
{
  "error": {
    "code": "KNOWLEDGE_INGESTION_FAILED",
    "message": "…",
    "recoverable": true
  }
}
```

## Health

`GET /api/health`

## Company

`POST /api/company`

```json
{ "name": "Grok FDE", "slug": "grok-fde", "agentName": "Atlas" }
```

`GET /api/company?id=…`  
`GET /api/company?slug=grok-fde`  
`GET /api/company`

## Knowledge

`POST /api/knowledge/paste`

```json
{
  "companyId": "uuid",
  "title": "Product Overview",
  "content": "…"
}
```

`POST /api/knowledge/upload` — multipart `companyId`, `title`, `file` **or** JSON `{ companyId, title, content }`

`POST /api/knowledge/url`

```json
{ "companyId": "uuid", "url": "https://…", "title": "Docs" }
```

Knowledge source shape (frozen):

```json
{ "id": "…", "title": "…", "type": "file|paste|url|mcp", "status": "processing|ready|error" }
```

## MCP

`POST /api/mcp`

```json
{
  "companyId": "uuid",
  "label": "Demo Tools",
  "serverUrl": "demo://grok-fde",
  "allowWrite": true
}
```

`GET /api/mcp?companyId=…`

Use `demo://grok-fde` for built-in tools: `create_sandbox`, `estimate_cost`, `list_capabilities`, `generate_config`.

## Prospects & conversations

`POST /api/prospects` — create prospect (+ conversation by default)

`POST /api/conversations` — open/resume session

```json
{
  "companySlug": "grok-fde",
  "companyName": "Globex",
  "personName": "Judge"
}
```

`GET /api/conversations?companyId=…`  
`GET /api/conversations/:id`  
`GET /api/prospects/:id`  
`PATCH /api/prospects/:id`

## Chat (frozen response shape)

`POST /api/conversations/:id/message`

```json
{ "message": "We use Kubernetes on AWS." }
```

```json
{
  "message": {
    "id": "…",
    "role": "assistant",
    "content": "…",
    "createdAt": "…"
  },
  "prospect": {
    "stage": "technical-evaluation",
    "summary": "…",
    "currentStack": ["Kubernetes", "AWS"],
    "painPoints": [],
    "requirements": [],
    "objections": [],
    "nextAction": ""
  },
  "events": [
    { "type": "searching_knowledge", "label": "Searching company knowledge" }
  ]
}
```

Event types: `searching_knowledge` | `searching_web` | `using_tool` | `generating_image` | `prospect_updated` | `needs_human`

## Voice

`GET /api/voice/token?conversationId=…`  
`POST /api/voice/token` `{ "conversationId": "…" }`

Returns ephemeral token + `session.instructions` (same FDE + prospect memory) + `realtimeUrl` for browser WebSocket.

## Call completion

`POST /api/calls/complete`

```json
{
  "conversationId": "…",
  "transcript": "…",
  "startedAt": "…",
  "endedAt": "…"
}
```

Merges into prospect memory; writes call + timeline messages.

## Assets

`POST /api/assets/architecture` `{ "conversationId": "…" }`  
`POST /api/assets/image` `{ "conversationId": "…", "style": "technical"|"executive" }`  
`POST /api/assets/video` `{ "conversationId": "…" }` (optional)

## Email

`POST /api/email/send` `{ "conversationId", "to?", "subject?", "body?", "generate?" }`  
`POST /api/email/inbound` `{ "to", "from", "subject?", "text", "companyId?" | "companySlug?" }`

## Escalations

`GET /api/escalations?companyId=…&status=open`  
`PATCH /api/escalations` `{ "id", "status": "resolved"|"dismissed"|"open" }`

## Customer workspaces (implementation)

`POST /api/workspaces` `{ prospectId, conversationId? }`  
`GET /api/workspaces?prospectId=`  
`GET /api/workspaces/:id`  

`POST /api/workspaces/:id/repositories` `{ provider: "demo"|"github", repository? }`  
`POST /api/workspaces/:id/analyze`  
`POST /api/workspaces/:id/plan` `{ objective? }`  
`POST /api/workspaces/:id/build` `{ planId }`  

`GET /api/implementation-runs/:id`  
`POST /api/implementation-runs/:id/pull-request`

Safe defaults: branch off main, max 8 files, no deletes, protected path denylist, static VALIDATED checks (not claimed as full runtime TESTED unless a sandbox runner is configured).

## Accounts + Slack lifecycle (Pass 3)

`POST /api/accounts` `{ prospectId, workspaceId?, conversationId? }`  
`GET /api/accounts?companyId=`  
`GET /api/accounts/:id` — full snapshot  
`GET /api/accounts/:id/status` — deterministic status + natural text  
`GET /api/accounts/:id/timeline` — unified cross-channel timeline  
`GET|POST /api/accounts/:id/deployment`  
`GET|POST|PATCH /api/accounts/:id/blockers`  
`GET|POST /api/accounts/:id/decisions`  
`GET|POST|PATCH /api/accounts/:id/issues`  
`GET /api/accounts/:id/slack`

`GET /api/slack/install`  
`GET /api/slack/oauth/callback`  
`POST /api/slack/connect-channel` `{ accountId, channelId, channelName?, teamId? }`  
`POST /api/slack/events` — Slack Events API (+ url_verification)

`POST /api/demo/slack-message` — same processor as real Slack (dev/demo)  
`GET|POST /api/field-signals`

Same FDE identity as chat/voice. Slack replies primarily on @mentions. Tokens never returned in API responses.
