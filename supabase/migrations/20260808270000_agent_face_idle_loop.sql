-- The call stage crossfades between a talking loop and a listening loop, so
-- the idle clip needs its own cached url and in-flight job id.

alter table public.companies
  add column if not exists agent_face_idle_video_url text,
  add column if not exists agent_face_idle_request_id text;
