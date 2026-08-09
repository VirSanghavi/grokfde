#!/usr/bin/env node
/**
 * Realtime voice path.
 *
 * Proves, from Node, that the demo centerpiece actually works end to end:
 * mint an ephemeral client secret, open the xAI realtime WebSocket with the
 * client-secret subprotocol, configure the session, ask for a response, and
 * assert that real audio bytes and a real transcript come back.
 *
 * Two mints are exercised separately so a failure points at one side:
 *   - direct from api.x.ai, which isolates the XAI_API_KEY and the xAI service
 *   - from our own /api/voice/token, which isolates our server's token route
 *
 * Minting a token needs a conversation, and listing conversations is now an
 * operator-only endpoint, so this suite opens one as a prospect would. That row
 * is QA-namespaced and removed in teardown, including on SIGINT and SIGTERM.
 */
import {
  DEMO,
  assert,
  assertEqual,
  assertShape,
  createRun,
  postJson,
  qaName,
  request,
} from "./lib/harness.mjs";
import { cleanup, track, trackConversationMessages } from "./lib/db.mjs";

/** The one conversation this suite opens, so teardown can remove it. */
const fx = { conversationId: null, prospectId: null };

/**
 * Minting a token requires a conversation, and listing them is now gated, so
 * this suite opens one as a prospect would. That is a real row on the demo
 * company, so teardown must survive a kill exactly as api.mjs does.
 */
let tornDown = false;
async function teardown(reason) {
  if (tornDown) return;
  tornDown = true;
  if (reason) console.log(`\n  interrupted (${reason}), cleaning up before exit`);
  await cleanup().catch((err) => console.error(`  cleanup failed: ${err.message}`));
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, async () => {
    await teardown(signal);
    process.exit(130);
  });
}

const run = createRun("voice", "Realtime voice");

const XAI_KEY = process.env.XAI_API_KEY;
const VOICE_MODEL = process.env.XAI_VOICE_MODEL || "grok-voice-latest";
const CONNECT_TIMEOUT_MS = Number(process.env.QA_VOICE_CONNECT_MS || 20_000);
const RESPONSE_TIMEOUT_MS = Number(process.env.QA_VOICE_TIMEOUT_MS || 60_000);

if (!XAI_KEY) {
  run.skip("realtime voice", "XAI_API_KEY is not set - cannot reach the xAI realtime API");
  run.finish();
  process.exit(process.exitCode || 0);
}

/**
 * Drive one full realtime turn and report what actually came back on the wire.
 * Resolves with the observed event names, audio byte count, and transcript.
 */
function driveRealtimeTurn({ token, url, instructions, say }) {
  return new Promise((resolve, reject) => {
    const observed = new Set();
    const errors = [];
    let audioBytes = 0;
    let audioDeltas = 0;
    let transcript = "";
    let settled = false;
    let ws;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(responseTimer);
      try {
        ws?.close();
      } catch {
        /* socket already gone */
      }
      err ? reject(err) : resolve(value);
    };

    const connectTimer = setTimeout(
      () => finish(new Error(`WebSocket did not reach session.created within ${CONNECT_TIMEOUT_MS}ms`)),
      CONNECT_TIMEOUT_MS,
    );
    const responseTimer = setTimeout(
      () =>
        finish(
          new Error(
            `no complete response within ${RESPONSE_TIMEOUT_MS}ms (audioDeltas=${audioDeltas}, transcript="${transcript.slice(0, 60)}", events seen: ${[...observed].join(", ") || "none"}${errors.length ? `, errors: ${errors.join("; ")}` : ""})`,
          ),
        ),
      RESPONSE_TIMEOUT_MS,
    );

    try {
      ws = new WebSocket(url, [`xai-client-secret.${token}`]);
    } catch (err) {
      return finish(new Error(`could not construct WebSocket: ${err.message}`));
    }

    ws.addEventListener("error", () => {
      finish(new Error(`WebSocket error before completion (events seen: ${[...observed].join(", ") || "none"})`));
    });

    ws.addEventListener("close", (event) => {
      if (!settled) {
        finish(
          new Error(
            `socket closed (code ${event.code}${event.reason ? `, ${event.reason}` : ""}) before a response completed; events seen: ${[...observed].join(", ") || "none"}`,
          ),
        );
      }
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const type = msg.type;
      observed.add(type);

      switch (type) {
        case "session.created":
          clearTimeout(connectTimer);
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                voice: "eve",
                instructions,
                turn_detection: { type: "server_vad", threshold: 0.5, silence_duration_ms: 500, prefix_padding_ms: 300 },
                input_audio_transcription: { model: "whisper-1" },
              },
            }),
          );
          break;

        case "session.updated":
          ws.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: say }],
              },
            }),
          );
          ws.send(JSON.stringify({ type: "response.create" }));
          break;

        case "response.output_audio.delta":
        case "response.audio.delta":
          if (typeof msg.delta === "string") {
            audioDeltas += 1;
            audioBytes += Math.floor((msg.delta.length * 3) / 4);
          }
          break;

        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta":
          if (typeof msg.delta === "string") transcript += msg.delta;
          break;

        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done":
          if (typeof msg.transcript === "string" && msg.transcript.length > transcript.length) {
            transcript = msg.transcript;
          }
          break;

        case "error":
          errors.push(`${msg.error?.code || "error"}: ${msg.error?.message || "unknown"}`);
          break;

        case "response.done":
          finish(null, { observed: [...observed], audioBytes, audioDeltas, transcript: transcript.trim(), errors });
          break;

        case "ping":
          // The server pings to keep the socket alive; ignoring it is fine for
          // a short turn, but a long call must not treat it as an unknown event.
          break;

        default:
          break;
      }
    });
  });
}

