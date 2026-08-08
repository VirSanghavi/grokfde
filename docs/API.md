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
