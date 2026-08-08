-- Pass 3: Account lifecycle + Slack + delivery state

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  workspace_id uuid references public.customer_workspaces(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  stage text not null default 'prospect'
    check (stage in (
      'prospect', 'discovery', 'technical_evaluation', 'proof_of_concept',
      'implementation', 'staging', 'production', 'expansion', 'blocked'
    )),
  success_outcome text,
  success_criteria_json jsonb not null default '[]'::jsonb,
  account_summary_json jsonb not null default '{}'::jsonb,
  technical_environment_json jsonb not null default '{}'::jsonb,
  quality_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_company_id_idx on public.accounts (company_id);
create index if not exists accounts_prospect_id_idx on public.accounts (prospect_id);
create unique index if not exists accounts_prospect_unique_idx on public.accounts (prospect_id);

create table if not exists public.slack_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  team_id text not null default 'T_DEMO',
  workspace_name text,
  channel_id text not null,
  channel_name text,
  bot_user_id text,
  access_token text,
  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'error')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists slack_connections_account_id_idx on public.slack_connections (account_id);
create unique index if not exists slack_connections_channel_unique_idx
  on public.slack_connections (team_id, channel_id);

create table if not exists public.account_milestones (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  label text not null,
  description text,
  status text not null default 'upcoming'
    check (status in ('completed', 'current', 'upcoming', 'blocked')),
  position int not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_milestones_account_id_idx on public.account_milestones (account_id);

create table if not exists public.account_blockers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  description text,
  owner_type text not null default 'unknown'
    check (owner_type in ('customer', 'vendor', 'fde', 'unknown')),
  owner_name text,
  source text,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  impact text,
  normalized_key text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists account_blockers_account_id_idx on public.account_blockers (account_id);
create index if not exists account_blockers_status_idx on public.account_blockers (status);

create table if not exists public.account_decisions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  decision text not null,
  rationale text,
  source text,
  source_reference text,
  normalized_key text,
  created_at timestamptz not null default now()
);

create index if not exists account_decisions_account_id_idx on public.account_decisions (account_id);

create table if not exists public.account_commitments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  owner text not null default 'fde',
  description text not null,
  status text not null default 'open'
    check (status in ('open', 'done', 'cancelled')),
  source text,
  normalized_key text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists account_commitments_account_id_idx on public.account_commitments (account_id);

create table if not exists public.deployment_states (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  environment text not null default 'staging',
  version text,
  status text not null default 'not_started'
    check (status in (
      'not_started', 'staging', 'validating', 'ready_for_production',
      'production', 'degraded', 'rolled_back'
    )),
  checks_json jsonb not null default '[]'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists deployment_states_account_id_idx on public.deployment_states (account_id);

create table if not exists public.production_issues (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  description text,
  source text,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'fix_ready', 'resolved', 'wontfix')),
  root_cause text,
  resolution text,
  implementation_run_id uuid references public.implementation_runs(id) on delete set null,
  plan_id uuid references public.implementation_plans(id) on delete set null,
  slack_thread_ts text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists production_issues_account_id_idx on public.production_issues (account_id);

create table if not exists public.field_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null,
  normalized_key text not null,
  title text not null,
  summary text,
  account_id uuid references public.accounts(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists field_signals_company_id_idx on public.field_signals (company_id);
create index if not exists field_signals_key_idx on public.field_signals (normalized_key);

create table if not exists public.account_timeline_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  type text not null,
  summary text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_timeline_events_account_id_idx
  on public.account_timeline_events (account_id, created_at desc);

-- triggers
drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

drop trigger if exists slack_connections_set_updated_at on public.slack_connections;
create trigger slack_connections_set_updated_at
  before update on public.slack_connections
  for each row execute function public.set_updated_at();

drop trigger if exists account_milestones_set_updated_at on public.account_milestones;
create trigger account_milestones_set_updated_at
  before update on public.account_milestones
  for each row execute function public.set_updated_at();

-- RLS (hackathon open)
alter table public.accounts enable row level security;
alter table public.slack_connections enable row level security;
alter table public.account_milestones enable row level security;
alter table public.account_blockers enable row level security;
alter table public.account_decisions enable row level security;
alter table public.account_commitments enable row level security;
alter table public.deployment_states enable row level security;
alter table public.production_issues enable row level security;
alter table public.field_signals enable row level security;
alter table public.account_timeline_events enable row level security;

drop policy if exists accounts_all on public.accounts;
create policy accounts_all on public.accounts for all using (true) with check (true);
drop policy if exists slack_connections_all on public.slack_connections;
create policy slack_connections_all on public.slack_connections for all using (true) with check (true);
drop policy if exists account_milestones_all on public.account_milestones;
create policy account_milestones_all on public.account_milestones for all using (true) with check (true);
drop policy if exists account_blockers_all on public.account_blockers;
create policy account_blockers_all on public.account_blockers for all using (true) with check (true);
drop policy if exists account_decisions_all on public.account_decisions;
create policy account_decisions_all on public.account_decisions for all using (true) with check (true);
drop policy if exists account_commitments_all on public.account_commitments;
create policy account_commitments_all on public.account_commitments for all using (true) with check (true);
drop policy if exists deployment_states_all on public.deployment_states;
create policy deployment_states_all on public.deployment_states for all using (true) with check (true);
drop policy if exists production_issues_all on public.production_issues;
create policy production_issues_all on public.production_issues for all using (true) with check (true);
drop policy if exists field_signals_all on public.field_signals;
create policy field_signals_all on public.field_signals for all using (true) with check (true);
drop policy if exists account_timeline_events_all on public.account_timeline_events;
create policy account_timeline_events_all on public.account_timeline_events for all using (true) with check (true);

-- Extend messages channel check to include slack if constrained
do $$
begin
  alter table public.messages drop constraint if exists messages_channel_check;
  alter table public.messages add constraint messages_channel_check
    check (channel in ('chat', 'email', 'call', 'system', 'slack'));
exception when others then
  null;
end $$;
