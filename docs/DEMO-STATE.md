# Demo state — verified facts

Everything below was tested live against the running system, not inferred from code.
Last verified 2026-08-08.

## The demo company

Use this and nothing else when demoing.

- Name: Grok FDE, agent: Atlas
- Slug: `grok-fde`
- Company id: `778f9573-b6c6-4530-826d-1a29e536fc58`
- Prospect entry: `/fde/grok-fde`
- Booking entry: `/book/grok-fde`

Three real knowledge sources are ingested and `ready`: "What Grok FDE is",
"Architecture and technical facts", and "Positioning, pricing, and honest limits".
They were pushed through the real `/api/knowledge/paste` pipeline, not inserted
directly, so the ingestion path is proven.

## Verified working

**Chat.** Real Grok 4.5 with real knowledge retrieval. Asked it a hostile question
("be blunt, is this useful or just a chatbot, and what does it cost") and it gave a
strong, specific, honest answer, correctly refused to invent pricing, and extracted
`["Django monolith", "Heroku", "Postgres"]` into prospect memory automatically.

**Realtime voice.** The full xAI realtime path works from a client:

```
POST https://api.x.ai/v1/realtime/client_secrets
  Authorization: Bearer $XAI_API_KEY
  {"expires_after":{"seconds":300}}
  -> 200 {"value":"xai-realtime-client-secret-...","expires_at":<unix>}

new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest",
              ["xai-client-secret." + value])
```

The server resolves the model to `grok-voice-think-fast-2.0`. Default voice is
`xai_ara`; `eve` is accepted. `session.update` accepts `instructions`,
`turn_detection {type:"server_vad"}`, `input_audio_transcription {model:"whisper-1"}`,
and PCM16 at 24kHz for both input and output.

Events observed on the wire: `session.created`, `session.updated`,
`conversation.created`, `ping`, `response.created`, `response.output_item.added`,
`conversation.item.added`, `response.content_part.added`,
`response.output_audio.delta` (base64 PCM16, roughly 112KB for one short sentence),
`response.output_audio_transcript.delta`, `response.output_audio_transcript.done`,
`response.content_part.done`, `response.output_audio.done`,
`response.output_item.done`, `response.done`.

Atlas spoke a requested sentence back correctly. Handle `ping` to keep the socket
alive.

**Booking.** `demo_bookings` exists in the live database with a real row.
`/api/bookings/availability` returns real slots (about 48 per day, since the agent is
available around the clock, which is the actual differentiator versus Cal.com).

Double-booking is impossible at the DATABASE level, not merely in application code.
Proven live by posting two confirmed bookings at the same `(company_id, starts_at)`:
the second was rejected with `23505` on constraint `demo_bookings_company_slot_uidx`,
and `bookings.ts` maps that to a 409. An earlier note in this file assumed no such
constraint existed; that assumption was wrong and this supersedes it.

**A real DST bug was found and fixed here.** `wallTimeToUtc` in
`src/lib/server/timezone.ts` used a single-pass offset correction, which is wrong
whenever a DST transition falls between the guessed instant and the true one. On
2027-03-14 in `America/Los_Angeles`, every wall time from 02:00 to 09:59 resolved one
hour late, so a guest picking 3:00 PM would have been silently booked at 4:00 PM. The
same class of failure hit `Europe/London` and `Australia/Lord_Howe`. The two-pass fix
was verified by brute-forcing every half hour of every day for two years across 14
zones, 490,560 cases, with zero mismatches. The only residue is the 42 genuinely
nonexistent spring-forward wall times, which must be excluded from availability rather
than mapped to anything.

## Fixed here

- `openSession` in `src/lib/server/prospect-context.ts` created a brand new
  conversation on every single page load. A returning prospect silently lost their
  entire history and the database filled with junk "Prospect" rows. It now reuses the
  prospect's most recent conversation.
- `getCompanyById` / `getCompanyBySlug` in `src/lib/server/company-context.ts`
  reported any database failure as a 404 "Company not found", which hides outages and
  bad credentials behind a message that sends you looking in the wrong place. Database
  errors are now a 503 with the real cause, and the 404 names the slug that missed.

## Known issues still open

- **Chat latency.** One reply measured 34 seconds end to end, because the main
  generation and the prospect-memory extraction run as two sequential Grok calls
  before anything reaches the browser. Being fixed with server-side token streaming
  plus moving memory extraction off the critical path. The client still needs wiring
  to the stream after that.
- **Placeholder leakage in demo data.** An existing test booking uses
  `vir+demo@example.com` and the name "Vir Test". It will appear on `/demos`. Delete
  it before demoing.
- **Junk companies.** The `companies` table holds about a dozen smoke-test rows with
  slugs like `grok-fde-smoke-1786218043`, `sbx-`, `impl-`, `p3-`. Harmless for the
  demo since the demo pins `grok-fde`, but worth cleaning.

## Do not regress

- The homepage CTAs must point at `/book/grok-fde` and `/fde/grok-fde`. A slug with
  no company row is what produced the original "Uncaught (in promise) Error: Company
  not found" the user reported.
- The marketing MP4s in `public/marketing/` are visibly shaky. The shake is baked into
  the encoded video, not the CSS. Use the stills.
