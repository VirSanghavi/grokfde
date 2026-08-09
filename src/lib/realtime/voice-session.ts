/**
 * Browser session against the xAI realtime API (Grok Voice).
 *
 * The browser owns the socket directly under an ephemeral client secret, so
 * there is no audio proxy and no server in the hot path. Everything here was
 * written against events observed on the live wire, not inferred from the
 * OpenAI spec. Three of those observations contradict the obvious
 * implementation and each one silently breaks the call:
 *
 * 1. USER TRANSCRIPTS ARE CUMULATIVE, AND SO ARE THE "COMPLETED" ONES.
 *    xAI never sends `conversation.item.input_audio_transcription.delta`. It
 *    sends `.updated`, whose `transcript` is the ENTIRE transcript so far.
 *    Measured on a real 6 second utterance: 6 `.updated` and 7 `.completed`,
 *    zero `.delta`. `.completed` is not final either, it repeats and it is
 *    cumulative too. So both events REPLACE the text for their `item_id`, and
 *    a turn is one line updated in place rather than one line per event.
 *    Appending here produces exponentially duplicated text; listening for
 *    `.delta` means the visitor's own words never appear at all.
 *
 * 2. AUDIO USES THE GA EVENT NAMES. `response.output_audio.delta` carries the
 *    base64 PCM. The beta `response.audio.delta` never fires.
 *
 * 3. THERE IS NO "AUDIO FINISHED PLAYING" EVENT. xAI sends no
 *    `output_audio_buffer.*` family, so playback completion is tracked here,
 *    in the player worklet, by detecting ring buffer drain.
 *
 * Everything runs at 48kHz in both directions because that is the browser's
 * native AudioContext rate, which removes every resample from the hot path.
 */

export type VoiceSpeakingState = "idle" | "listening" | "thinking" | "speaking";

export type VoiceActivityEvent = {
  type: string;
  label: string;
  /** Stable id so a running activity can be updated in place, not duplicated. */
  id?: string;
  state?: "running" | "done" | "failed";
  detail?: string;
};

export type VoiceTranscriptLine = {
  /** Server item id. The consumer upserts on this, never appends blindly. */
  id: string;
  speaker: "agent" | "prospect";
  text: string;
  at: string;
  final: boolean;
  /**
   * Monotonic per speaker, incremented when a new spoken turn starts. Consumers
   * that key on `id` do not need it; it exists for surfaces that group segments
   * of one turn into a single bubble.
   */
  turnId?: number;
};

/** A tool the model may call. Executed HERE, in the browser. */
export type VoiceToolHandler = (
  args: Record<string, unknown>,
) => Promise<unknown> | unknown;

