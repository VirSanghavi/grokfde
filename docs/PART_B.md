# Part B — Intelligence & Server

Owns:

- `src/app/api/**`
- `src/lib/ai/**`
- `src/lib/server/**`
- `src/lib/email/**`
- `supabase/**`
- `docs/**`

Does **not** own UI, mock layer, or (normally) `package.json`. This branch includes a minimal Next bootstrap so the API half is independently runnable when the shared repo starts empty.

## Architecture

```
Browser / curl
    ↓
Next.js App Router API routes
    ↓
lib/server/*  (context, memory merge, permissions)
    ↓
lib/ai/grok.ts  (only place that talks to xAI)
    ↓
xAI: Responses/Chat · Files · Collections · Voice client_secrets · Imagine
    ↓
Supabase Postgres (app state + metadata)
```

## Magic moment path

1. Prospect chats stack facts → `memory_json` updated (merge, never clobber)
2. `GET /api/voice/token` embeds same memory in `session.instructions`
3. Call ends → `POST /api/calls/complete` merges transcript into same `memory_json`
4. Next chat continues without re-asking

## Demo MCP

`serverUrl: "demo://grok-fde"` registers local tools executed server-side:

- `create_sandbox`
- `estimate_cost`
- `list_capabilities`
- `generate_config`

Real remote MCP URLs are passed through to xAI `tools: [{ type: "mcp", ... }]` with write/high-risk filtering.