// ---------------------------------------------------------------------------

let directToken = null;

await run.test("POST api.x.ai/v1/realtime/client_secrets mints an ephemeral secret", async () => {
  const res = await request("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: { authorization: `Bearer ${XAI_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
    timeoutMs: 20_000,
  });
  assertEqual(res.status, 200, "status");
  assertShape(res.json, { value: "string", expires_at: "number" });
  assert(
    res.json.value.startsWith("xai-realtime-client-secret-"),
    `client secret has an unexpected prefix: ${res.json.value.slice(0, 24)}…`,
  );
  assert(res.json.expires_at * 1000 > Date.now(), "client secret is already expired");
  directToken = res.json.value;
  const ttl = Math.round((res.json.expires_at * 1000 - Date.now()) / 1000);
  return `expires in ${ttl}s`;
});

await run.test("GET api.x.ai/v1/tts/voices lists the configured voice", async () => {
  const res = await request("https://api.x.ai/v1/tts/voices", {
    headers: { authorization: `Bearer ${XAI_KEY}` },
    timeoutMs: 20_000,
  });
  assertEqual(res.status, 200, "status");
  const payload = res.json;
  const names = Array.isArray(payload)
    ? payload.map((v) => v?.name ?? v?.voice_id ?? v)
    : Array.isArray(payload?.voices)
      ? payload.voices.map((v) => v?.name ?? v?.voice_id ?? v)
      : [];
  assert(names.length > 0, `could not read a voice list from the response: ${res.text.slice(0, 160)}`);
  const flat = names.map((n) => String(n).toLowerCase());
  assert(flat.includes("eve"), `default voice "eve" is not in the voice list (${flat.slice(0, 8).join(", ")}…)`);
  return `${flat.length} voices, atlas=${flat.includes("atlas")}`;
});

await run.test("realtime WebSocket returns audio and a transcript (direct mint)", async () => {
  assert(directToken, "no client secret was minted, so there is nothing to connect with");
  const result = await driveRealtimeTurn({
    token: directToken,
    url: `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(VOICE_MODEL)}`,
    instructions: "You are Atlas, a forward-deployed engineer. Answer in one short sentence.",
    say: "Say exactly: the demo is ready.",
  });
  assert(result.errors.length === 0, `server sent errors: ${result.errors.join("; ")}`);
  assert(result.audioDeltas > 0, "no response.output_audio.delta arrived - the agent produced no audio");
  assert(
    result.audioBytes > 10_000,
    `only ${result.audioBytes} bytes of audio arrived, which is too short to be a spoken sentence`,
  );
  assert(result.transcript.length > 0, "no transcript arrived - captions would stay blank during the call");
  return `${result.audioDeltas} deltas, ${(result.audioBytes / 1024).toFixed(0)}KB audio, transcript "${result.transcript.slice(0, 60)}"`;
});

// ---------------------------------------------------------------------------
// Our own token route, connected for real
// ---------------------------------------------------------------------------

let appToken = null;
let appUrl = null;

await run.test("GET /api/voice/token returns a live credential for a real conversation", async () => {
  // Open a conversation the way a prospect actually does. Listing them is now
  // an operator-only endpoint that answers 401 without a session, so reusing an
  // existing one is no longer possible from here. This row is namespaced and
  // deleted in teardown below.
  const opened = await postJson(
    "/api/conversations",
    { companySlug: DEMO.slug, personName: qaName("voice"), companyName: qaName("voice-co") },
    { timeoutMs: 60_000 },
  );
  assertEqual(opened.status, 201, "opening a conversation as a prospect");
  const conversation = opened.json?.conversation;
  assert(conversation?.id, "no conversation came back to mint a voice token against");
  fx.conversationId = track("conversations", conversation.id);
  trackConversationMessages(conversation.id);
  if (opened.json?.prospect?.id) fx.prospectId = track("prospects", opened.json.prospect.id);

  const res = await request(`/api/voice/token?conversationId=${conversation.id}`, { timeoutMs: 45_000 });
  assertEqual(res.status, 200, "status");
  assertShape(res.json, {
    token: "string",
    realtimeUrl: "string",
    "session.instructions": "string",
    websocketProtocols: "array",
  });
  assert(res.json.mock !== true, "the server returned a MOCK voice token - the browser would never connect to xAI");
  assert(
    res.json.websocketProtocols[0] === `xai-client-secret.${res.json.token}`,
    "websocketProtocols[0] does not match the minted token, so the browser handshake would fail",
  );
  appToken = res.json.token;
  appUrl = res.json.realtimeUrl;
  return `${res.json.model}, instructions ${res.json.session.instructions.length} chars`;
});

await run.test("realtime WebSocket returns audio and a transcript (token from our server)", async () => {
  assert(appToken && appUrl, "our server did not return a usable voice token");
  const result = await driveRealtimeTurn({
    token: appToken,
    url: appUrl,
    instructions: "You are Atlas. Answer in one short sentence.",
    say: "Say exactly: Atlas is online.",
  });
  assert(result.errors.length === 0, `server sent errors: ${result.errors.join("; ")}`);
  assert(result.audioDeltas > 0, "no audio deltas arrived using the token our server minted");
  assert(result.transcript.length > 0, "no transcript arrived using the token our server minted");
  return `${result.audioDeltas} deltas, ${(result.audioBytes / 1024).toFixed(0)}KB audio, transcript "${result.transcript.slice(0, 60)}"`;
});

console.log("");
await teardown();
run.finish();