export type VoiceSessionConfig = {
  token: string;
  realtimeUrl: string;
  websocketProtocols?: string[];
  session: {
    voice?: string;
    instructions?: string;
    turn_detection?: Record<string, unknown>;
    tools?: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };
  /**
   * Client-side implementations, by tool name. The browser holds only an
   * ephemeral, short-lived secret, so these must never be handed anything
   * privileged; each one calls our own backend, which does hold the secrets.
   */
  toolHandlers?: Record<string, VoiceToolHandler>;
  /** Upsert by `line.id`. Never push blindly, see note 1 above. */
  onTranscript?: (line: VoiceTranscriptLine) => void;
  /**
   * The same transcript, flattened for consumers that only want "this speaker,
   * this text, this turn" and do not track item ids. Fires alongside
   * `onTranscript`, never instead of it.
   */
  onTranscriptDelta?: (
    speaker: "agent" | "prospect",
    text: string,
    turnId?: number,
  ) => void;
  onSpeakingState?: (state: VoiceSpeakingState) => void;
  onActivity?: (event: VoiceActivityEvent) => void;
  /**
   * Agent audio RMS envelope, 0..1, roughly every 10ms. Drives the mouth.
   * This is deliberately taken from the AUDIO, not the transcript: xAI's
   * `replace` feature alters pronunciation without changing transcript text,
   * so the two legitimately diverge and only the audio is frame-accurate.
   */
  onLevel?: (level: number) => void;
  /** The visitor's own mic RMS, 0..1, so the stage shows both sides truthfully. */
  onInputLevel?: (level: number) => void;
  onError?: (message: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

/**
 * Native browser rate. Setting both directions to it means no resampling
 * anywhere, which removes a whole class of aliasing and glitch bugs.
 */
const SAMPLE_RATE = 48000;

/** 40ms of audio per frame: small enough for snappy VAD, large enough to be cheap. */
const CAPTURE_FRAMES = 1920;

/* ── Worklets ────────────────────────────────────────────────────────────────
   Source lives here rather than in /public so the audio thread code ships
   next to the code that drives it, and so there is no static asset to keep in
   sync. Loaded via a blob URL at connect time.
   ────────────────────────────────────────────────────────────────────────── */

const MIC_WORKLET = `
class MicCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.frames = o.frames || 1920;
    this.buf = new Float32Array(this.frames);
    this.n = 0;
    this.muted = false;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'mute') this.muted = !!e.data.value;
    };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.frames) {
        if (!this.muted) {
          // Convert on the audio thread so the main thread only sees bytes.
          const pcm = new Int16Array(this.frames);
          for (let j = 0; j < this.frames; j++) {
            let s = this.buf[j];
            if (s > 1) s = 1; else if (s < -1) s = -1;
            pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          this.port.postMessage(pcm, [pcm.buffer]);
        }
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('mic-capture', MicCapture);
`;

const PLAYER_WORKLET = `
class PcmPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.cap = o.capacity || 48000 * 8;
    this.ring = new Float32Array(this.cap);
    this.r = 0; this.w = 0; this.avail = 0;
    this.active = false;
    this.env = 0;
    this.tick = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (!d) return;
      if (d.type === 'push') {
        const s = d.samples;
        for (let i = 0; i < s.length; i++) {
          this.ring[this.w] = s[i];
          this.w = (this.w + 1) % this.cap;
          if (this.avail < this.cap) this.avail++;
          else this.r = (this.r + 1) % this.cap;
        }
        this.active = true;
      } else if (d.type === 'flush') {
        // Barge-in. Drop everything still queued so the agent stops talking
        // over the person immediately, not when the buffer happens to empty.
        this.r = 0; this.w = 0; this.avail = 0;
        this.active = false; this.env = 0;
        this.port.postMessage({ type: 'level', value: 0 });
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const n = out.length;
    let sum = 0;
    if (this.avail >= n) {
      for (let i = 0; i < n; i++) {
        const v = this.ring[this.r];
        out[i] = v;
        sum += v * v;
        this.r = (this.r + 1) % this.cap;
        this.avail--;
      }
    } else {
      out.fill(0);
      // Underrun after having had audio means this utterance finished. xAI
      // sends no event for that, so this is the only honest signal we get.
      if (this.active) {
        this.active = false;
        this.port.postMessage({ type: 'drained' });
      }
    }
    const rms = Math.sqrt(sum / n);
    // Fast attack, slow release: the mouth opens the instant sound starts and
    // closes smoothly, instead of chattering on every zero crossing.
    this.env = rms > this.env ? rms * 0.6 + this.env * 0.4 : rms * 0.12 + this.env * 0.88;
    if ((this.tick++ & 3) === 0) this.port.postMessage({ type: 'level', value: this.env });
    return true;
  }
}
registerProcessor('pcm-player', PcmPlayer);
`;

function workletUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
}

function b64FromInt16(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function floatsFromB64(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Copy into an aligned buffer: a base64 payload can start at any offset and
  // Int16Array requires 2-byte alignment.
  const aligned =
    bytes.byteOffset % 2 === 0
      ? bytes
      : new Uint8Array(bytes);
  const pcm = new Int16Array(
    aligned.buffer,
    aligned.byteOffset,
    Math.floor(aligned.byteLength / 2),
  );
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] ?? 0) / 0x8000;
  return out;
}

type PendingToolCall = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
};

export class VoiceSession {
  private cfg: VoiceSessionConfig;
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private micNode: AudioWorkletNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private playerNode: AudioWorkletNode | null = null;
  private micSink: GainNode | null = null;
  private blobUrls: string[] = [];

  private muted = false;
  private closed = false;
  private connected = false;

  /** Agent transcript deltas ARE incremental, so this one accumulates. */
  private agentBuf = "";
  private agentTurn = 0;
  private userTurn = 0;
  private agentItemId: string | null = null;
  /** User transcripts are cumulative per item, so these are replaced. */
  private userItemId: string | null = null;

  private pendingTools: PendingToolCall[] = [];
  private speaking = false;
  private inputEnv = 0;

