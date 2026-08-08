<p align="center">
  <img src="https://img.shields.io/badge/Grok_FDE-Every_prospect_gets_an_engineer-10B981?style=for-the-badge&labelColor=0F172A" alt="Grok FDE" />
</p>

<h1 align="center">Grok FDE</h1>

<p align="center">
  <strong>Deploy an AI Forward-Deployed Engineer.</strong><br />
  Train it on your company once. Let every customer talk to an engineer instantly.
</p>

<p align="center">
  <a href="#why-this-exists">Why</a> ·
  <a href="#what-it-does">Product</a> ·
  <a href="#the-magic-moment">Magic moment</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#demo-script">Demo</a> ·
  <a href="#api-surface">API</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/xAI-Grok_4.5-1a1a1a?style=flat-square" alt="xAI" />
  <img src="https://img.shields.io/badge/Supabase-Postgres_%2B_Auth-3FCF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vercel-ready-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel" />
</p>

---

## Why this exists

Technical companies hit the same wall:

| Role | Strength | Failure mode |
|------|----------|--------------|
| Sales | Talks to customers | Cannot answer deep implementation questions |
| Engineering | Knows the product | Cannot join every call |
| Forward-deployed engineers | Bridge both worlds | Expensive, scarce, impossible to clone |

**Grok FDE removes the bottleneck.**

One trained AI engineer gets your docs, APIs, pricing, security materials, MCP tools, and customer memory. Then every prospect gets that engineer in chat, voice, email, and Slack, from first question through production.

This is not a support bot.  
This is not an SDR.  
This is not "chat with your docs."

> **Every prospect gets an engineer.**

---

## What it does

```
LEARN VENDOR
    ↓
MEET PROSPECT          chat · voice · email · Slack
    ↓
REMEMBER THEM          stack, objections, decisions, commitments
    ↓
DESIGN THE FIT         architecture, integration plan
    ↓
ENTER THEIR WORLD      repo connect · codebase analysis
    ↓
BUILD SAFELY           branch · patch · validate · PR (never main)
    ↓
SHIP TO PRODUCTION     staging · blockers · rollout · support
    ↓
FEED THE FIELD         recurring needs → product signal
```

### One identity. Every channel.

Atlas (or whatever you name the FDE) is the **same person** across:

| Channel | Capability |
|---------|------------|
| **Chat** | Technical discovery, grounded answers, tool use |
| **Voice** | Instant call button, same memory, realtime Grok Voice |
| **Email** | Follow-ups that continue the thread, not a new bot |
| **Slack** | Embedded in the customer channel; mentions, status, issues |
| **Workspace** | Inspect their repo, plan integration, generate a reviewable PR |
| **Account room** | Milestones, blockers, decisions, deployment, timeline |

---

## The magic moment

```
Prospect (chat, Monday):
  "We run Kubernetes on AWS."

Prospect (voice, Friday):
  clicks CALL

Atlas:
  "Since you mentioned Kubernetes on AWS earlier,
   I wouldn't replace your orchestration layer.
   I'd put us underneath your existing deploy flow…"
```

That is the product. Continuity of ownership. Not a chatbot that forgets.

---

## Product surfaces

### Company side (train & operate)

| Route | Purpose |
|-------|---------|
| `/onboarding` | Name the company, name the FDE, teach knowledge |
| `/dashboard` | Operations center: ingestion, activity stream, MCP inspector |
| `/knowledge` | Upload / paste / URL / MCP sources |
| `/conversations` | Unified inbox across channels |
| `/conversations/[id]/workspace` | Implementation workspace: analyze → plan → build → PR |
| `/accounts/[id]` | Account room: Slack, blockers, deployment, timeline |
| `/field-signals` | Recurring customer needs rolled up for product |

### Prospect side (the engineer they meet)

| Route | Purpose |
|-------|---------|
| `/fde/{slug}` | Hosted FDE page for your company |
| `/fde/{slug}/p/{prospectId}` | Prospect-specific deep link |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js (App Router)                      │
│   Marketing · Company ops shell · Prospect FDE · Auth UI     │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     ┌────────────────┐         ┌────────────────────┐
     │   Supabase     │         │   xAI / Grok       │
     │  Auth          │         │  grok-4.5          │
     │  Postgres      │         │  Voice realtime    │
     │  App state     │         │  Files/Collections │
     │  RLS           │         │  Imagine · MCP     │
     └────────────────┘         └────────────────────┘
```

**Design rules we actually follow:**

- No LangChain, no custom vector DB, no microservices for the hackathon core
- Supabase holds **application state** (companies, prospects, memory, runs, accounts)
- xAI holds **intelligence** (reasoning, document search, voice, tools, images)
- Code changes go to a **branch + PR**, never straight to `main`
- Slack is the **same FDE**, not a second agent

---

## Tech stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind 4, custom design tokens, dotted halftone icons |
| Data | Supabase Postgres + Auth (`@supabase/ssr`) |
| AI | xAI Grok 4.5, Voice, Files, Collections, Imagine |
| Email | Resend (optional transport) |
| Deploy | Vercel-ready single project |

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/LiamBMX/grokathon-build.git
cd grokathon-build
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Minimum for a live demo:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
XAI_API_KEY=...
NEXT_PUBLIC_MOCK_AI=false
```

Optional: `XAI_MANAGEMENT_API_KEY`, Slack tokens, `EMAIL_API_KEY`, `GITHUB_TOKEN`.  
Full list: [docs/ENV.md](docs/ENV.md) · security notes: [SECURITY.md](SECURITY.md)

