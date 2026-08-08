# Grok FDE

**Every prospect gets an engineer.**

Grok FDE turns company knowledge + tools into a persistent AI Forward-Deployed Engineer across chat, email, and realtime voice.

> Hackathon split: **Person B** ships the intelligence/server half in this tree; **Person A** ships the product UI/mock experience. Both merge into one Next.js app.

## Quick start

```bash
cp .env.example .env.local
# fill XAI_API_KEY, Supabase URL + keys (see docs/ENV.md)

npm install
npm run dev
```

Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)

API smoke test:

```bash
bash docs/smoke-test.sh
```

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/API.md](docs/API.md) | HTTP API reference |
| [docs/test-requests.md](docs/test-requests.md) | Curl demo flow |
| [docs/CONTRACT.md](docs/CONTRACT.md) | Frozen frontend response shapes |
| [docs/ENV.md](docs/ENV.md) | Environment variables |
| [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md) | Contributor / publish notes |
| [SECURITY.md](SECURITY.md) | Secrets & trust boundary |
| [docs/seed/grok-fde-product.md](docs/seed/grok-fde-product.md) | Dogfood product knowledge |

## Stack

- Next.js App Router (API routes)
- Supabase Postgres (app state)
- xAI Grok (reasoning, files, voice, imagine)
- No LangChain / custom vector DB

## Open source

This repository is meant to be public.

- **Do not commit** `.env.local` or real API keys
- Use `.env.example` only for placeholders
- Rotate any key that was ever pasted into chat before you push

## License

Add a `LICENSE` file when you publish (MIT is a good default for hackathon demos).
