# Environment variables (Part B)

Copy `.env.example` → `.env.local`. **Never commit real values** (this repo is open source).

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # publishable or legacy anon
SUPABASE_SERVICE_ROLE_KEY=       # server routes (secret / service_role)

XAI_API_KEY=                     # required for live Grok
XAI_MANAGEMENT_API_KEY=          # optional; Collections create/add document
XAI_TEXT_MODEL=grok-4.5
XAI_VOICE_MODEL=grok-voice-latest
XAI_IMAGE_MODEL=grok-imagine-image
XAI_VIDEO_MODEL=grok-imagine-video

EMAIL_API_KEY=                   # optional Resend
EMAIL_FROM=atlas@yourdomain.com
RESEND_API_KEY=

NEXT_PUBLIC_MOCK_AI=false        # Person A mock UI; Part B ignores
```

## Notes

- Without a valid `XAI_MANAGEMENT_API_KEY`, company creation still works. Knowledge uploads use xAI **Files**; chat attaches those file IDs. Structured summary still lands in Supabase.
- Without `XAI_API_KEY`, chat uses grounded heuristics from `knowledge_summary_json`.
- Without email keys, outbound email is mock-logged and still persisted as messages.
- If keys were shared in chat or screenshots, rotate them before publishing the repo. See `SECURITY.md`.
