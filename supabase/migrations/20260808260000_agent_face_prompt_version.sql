-- Framing changes invalidate cached media the same way a voice change does.
-- Without this, a portrait generated with older framing is served forever.

alter table public.companies
  add column if not exists agent_face_prompt_version integer not null default 0;
