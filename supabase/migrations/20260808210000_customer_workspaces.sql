-- Customer workspace + implementation pipeline (Part B extension)

create table if not exists public.customer_workspaces (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'discovery'
    check (status in (
      'discovery', 'connected', 'analyzing', 'planned',
      'building', 'testing', 'ready_for_review', 'failed'
    )),
  customer_summary_json jsonb not null default '{}'::jsonb,
  architecture_json jsonb not null default '{}'::jsonb,
  analysis_json jsonb not null default '{}'::jsonb,
  events_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_workspaces_prospect_id_idx
  on public.customer_workspaces (prospect_id);
create index if not exists customer_workspaces_company_id_idx
  on public.customer_workspaces (company_id);

create table if not exists public.repository_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.customer_workspaces(id) on delete cascade,
  provider text not null check (provider in ('demo', 'github')),
  repository_name text not null,
  repository_url text,
  default_branch text not null default 'main',
  installation_or_connection_metadata_json jsonb not null default '{}'::jsonb,
  status text not null default 'connected'
    check (status in ('connected', 'error', 'disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repository_connections_workspace_id_idx
  on public.repository_connections (workspace_id);

create table if not exists public.implementation_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.customer_workspaces(id) on delete cascade,
  version int not null default 1,
  objective text not null default '',
  summary text not null default '',
  plan_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'accepted', 'superseded')),
  created_at timestamptz not null default now()
);

create index if not exists implementation_plans_workspace_id_idx
  on public.implementation_plans (workspace_id);

create table if not exists public.implementation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.customer_workspaces(id) on delete cascade,
  plan_id uuid references public.implementation_plans(id) on delete set null,
  status text not null default 'queued'
    check (status in (
      'queued', 'analyzing', 'planning', 'building', 'testing',
      'repairing', 'ready_for_review', 'failed'
    )),
  branch_name text,
  summary_json jsonb not null default '{}'::jsonb,
  diff_summary_json jsonb not null default '{}'::jsonb,
  events_json jsonb not null default '[]'::jsonb,
  pr_json jsonb not null default '{}'::jsonb,
  repair_attempts int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists implementation_runs_workspace_id_idx
  on public.implementation_runs (workspace_id);

create table if not exists public.implementation_files (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.implementation_runs(id) on delete cascade,
  path text not null,
  operation text not null check (operation in ('create', 'modify', 'delete')),
  original_content text,
  new_content text,
  diff text,
  created_at timestamptz not null default now()
);

create index if not exists implementation_files_run_id_idx
  on public.implementation_files (run_id);

create table if not exists public.implementation_tests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.implementation_runs(id) on delete cascade,
  name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'passed', 'failed', 'skipped', 'validated')),
  command text,
  output text,
  kind text not null default 'validation'
    check (kind in ('validation', 'test', 'repair')),
  created_at timestamptz not null default now()
);

create index if not exists implementation_tests_run_id_idx
  on public.implementation_tests (run_id);

drop trigger if exists customer_workspaces_set_updated_at on public.customer_workspaces;
create trigger customer_workspaces_set_updated_at
  before update on public.customer_workspaces
  for each row execute function public.set_updated_at();

drop trigger if exists repository_connections_set_updated_at on public.repository_connections;
create trigger repository_connections_set_updated_at
  before update on public.repository_connections
  for each row execute function public.set_updated_at();

drop trigger if exists implementation_runs_set_updated_at on public.implementation_runs;
create trigger implementation_runs_set_updated_at
  before update on public.implementation_runs
  for each row execute function public.set_updated_at();

alter table public.customer_workspaces enable row level security;
alter table public.repository_connections enable row level security;
alter table public.implementation_plans enable row level security;
alter table public.implementation_runs enable row level security;
alter table public.implementation_files enable row level security;
alter table public.implementation_tests enable row level security;

drop policy if exists customer_workspaces_all on public.customer_workspaces;
create policy customer_workspaces_all on public.customer_workspaces for all using (true) with check (true);
drop policy if exists repository_connections_all on public.repository_connections;
create policy repository_connections_all on public.repository_connections for all using (true) with check (true);
drop policy if exists implementation_plans_all on public.implementation_plans;
create policy implementation_plans_all on public.implementation_plans for all using (true) with check (true);
drop policy if exists implementation_runs_all on public.implementation_runs;
create policy implementation_runs_all on public.implementation_runs for all using (true) with check (true);
drop policy if exists implementation_files_all on public.implementation_files;
create policy implementation_files_all on public.implementation_files for all using (true) with check (true);
drop policy if exists implementation_tests_all on public.implementation_tests;
create policy implementation_tests_all on public.implementation_tests for all using (true) with check (true);
