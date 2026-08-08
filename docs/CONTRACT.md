# Frontend contract (frozen)

Person A and Person B share these shapes. Required fields must not be renamed.

## Chat response

`POST /api/conversations/:id/message`

```ts
{
  message: {
    id: string
    role: "assistant"
    content: string
    createdAt: string // ISO
  }
  prospect: {
    stage: string
    summary: string
    currentStack: string[]
    painPoints: string[]
    requirements: string[]
    objections: string[]
    nextAction: string
  }
  events: Array<{ type: AgentEventType; label: string }>
  escalation?: {
    id: string
    question: string
    reason: string
    priority: string
  }
}
```

## Agent event types

- `searching_knowledge`
- `searching_web`
- `using_tool`
- `generating_image`
- `prospect_updated`
- `needs_human`

## Knowledge source

```ts
{
  id: string
  title: string
  type: "file" | "paste" | "url" | "mcp"
  status: "processing" | "ready" | "error"
}
```

## Voice token

`GET /api/voice/token?conversationId=`

Returns `token`, `session.instructions` (full FDE + prospect memory), `context.prospect.currentStack`, `realtimeUrl`.

Person A uses this for browser WebSocket to xAI Realtime.
