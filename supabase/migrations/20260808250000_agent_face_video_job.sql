-- Video generation is asynchronous and can take minutes, so the in-flight
-- request id has to survive between polls rather than being awaited inline.

alter table public.companies
  add column if not exists agent_face_video_request_id text;