### 3. Database

Migrations live in `supabase/migrations/`. Apply to your Supabase project (CLI or dashboard SQL).

### 4. Run

```bash
npm run dev
```

| Surface | URL |
|---------|-----|
| Landing | http://localhost:3000 |
| Operations center | http://localhost:3000/dashboard |
| Onboarding | http://localhost:3000/onboarding |
| Prospect FDE | http://localhost:3000/fde/grok-fde |
| API health | http://localhost:3000/api/health |

```bash
npm run build          # production build
npm run typecheck      # tsc --noEmit
bash docs/smoke-test.sh
```

### Modes

| `NEXT_PUBLIC_MOCK_AI` | Behavior |
|----------------------|----------|
| `false` (default for launch) | Real Grok + Supabase APIs |
| `true` | UI mock layer for offline demos |

---

## Demo script (for judges)

Dogfood the product: **train the FDE on Grok FDE itself.**

1. **Onboard**  
   Create company `Grok FDE`, agent `Atlas`. Paste product docs from `docs/seed/grok-fde-product.md`.

2. **Prospect chat**  
   Open `/fde/grok-fde`. Ask: *What do you do?*  
   Then: *We use Kubernetes on AWS.*

3. **Call**  
   Click call. Atlas should already know the stack. No re-introductions.

4. **Implementation**  
   Connect demo repo → analyze → plan → build → review diff → simulate PR.  
   Never writes to `main`.

5. **Slack lifecycle**  
   Connect channel → `@Atlas staging is returning 401s` → issue + plan → blocker on security → production update.

6. **Field signal**  
   Recurring needs roll up under `/field-signals` for the vendor product team.

That single arc shows: **knowledge · memory · voice · tools · code · Slack · production ownership.**

---

## API surface

High-level map (full reference: [docs/API.md](docs/API.md)):

```
POST   /api/company
POST   /api/knowledge/{paste,upload,url}
POST   /api/mcp
POST   /api/conversations
POST   /api/conversations/:id/message
GET    /api/voice/token
POST   /api/calls/complete
POST   /api/workspaces → analyze → plan → build
GET    /api/implementation-runs/:id
POST   /api/implementation-runs/:id/pull-request
POST   /api/accounts
POST   /api/slack/events
POST   /api/demo/slack-message
GET    /api/field-signals
GET    /api/health
```

Frozen chat response contract (frontend-safe): [docs/CONTRACT.md](docs/CONTRACT.md)

---

## Safety model

The FDE is powerful on purpose. It is also constrained on purpose.

| Allowed | Not allowed without human control |
|---------|-----------------------------------|
| Answer from company knowledge | Fabricate features, pricing, compliance |
| Read customer repo (demo/GitHub) | Push to `main` |
| Create branch + patch set (≤8 files) | Delete protected paths / secrets |
| Static validation + bounded repair | Unbounded agent loops |
| Open PR for review | Production deploy from a single Slack message |
| Escalate legal/pricing gaps | Pretend a tool succeeded when it failed |

Protected path denylist, max file change caps, and plan-before-build gates are enforced in server code, not only in prompts.

---

## UI craft

The company shell is built like an ops product, not a landing-page template:

- **100vh workspace** with independent center scroll (Linear spatial model)
- **Diagnostic color** for state only: mint success, cyber blue streaming, amber HITL
- **Custom dotted / halftone icons** (not stock outline icon soup)
- **⌘K command palette**, right-hand inspector drawer (no modal spam)
- **Operations center**: knowledge ingestion pipeline, multimodal activity stream, MCP inspector

---

## Repository layout

```
src/
  app/
    (marketing)/          Landing
    (company)/            Dashboard, knowledge, conversations, accounts
    (prospect)/fde/       Hosted FDE experience
    (auth)/               Login / signup
    api/                  Full intelligence + lifecycle API
  components/
    layout/               Shell, sidebar, command palette, drawer
    ops/                  Ingestion, activity stream, MCP inspector
    icons/                Dotted icon system
  lib/
    ai/                   Grok wrapper + prompts
    server/               Domain services (no scattered xAI calls)
    api/                  Frontend client + response mappers
  styles/globals.css      Design tokens
supabase/migrations/      Schema for product + workspace + account/Slack
docs/                     API, contracts, curl harness, seed knowledge
```

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/API.md](docs/API.md) | HTTP endpoints |
| [docs/test-requests.md](docs/test-requests.md) | Curl / acceptance flows |
| [docs/CONTRACT.md](docs/CONTRACT.md) | Frozen UI↔API shapes |
| [docs/ENV.md](docs/ENV.md) | Environment variables |
| [docs/seed/grok-fde-product.md](docs/seed/grok-fde-product.md) | Dogfood product knowledge |
| [SECURITY.md](SECURITY.md) | Secrets, RLS, trust boundary |
| [requirements/PRODUCT.md](requirements/PRODUCT.md) | Product brief |

---

## Positioning (say this, not the other thing)

| Say | Do not say |
|-----|------------|
| Deploy an AI Forward-Deployed Engineer | AI sales agent |
| Every prospect gets an engineer | Documentation chatbot |
| Continuity across chat, voice, Slack, and code | Multi-agent orchestration platform |

---

## License

MIT. Built to be open source. Keep secrets in `.env.local`. Never commit keys.

---

<p align="center">
  <strong>Grok FDE</strong><br />
  <em>Every prospect gets an engineer.</em><br />
  Powered entirely by Grok.
</p>
