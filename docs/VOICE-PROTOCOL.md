# xAI realtime voice — the protocol we actually target

Two sources: I tested the live API from this machine, and a research pass read the
current xAI docs. Where they agree, it is stated flatly. Where a field is inferred
from OpenAI Realtime compatibility rather than confirmed against xAI, it says so.

## Connect

```
POST https://api.x.ai/v1/realtime/client_secrets
  Authorization: Bearer $XAI_API_KEY
  { "expires_after": { "seconds": 300 } }
  -> 200 { "value": "xai-realtime-client-secret-...", "expires_at": <unix> }
```

```js
new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest",
              [`xai-client-secret.${value}`])
```

Verified working end to end. `expires_after` bounds time-to-connect, not session
length; a live session survives token expiry. Sessions cap at roughly 120 minutes,
so long calls need `resumption` rather than a socket you assume lives forever.

`grok-voice-latest` currently resolves to `grok-voice-think-fast-2.0`. That alias
re-pointed on 2026-08-05, so behavior differing from last week is expected.

## The three things that will silently break this

**1. User transcripts use `.updated`, and it is CUMULATIVE.**

xAI replaces OpenAI's incremental `conversation.item.input_audio_transcription.delta`
with `conversation.item.input_audio_transcription.updated`, whose `transcript` field
carries the entire transcript so far, corrections included.

```json
{ "type": "conversation.item.input_audio_transcription.updated",
  "item_id": "...", "content_index": 0,
  "transcript": "full text so far" }
```

Three failure modes. The first two were confirmed live against the real API by feeding
it 48kHz PCM speech and logging every event:

- Listening for `.delta` means the handler never fires and the user's own words never
  appear on screen, with no error to explain why. Measured: `.delta` fired ZERO times.
- Appending `.updated` the way you would append a delta produces exponentially
  duplicated text.
- **`.completed` is ALSO cumulative, and it also fires repeatedly.** An earlier version
  of this document implied `.completed` was a safe one-shot final. It is not. A single
  six second utterance produced SEVEN `.completed` events, each a longer prefix of the
  same sentence. Treating each as a finished line appends seven partial duplicates.

REPLACE, never concatenate, for BOTH events. Key the in-progress line by `item_id` and
update that one line in place, so a turn is a single line that grows and self-corrects.
Only settle it when the turn genuinely ends.

Note the asymmetry that makes this easy to get backwards: the USER's transcripts are
cumulative (replace), while the AGENT's `response.output_audio_transcript.delta` is
genuinely incremental (append). Getting these the wrong way round yields either
duplicated text or a stuttering line.

**2. Audio events use the GA names.** It is `response.output_audio.delta` with the
base64 payload in `delta`. The beta name `response.audio.delta` never fires. Handle
both only as belt and braces.

**3. There is no "audio finished playing" event.** xAI does not send the
`output_audio_buffer.*` family. You must track playback completion yourself, both to
return the avatar to idle and to time any post-tool `response.create`. There is also
no `rate_limits.updated`, so there is zero advance warning before hitting a limit.

## Session config

```json
{ "type": "session.update",
  "session": {
    "voice": "eve",
    "instructions": "...",
    "turn_detection": { "type": "server_vad", "threshold": 0.85,
                        "silence_duration_ms": 500, "prefix_padding_ms": 333 },
    "audio": {
      "input":  { "format": { "type": "audio/pcm", "rate": 48000 },
                  "transport": "json",
                  "transcription": { "language_hint": "en" } },
      "output": { "format": { "type": "audio/pcm", "rate": 48000 },
                  "transport": "json", "speed": 1.0 }
    },
    "tools": []
  } }
```

Sample rate: browser `AudioContext` runs at 48000 natively. Setting both input and
output to 48000 removes every resample from the hot path and kills a whole class of
aliasing and glitch bugs. 24000 is the API default and forces you to downsample mic
audio and run a second context or upsample for playback. Prefer 48000.

`transport: "binary"` sends raw codec bytes as WebSocket binary frames instead of
base64 inside JSON: noticeably less CPU and about a third less bandwidth. Worth taking
once the JSON path is proven working.

## Sending microphone audio

