# Grok FDE

**Every prospect gets an engineer.**

Train Grok on your company once. Prospects get a persistent AI Forward-Deployed Engineer across **chat**, **voice**, **email**, and **Slack** — from discovery through implementation to production.

## Stack

- Next.js App Router + TypeScript + Tailwind
- Supabase (Auth, Postgres)
- xAI Grok (reasoning, files, voice, imagine)
- Vercel-ready

## Quick start

```bash
cp .env.example .env.local
# fill Supabase + XAI_API_KEY

npm install
npm run dev
```

- Marketing: http://localhost:3000  
- Company dashboard: http://localhost:3000/dashboard  
- Prospect FDE: http://localhost:3000/fde/{slug}  
- API health: http://localhost:3000/api/health  

```bash
bash docs/smoke-test.sh   # server API smoke
```

## Modes

| `NEXT_PUBLIC_MOCK_AI` | Behavior |
|----------------------|----------|
| `false` | Real Part B APIs + Grok |
| `true` | Person A mock layer (UI demo without keys) |

## Docs

- [docs/API.md](docs/API.md) — HTTP API
- [docs/test-requests.md](docs/test-requests.md) — curl flows
- [SECURITY.md](SECURITY.md) — secrets & trust boundary
- [requirements/PRODUCT.md](requirements/PRODUCT.md) — product brief

## License

MIT (hackathon demo).
