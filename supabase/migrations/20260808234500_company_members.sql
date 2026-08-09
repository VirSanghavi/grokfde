-- Company team members.
--
-- Until now a company had no owner at all. The dashboard decided which company you
-- were looking at from a client-controlled X-Company-Id header read out of
-- localStorage, which means any browser could name any company id and read its
-- conversations, prospects, knowledge, and bookings. That is fine for a single-tenant
-- demo and not fine the moment two companies sign up. This table is the missing link
-- between auth.users and companies, and it is what server-side access checks read.

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  -- One membership row per person per company. Re-inviting is an upsert, not a
  -- duplicate.
  unique (company_id, user_id)
);

-- The two hot paths: "which companies can this user see" on every dashboard load,
-- and "who is on this company" when rendering the team list.
create index if not exists company_members_user_id_idx
  on public.company_members (user_id);
create index if not exists company_members_company_id_idx
  on public.company_members (company_id);

alter table public.company_members enable row level security;

-- Members can see their own company's roster. Everything the server does runs through
-- the service role, which bypasses RLS, so these policies only govern any direct
-- client access.
drop policy if exists company_members_select_own on public.company_members;
create policy company_members_select_own
  on public.company_members
  for select
  using (
    company_id in (
      select company_id from public.company_members where user_id = auth.uid()
    )
  );

-- Backfill: every company that predates this table gets claimed by the earliest
-- existing auth user, so no company is left orphaned and unreachable after the
-- dashboard starts resolving companies through membership instead of localStorage.
-- Safe to re-run: the unique constraint makes it idempotent.
insert into public.company_members (company_id, user_id, email, role)
select c.id, u.id, coalesce(u.email, 'unknown'), 'owner'
from public.companies c
cross join lateral (
  select id, email from auth.users order by created_at asc limit 1
) u
on conflict (company_id, user_id) do nothing;
