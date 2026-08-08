# Security

This project is intended to be **open source**. Treat every commit as public.

## Secrets

**Never commit:**

- `.env`, `.env.local`, or any file containing real keys
- xAI API keys / management keys
- Supabase service role / secret keys
- MCP auth tokens
- Email provider keys

Use `.env.example` as the template. Put real values only in `.env.local` (gitignored).

If a key was ever pasted into chat, a PR, logs, or a screenshot: **rotate it** in the provider console before going public.

| Secret | Where to rotate |
|--------|-----------------|
| `XAI_API_KEY` | https://console.x.ai |
| `XAI_MANAGEMENT_API_KEY` | https://console.x.ai (Management Keys) |
| Supabase keys | Project → Settings → API |
| `EMAIL_API_KEY` / Resend | Resend dashboard |

## Server-only credentials

- Supabase **service role / secret** is used only in `src/lib/server/**` route handlers.
- MCP `auth_token` is stored server-side and **never** returned by `/api/mcp`.
- Voice ephemeral tokens are short-lived; the browser never receives `XAI_API_KEY`.

## Database (hackathon defaults)

Migrations enable RLS with **permissive policies** so a 12-hour demo works without full auth scaffolding.

Before any production or multi-tenant deployment:

1. Replace open `USING (true)` policies with real tenant isolation.
2. Prefer service-role-only writes from API routes.
3. Encrypt or vault MCP credentials at rest.
4. Turn on Supabase Auth and scope company data to the owning user/org.

## Model trust boundary

The FDE must not:

- invent product features, pricing, or compliance claims
- claim tool success without a tool result
- execute high-risk MCP tools automatically

See `src/lib/ai/prompts/fde.ts` and `src/lib/server/permissions.ts`.

## Reporting

If you find a vulnerability in a fork or deployment, treat secrets as compromised until rotated.
