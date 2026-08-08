# Grok FDE

**Every prospect gets an engineer.**

Train Grok on your company once. Every prospect gets a persistent AI Forward-Deployed Engineer across chat, email, and live voice, with memory that follows them between channels.

## Quick start (mock mode)

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_MOCK_AI=true is the default
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo path (judges)

1. Landing → **Talk to ours** (or `/fde/grok-fde`)
2. Chat → stack + **Start Implementation** → build → PR
3. **Account Room** `/accounts/pr_globex` — Slack `#globex-grok-fde`, milestones, blockers
4. Click **Advance demo** repeatedly: staging 401 → root cause → fix PR #143 → security blocker → production
5. **Field Signals** for cross-account product opportunities
6. Call Atlas still works for voice continuity
7. Company: `/dashboard`, `/knowledge`, `/conversations`, `/agent` (Slack connect)

Or start fresh: `/onboarding` → create company → teach FDE → launch.

## Requirements (saved)

| Doc | What |
|---|---|
| [`requirements/PRODUCT.md`](./requirements/PRODUCT.md) | Product vision |
| [`requirements/PERSON_A.md`](./requirements/PERSON_A.md) | UI / product experience (this branch) |
| [`requirements/PERSON_B.md`](./requirements/PERSON_B.md) | Intelligence / server (other engineer) |
| [`requirements/ACTION_PLAN.md`](./requirements/ACTION_PLAN.md) | 3-hour build plan |

## Ownership

**Person A (this PR)** owns:

- `package.json`, configs, `.env.example`
- `src/app/(marketing|company|prospect)/**`
- `src/components/**`, `src/styles/**`
- `src/lib/supabase/{client,server}.ts`
- `src/lib/mock/**`, `src/types/ui.ts`

**Person B** owns (do not edit here):

- `src/app/api/**`, `src/lib/ai/**`, `src/lib/server/**`, `src/lib/email/**`
- `supabase/**`, `docs/**`

## Stack

Next.js App Router · React · TypeScript · Tailwind CSS v4 · Supabase clients · Zod · lucide-react · Resend (dep for Person B)

## Environment

See `.env.example`. Critical flags:

```
NEXT_PUBLIC_MOCK_AI=true          # full demo without Person B
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
XAI_API_KEY=                      # Person B
```

When `NEXT_PUBLIC_MOCK_AI=false`, the UI client calls Person B’s `/api/*` routes with the same response shapes.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
