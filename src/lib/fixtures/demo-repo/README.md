# Globex Platform

Internal Next.js + Supabase app for Globex lead intake.

## Stack

- Next.js App Router
- TypeScript
- Supabase Auth + Postgres

## Structure

- `src/lib/supabase.ts` — data access
- `src/lib/auth.ts` — session helpers
- `src/app/api/leads/route.ts` — lead capture API
