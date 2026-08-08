# Open source notes (Part B)

## What is safe to publish

- All source under `src/app/api/**`, `src/lib/**`, `supabase/migrations/**`, `docs/**`
- `.env.example` (placeholders only)
- `package.json` / lockfile
- Seed product docs under `docs/seed/`

## What must never be published

- `.env.local` or any real keys
- Supabase dashboard dumps containing secrets
- Recorded demos that flash API keys on screen

## Setup for contributors

```bash
cp .env.example .env.local
# fill keys locally
npm install
npm run dev
bash docs/smoke-test.sh
```

## Architecture boundary

| Owner | Paths |
|-------|--------|
| Person B (this half) | `src/app/api/**`, `src/lib/ai/**`, `src/lib/server/**`, `src/lib/email/**`, `supabase/**`, `docs/**` |
| Person A | UI routes, components, mock layer, marketing |

## Collections note

Creating xAI Collections requires a **Management API key** with Collections permissions (separate from `XAI_API_KEY`).

If the management key is missing/invalid:

- Company still creates successfully
- Knowledge uploads go to xAI **Files**
- Chat attaches those `file_id`s so Grok can still search docs
- Structured company summary still extracts into Supabase

## License

Add a root `LICENSE` when the monorepo is finalized (MIT recommended for hackathon demos unless organizers specify otherwise).
