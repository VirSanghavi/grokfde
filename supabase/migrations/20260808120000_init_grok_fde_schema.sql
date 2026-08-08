-- Grok FDE core schema (mirrors applied remote migration)

create extension if not exists "pgcrypto";

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  agent_name text not null default 'Atlas',
  agent_voice text not null default 'eve',
  agent_greeting text,
  agent_email_signature text,
  escalation_contact text,
  xai_collection_id text,
  knowledge_summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_slug_idx on public.companies (slug);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null check (type in ('file', 'paste', 'url', 'mcp')),
  title text not null,
  source_url text,
  xai_file_id text,
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index knowledge_sources_company_id_idx on public.knowledge_sources (company_id);
create index knowledge_sources_status_idx on public.knowledge_sources (status);

create table public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  server_url text not null,
  auth_token text,
  allow_write boolean not null default false,
  enabled boolean not null default true,
  tools_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mcp_servers_company_id_idx on public.mcp_servers (company_id);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name text,
  person_name text,
  email text,
  stage text not null default 'new',
  memory_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prospects_company_id_idx on public.prospects (company_id);
create index prospects_email_idx on public.prospects (email);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_company_id_idx on public.conversations (company_id);
create index conversations_prospect_id_idx on public.conversations (prospect_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel text not null check (channel in ('chat', 'email', 'call', 'system')),
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id);
create index messages_created_at_idx on public.messages (created_at);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz,
  transcript text,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index calls_conversation_id_idx on public.calls (conversation_id);

create table public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  type text not null,
  content_json jsonb not null default '{}'::jsonb,
  url text,
  prompt text,
  created_at timestamptz not null default now()
);

create index generated_assets_conversation_id_idx on public.generated_assets (conversation_id);

create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  question text not null,
  reason text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  suggested_response text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index escalations_company_id_idx on public.escalations (company_id);
create index escalations_status_idx on public.escalations (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger prospects_set_updated_at
  before update on public.prospects
  for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.mcp_servers enable row level security;
alter table public.prospects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;
alter table public.generated_assets enable row level security;
alter table public.escalations enable row level security;

create policy companies_all on public.companies for all using (true) with check (true);
create policy knowledge_sources_all on public.knowledge_sources for all using (true) with check (true);
create policy mcp_servers_all on public.mcp_servers for all using (true) with check (true);
create policy prospects_all on public.prospects for all using (true) with check (true);
create policy conversations_all on public.conversations for all using (true) with check (true);
create policy messages_all on public.messages for all using (true) with check (true);
create policy calls_all on public.calls for all using (true) with check (true);
create policy generated_assets_all on public.generated_assets for all using (true) with check (true);
create policy escalations_all on public.escalations for all using (true) with check (true);
