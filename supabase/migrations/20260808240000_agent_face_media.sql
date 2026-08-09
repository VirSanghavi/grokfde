-- Generated agent face media, cached per company.
-- Derived from companies.agent_voice so the portrait always matches the voice.

alter table public.companies
  add column if not exists agent_face_image_url text,
  add column if not exists agent_face_video_url text,
  -- Voice the cached media was generated for; a change invalidates the cache.
  add column if not exists agent_face_voice text,
  add column if not exists agent_face_generated_at timestamptz;
