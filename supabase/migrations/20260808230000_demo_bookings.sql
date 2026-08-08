-- Demo bookings: Cal.com-style scheduling for FDE demos (24/7, conflict-safe)

create table public.demo_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null default 30
    check (duration_minutes > 0 and duration_minutes <= 240),
  timezone text not null,
  guest_name text not null,
  guest_email text not null,
  guest_company text,
  notes text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  join_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index demo_bookings_company_id_idx on public.demo_bookings (company_id);
create index demo_bookings_starts_at_idx on public.demo_bookings (starts_at);
create index demo_bookings_guest_email_idx on public.demo_bookings (guest_email);
create index demo_bookings_status_idx on public.demo_bookings (status);
create index demo_bookings_join_token_idx on public.demo_bookings (join_token);

-- One confirmed booking per company slot (prevents double-book races)
create unique index demo_bookings_company_slot_uidx
  on public.demo_bookings (company_id, starts_at)
  where status = 'confirmed';

create trigger demo_bookings_set_updated_at
  before update on public.demo_bookings
  for each row execute function public.set_updated_at();

alter table public.demo_bookings enable row level security;

create policy demo_bookings_all on public.demo_bookings
  for all using (true) with check (true);

comment on table public.demo_bookings is
  'Scheduled FDE demos. Guests book 24/7 slots; FDE joins via join_token link.';