```json
{ "type": "input_audio_buffer.append", "audio": "<base64 PCM16>" }
```

The field is `audio`, not `delta`. Under `server_vad` never send
`input_audio_buffer.commit`; append continuously and the server segments turns.
`commit` and `clear` are manual-turn-mode only.

`echoCancellation: true` on `getUserMedia` is not optional. Without it the agent's own
voice retriggers server VAD and it interrupts itself mid-sentence.

## Barge-in

`input_audio_buffer.speech_started` can arrive while the agent is still speaking. On
receipt, flush the playback queue immediately and reset the avatar to idle. The server
stops generating, but audio already buffered locally keeps playing over the user unless
you drop it. Without this the call feels robotic and people talk over it constantly.

## Lip sync

Drive the mouth from the audio, not the text.

Compute RMS per PCM chunk from `response.output_audio.delta` and map it to mouth
openness. This is frame-accurate by construction. The transcript is the wrong signal:
the `replace` feature alters pronunciation without changing transcript text, so the two
can legitimately diverge. If both are wanted, jaw from RMS and mouth shape from
`response.output_audio_transcript.delta`.

An AudioWorklet hands you per-quantum RMS on the audio thread for free, which is the
cheapest correct place to compute it.

## Playback

`decodeAudioData` does not work here; these are raw PCM frames, not a container.

Preferred: AudioWorklet with a ring buffer, pulling Float32 per 128-frame render
quantum and emitting silence on underrun. Gapless, and it yields the RMS envelope
directly.

Simpler fallback: a scheduled `AudioBufferSourceNode` chain with a `nextStartTime`
cursor seeded at `ctx.currentTime + 0.1`, re-seeded whenever it falls behind
`currentTime`. Barge-in means stopping every queued node and resetting the cursor.

Open the socket and start mic capture in parallel, not in sequence, to cut startup
latency.

## Events observed on the wire

`session.created`, `session.updated`, `conversation.created`, `ping`,
`response.created`, `response.output_item.added`, `conversation.item.added`,
`response.content_part.added`, `response.output_audio.delta`,
`response.output_audio_transcript.delta`, `response.output_audio_transcript.done`,
`response.content_part.done`, `response.output_audio.done`,
`response.output_item.done`, `response.done`.

Handle `ping` and keep the socket alive. Errors arrive as
`{ "type": "error", "error": { "code", "message", "param" } }`.

Payload fields beyond `type`, `delta`, and `transcript` are inferred from the OpenAI GA
spec rather than confirmed against xAI. Log raw events on first run before depending on
any other field.

## Security: tools run in the BROWSER

With an ephemeral token the browser owns the socket, so any `function` tool the model
calls executes client side. Never put a GitHub token, a service-role key, or any other
secret into a tool definition or a tool result path that the browser can reach.

For privileged tools, have the browser call our own backend per invocation, or relay
the WebSocket through our server. `file_search` with `vector_store_ids` is safe, since
xAI resolves it server side. An `mcp` tool carrying an `authorization` value is NOT
safe to hand to the browser.

Tool flow: collect every `response.function_call_arguments.done` (each has `name`,
`call_id`, `arguments`), execute, reply with `conversation.item.create` of type
`function_call_output` matching each `call_id`, then send exactly ONE `response.create`
for the whole batch.

## Voices

26 built in, including one literally named `atlas`, alongside `eve` (default), `ara`,
`carina`, `orion`, `luna`, `iris`, `helios`, `celeste`, `sirius`, `leo`, `rex`.
Enumerate live with `GET /v1/tts/voices`. Custom cloned voices are supported via
`POST /v1/custom-voices` and pass as `session.voice`.

Since our agent is named Atlas, `voice: "atlas"` is worth an A/B against `eve`.

## Useful xAI extensions

`force_message` speaks exact text with no model inference, which is a clean way to
deliver a scripted greeting while the model warms up. Send it as a
`conversation.item.create` with item type `force_message`, and do NOT follow it with
`response.create`.

`resumption.enabled: true` plus the id from `conversation.created` lets you reconnect
with `?conversation_id=<id>` and have prior turns replayed. History expires after 30
minutes idle.