  constructor(cfg: VoiceSessionConfig) {
    this.cfg = cfg;
  }

  get localStream(): MediaStream | null {
    return this.mediaStream;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    // Gate at the worklet AND at the track, so nothing is transmitted and the
    // browser's own mic indicator reflects the truth.
    this.micNode?.port.postMessage({ type: "mute", value: muted });
    this.mediaStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  async connect(): Promise<void> {
    if (!this.cfg.token) {
      throw new Error("No voice credentials were issued");
    }

    // Open the socket and take the microphone in parallel rather than in
    // sequence. Both take a few hundred ms and neither depends on the other,
    // so serialising them doubles the time before the visitor can talk.
    const [, micStream] = await Promise.all([
      this.openSocket(),
      this.takeMicrophone(),
    ]);
    this.mediaStream = micStream;

    if (this.closed) return;

    this.configureSession();
    await this.startAudio();

    if (this.closed) return;

    this.connected = true;
    this.cfg.onConnected?.();
    this.cfg.onSpeakingState?.("listening");

    // Ask for the opening line. The instructions already carry the chat
    // context, so this greeting is continuous with what was typed.
    this.send({
      type: "response.create",
      response: {
        instructions:
          "Greet them in one or two sentences as their engineer. If there is prior chat context, reference the specific thing they asked about. Then stop and listen.",
      },
    });
  }

  private openSocket(): Promise<void> {
    const protocols = this.cfg.websocketProtocols?.length
      ? this.cfg.websocketProtocols
      : [`xai-client-secret.${this.cfg.token}`];

    const ws = new WebSocket(this.cfg.realtimeUrl, protocols);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("Voice connection timed out"));
      }, 15000);

      ws.onopen = () => {
        window.clearTimeout(timer);
        // Swap in the steady-state handlers only once open, so a connect
        // failure rejects instead of surfacing as a mid-call error toast.
        ws.onerror = () => this.cfg.onError?.("The voice connection dropped");
        ws.onclose = () => {
          if (!this.closed) {
            this.connected = false;
            this.cfg.onDisconnected?.();
          }
        };
        resolve();
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Could not reach the voice service"));
      };
      ws.onmessage = (ev) => {
        void this.handleMessage(ev.data);
      };
    });
  }

  private async takeMicrophone(): Promise<MediaStream> {
    // echoCancellation is not optional: without it the agent's own voice comes
    // back through the mic, retriggers server VAD, and it interrupts itself
    // mid-sentence.
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: true });
    } catch {
      // A camera is a nice-to-have on this stage; a microphone is the call.
      return navigator.mediaDevices.getUserMedia({ audio });
    }
  }

  private configureSession() {
    const { voice, instructions, turn_detection, tools, ...rest } = this.cfg.session;
    this.send({
      type: "session.update",
      session: {
        ...rest,
        voice: voice || "eve",
        instructions: instructions || "",
        turn_detection: turn_detection || {
          // Verified against the live API. A high threshold matters because
          // an office lobby is noisy and every false trigger interrupts Atlas.
          type: "server_vad",
          threshold: 0.85,
          silence_duration_ms: 500,
          prefix_padding_ms: 333,
        },
        audio: {
          input: {
            format: { type: "audio/pcm", rate: SAMPLE_RATE },
            transport: "json",
            transcription: { language_hint: "en" },
          },
          output: {
            format: { type: "audio/pcm", rate: SAMPLE_RATE },
            transport: "json",
            speed: 1.0,
          },
        },
        tools: tools ?? [],
      },
    });
  }

  private async startAudio() {
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.ctx = ctx;

    const micUrl = workletUrl(MIC_WORKLET);
    const playerUrl = workletUrl(PLAYER_WORKLET);
    this.blobUrls.push(micUrl, playerUrl);
    await Promise.all([ctx.audioWorklet.addModule(micUrl), ctx.audioWorklet.addModule(playerUrl)]);

    if (ctx.state === "suspended") await ctx.resume();

    // ── Playback ──
    const player = new AudioWorkletNode(ctx, "pcm-player", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { capacity: SAMPLE_RATE * 8 },
    });
    this.playerNode = player;
    player.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { type: string; value?: number };
      if (d.type === "level") {
        this.cfg.onLevel?.(Math.min(1, (d.value ?? 0) * 8));
      } else if (d.type === "drained") {
        // The only signal that the agent actually stopped talking.
        this.speaking = false;
        this.cfg.onLevel?.(0);
        if (!this.closed) this.cfg.onSpeakingState?.("listening");
      }
    };
    player.connect(ctx.destination);

    // ── Capture ──
    const audioTracks = this.mediaStream?.getAudioTracks() ?? [];
    if (!audioTracks.length) {
      throw new Error("No microphone is available");
    }
    const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
    this.micSource = source;

    const mic = new AudioWorkletNode(ctx, "mic-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { frames: CAPTURE_FRAMES },
    });
    this.micNode = mic;
    mic.port.onmessage = (e: MessageEvent) => {
      const pcm = e.data as Int16Array;

      // The visitor's own level, measured from the exact samples being sent.
      // Cheap at 1920 samples per 40ms, and it lets the stage show that we are
      // really hearing them rather than animating a decorative bar.
      if (this.cfg.onInputLevel && !this.muted) {
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) {
          const v = (pcm[i] ?? 0) / 0x8000;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / pcm.length);
        this.inputEnv = rms > this.inputEnv ? rms * 0.7 + this.inputEnv * 0.3 : rms * 0.2 + this.inputEnv * 0.8;
        this.cfg.onInputLevel(Math.min(1, this.inputEnv * 8));
      }

      // Under server_vad we append continuously and never commit; the server
      // segments the turns. Sending commit here would break turn detection.
      this.send({ type: "input_audio_buffer.append", audio: b64FromInt16(pcm) });
    };

    // A worklet only runs while it is part of a live graph, so route it to the
    // destination through a silent gain rather than letting the mic play back
    // into the room.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.micSink = sink;
    source.connect(mic);
    mic.connect(sink);
    sink.connect(ctx.destination);

    this.setMuted(this.muted);
  }

  /** Drop everything queued for playback. Used for barge-in. */
  private flushPlayback() {
    this.playerNode?.port.postMessage({ type: "flush" });
    this.speaking = false;
    this.cfg.onLevel?.(0);
  }

  private async handleMessage(raw: unknown) {
    let data: Record<string, unknown>;
    try {
      const text =
        typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer);
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = String(data.type || "");

    switch (type) {
      // Keeps the socket alive. Explicitly a no-op so it does not fall through
      // to the unknown-event branch and get surfaced as activity.
      case "ping":
        return;

      case "session.created":
      case "session.updated":
      case "conversation.created":
        return;

      case "input_audio_buffer.speech_started": {
        // BARGE-IN. Audio already buffered locally keeps playing over the
        // person unless it is dropped right now. Without this the call feels
        // robotic and people end up talking over it constantly.
        this.flushPlayback();
        this.userItemId = null;
        this.cfg.onSpeakingState?.("listening");
        return;
      }

      case "input_audio_buffer.speech_stopped":
        this.cfg.onSpeakingState?.("thinking");
        return;

      // Both of these are CUMULATIVE and both repeat. Replace, never append.
      // `.completed` is not a one-shot final event on xAI: a single utterance
      // produced seven of them, each a longer prefix of the same sentence.
      case "conversation.item.input_audio_transcription.updated":
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = String(data.transcript ?? "");
        if (!transcript) return;
        const itemId = String(data.item_id ?? this.userItemId ?? `user_${Date.now()}`);
        // A new item id means a new spoken turn, not a longer prefix of the
        // one already on screen.
        if (itemId !== this.userItemId) this.userTurn += 1;
        this.userItemId = itemId;
        this.cfg.onTranscript?.({
          id: `user_${itemId}`,
          speaker: "prospect",
          text: transcript,
          at: new Date().toISOString(),
          final: type.endsWith(".completed"),
          turnId: this.userTurn,
        });
        this.cfg.onTranscriptDelta?.("prospect", transcript, this.userTurn);
        return;
      }

      case "response.created":
        this.agentBuf = "";
        this.agentTurn += 1;
        this.agentItemId = String(data.response_id ?? `resp_${Date.now()}`);
        this.cfg.onSpeakingState?.("thinking");
        return;

      case "response.output_audio.delta":
      case "response.audio.delta": {
        const b64 = String(data.delta ?? "");
        if (!b64) return;
        if (!this.speaking) {
          this.speaking = true;
          this.cfg.onSpeakingState?.("speaking");
        }
        try {
          const samples = floatsFromB64(b64);
          this.playerNode?.port.postMessage({ type: "push", samples }, [samples.buffer]);
        } catch {
          /* A single malformed chunk must not take the call down. */
        }
        return;
      }

      // The agent's own transcript IS incremental, unlike the user's.
      case "response.output_audio_transcript.delta":
      case "response.output_text.delta": {
        const delta = String(data.delta ?? "");
        if (!delta) return;
        this.agentBuf += delta;
        this.emitAgentLine(false);
        return;
      }

      case "response.output_audio_transcript.done": {
        const text = String(data.transcript ?? this.agentBuf);
        this.agentBuf = text;
        this.emitAgentLine(true);
        return;
      }

      case "response.function_call_arguments.done": {
        const name = String(data.name ?? "");
        const callId = String(data.call_id ?? "");
        if (!name || !callId) return;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(data.arguments ?? "{}")) as Record<string, unknown>;
        } catch {
          /* A tool with unparseable arguments still gets an honest result. */
        }
        this.pendingTools.push({ callId, name, args });
        this.cfg.onActivity?.({
          id: callId,
          type: "using_tool",
          label: humanizeTool(name),
          state: "running",
        });
        return;
      }

      case "response.done": {
        if (this.agentBuf.trim()) this.emitAgentLine(true);
        this.agentBuf = "";
        this.agentItemId = null;
        // Tools are executed as a batch and answered with exactly ONE
        // response.create, per the protocol.
        if (this.pendingTools.length) await this.runPendingTools();
        else if (!this.speaking) this.cfg.onSpeakingState?.("listening");
        return;
      }

      case "error": {
        const err = data.error as { message?: string; code?: string } | undefined;
        this.cfg.onError?.(err?.message || "The voice service reported an error");
        return;
      }

      default:
        return;
    }
  }

  private emitAgentLine(final: boolean) {
    const text = this.agentBuf.trim();
    if (!text) return;
    this.cfg.onTranscript?.({
      id: `agent_${this.agentItemId ?? "current"}`,
      speaker: "agent",
      text,
      at: new Date().toISOString(),
      final,
      turnId: this.agentTurn,
    });
    this.cfg.onTranscriptDelta?.("agent", text, this.agentTurn);
  }

  private async runPendingTools() {
    const batch = this.pendingTools;
    this.pendingTools = [];

    for (const call of batch) {
      const handler = this.cfg.toolHandlers?.[call.name];
      let output: unknown;
      let failed = false;
      try {
        output = handler
          ? await handler(call.args)
          : { error: `No handler for tool ${call.name}` };
        failed = !handler;
      } catch (err) {
        failed = true;
        output = { error: err instanceof Error ? err.message : "Tool failed" };
      }

      this.cfg.onActivity?.({
        id: call.callId,
        type: "using_tool",
        label: humanizeTool(call.name),
        state: failed ? "failed" : "done",
        detail: summarizeToolResult(output),
      });

      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify(output ?? null),
        },
      });
    }

    // Exactly one response.create for the whole batch.
    this.send({ type: "response.create" });
  }

  private send(payload: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  async disconnect() {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;

    try {
      this.micNode?.port.close();
      this.playerNode?.port.close();
      this.micSource?.disconnect();
      this.micNode?.disconnect();
      this.micSink?.disconnect();
      this.playerNode?.disconnect();
    } catch {
      /* Teardown is best effort. */
    }
    this.micNode = null;
    this.playerNode = null;
    this.micSource = null;
    this.micSink = null;

    try {
      await this.ctx?.close();
    } catch {
      /* Already closed. */
    }
    this.ctx = null;

    for (const url of this.blobUrls) URL.revokeObjectURL(url);
    this.blobUrls = [];

    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;

    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      try {
        this.ws.close();
      } catch {
        /* Already closing. */
      }
    }
    this.ws = null;
    this.cfg.onDisconnected?.();
  }
}

/** "email_conversation_summary" reads as "Emailing conversation summary". */
function humanizeTool(name: string): string {
  const words = name.replace(/[_.]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function summarizeToolResult(output: unknown): string | undefined {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.error === "string") return o.error;
    if (typeof o.summary === "string") return o.summary;
    if (typeof o.to === "string") return `Sent to ${o.to}`;
  }
  return undefined;
}
