/**
 * Browser xAI Realtime (Grok Voice) session.
 * Connects with ephemeral client secret, streams mic PCM16 @ 24kHz,
 * plays agent audio, surfaces transcripts + tool activity.
 */

export type VoiceSpeakingState = "idle" | "listening" | "thinking" | "speaking";

export type VoiceActivityEvent = {
  type: string;
  label: string;
};

export type VoiceTranscriptLine = {
  id: string;
  speaker: "agent" | "prospect";
  text: string;
  at: string;
  final?: boolean;
};

export type VoiceSessionConfig = {
  token: string;
  realtimeUrl: string;
  websocketProtocols?: string[];
  mock?: boolean;
  session: {
    voice?: string;
    instructions?: string;
    turn_detection?: { type: string; [k: string]: unknown };
    tools?: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };
  onTranscript?: (line: VoiceTranscriptLine) => void;
  onTranscriptDelta?: (speaker: "agent" | "prospect", text: string) => void;
  onSpeakingState?: (state: VoiceSpeakingState) => void;
  onActivity?: (event: VoiceActivityEvent) => void;
  onError?: (message: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

const SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4096;

function b64FromInt16(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function int16FromB64(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function downsampleTo16kOr24k(
  input: Float32Array,
  inRate: number,
  outRate: number,
): Int16Array {
  if (inRate === outRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]!));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inRate / outRate;
  const newLen = Math.floor(input.length / ratio);
  const out = new Int16Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, input[idx]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export class VoiceSession {
  private ws: WebSocket | null = null;
  private cfg: VoiceSessionConfig;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private playContext: AudioContext | null = null;
  private nextPlayTime = 0;
  private muted = false;
  private closed = false;
  private agentBuf = "";
  private userBuf = "";
  private lineSeq = 0;
  private mockTimer: number | null = null;

  constructor(cfg: VoiceSessionConfig) {
    this.cfg = cfg;
  }

  get localStream(): MediaStream | null {
    return this.mediaStream;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.mediaStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  async connect(): Promise<void> {
    if (this.cfg.mock || this.cfg.token.startsWith("mock_voice_")) {
      await this.connectMock();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: true,
    }).catch(async () => {
      // Video optional — still get mic
      return navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    });

    this.mediaStream = stream;

    const protocols =
      this.cfg.websocketProtocols?.length
        ? this.cfg.websocketProtocols
        : [`xai-client-secret.${this.cfg.token}`];

    const ws = new WebSocket(this.cfg.realtimeUrl, protocols);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("Voice connection timed out")), 15000);
      ws.onopen = () => {
        window.clearTimeout(t);
        resolve();
      };
      ws.onerror = () => {
        window.clearTimeout(t);
        reject(new Error("Voice WebSocket failed to connect"));
      };
    });

    ws.onmessage = (ev) => {
      void this.handleMessage(ev.data);
    };
    ws.onclose = () => {
      if (!this.closed) {
        this.cfg.onDisconnected?.();
      }
    };
    ws.onerror = () => {
      this.cfg.onError?.("Voice connection error");
    };

    // Configure session with full FDE context + tools + transcription
    this.send({
      type: "session.update",
      session: {
        voice: this.cfg.session.voice || "eve",
        instructions: this.cfg.session.instructions || "",
        turn_detection: this.cfg.session.turn_detection || {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: this.cfg.session.tools || [],
        input_audio_transcription: { model: "whisper-1" },
        audio: {
          input: {
            format: { type: "audio/pcm", rate: SAMPLE_RATE },
          },
          output: {
            format: { type: "audio/pcm", rate: SAMPLE_RATE },
          },
        },
        ...Object.fromEntries(
          Object.entries(this.cfg.session).filter(
            ([k]) =>
              !["voice", "instructions", "turn_detection", "tools"].includes(k),
          ),
        ),
      },
    });

    await this.startMicCapture();
    this.cfg.onConnected?.();
    this.cfg.onSpeakingState?.("listening");
    this.cfg.onActivity?.({
      type: "searching_knowledge",
      label: "Live with full company context",
    });

    // Nudge the agent to greet with continuity
    this.send({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions:
          "Greet the prospect briefly as their FDE. Reference any prior chat context if present. Keep it to two sentences, then listen.",
      },
    });
  }

  private async connectMock(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
    } catch {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        this.mediaStream = null;
      }
    }

    this.cfg.onConnected?.();
    this.cfg.onSpeakingState?.("listening");
    this.cfg.onActivity?.({
      type: "searching_knowledge",
      label: "Demo mode · simulated voice with live context payload",
    });

    const script: Array<{ speaker: "agent" | "prospect"; text: string; delay: number; activity?: string }> = [
      {
        speaker: "agent",
        text: "Hey — good to put a voice to the thread. I already have your chat context loaded.",
        delay: 900,
      },
      {
        speaker: "agent",
        text: "What should we dig into first: architecture, security, or how this lands in your stack?",
        delay: 2200,
        activity: "Loaded prospect memory and company knowledge",
      },
    ];

    let i = 0;
    const tick = () => {
      if (this.closed || i >= script.length) {
        this.cfg.onSpeakingState?.("listening");
        return;
      }
      const step = script[i]!;
      i += 1;
      if (step.activity) {
        this.cfg.onActivity?.({ type: "searching_knowledge", label: step.activity });
      }
      this.cfg.onSpeakingState?.(step.speaker === "agent" ? "speaking" : "listening");
      this.emitFinal(step.speaker, step.text);
      this.mockTimer = window.setTimeout(() => {
        this.cfg.onSpeakingState?.("listening");
        this.mockTimer = window.setTimeout(tick, step.delay);
      }, Math.min(2800, 800 + step.text.length * 20));
    };
    this.mockTimer = window.setTimeout(tick, 600);
  }

  private async startMicCapture() {
    const audioTracks = this.mediaStream?.getAudioTracks() ?? [];
    if (!audioTracks.length) {
      this.cfg.onError?.("Microphone unavailable");
      return;
    }

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.audioContext = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // Some browsers ignore requested sampleRate — resample as needed
    const micStream = new MediaStream(audioTracks);
    const source = ctx.createMediaStreamSource(micStream);
    this.source = source;
    const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
    this.processor = processor;

    processor.onaudioprocess = (e) => {
      if (this.muted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm = downsampleTo16kOr24k(input, ctx.sampleRate, SAMPLE_RATE);
      this.send({
        type: "input_audio_buffer.append",
        audio: b64FromInt16(pcm),
      });
    };

    source.connect(processor);
    processor.connect(ctx.destination);
  }

  private async ensurePlayContext() {
    if (!this.playContext) {
      this.playContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.nextPlayTime = 0;
    }
    if (this.playContext.state === "suspended") await this.playContext.resume();
    return this.playContext;
  }

  private async playPcm16(samples: Int16Array) {
    const ctx = await this.ensurePlayContext();
    const floats = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      floats[i] = (samples[i] ?? 0) / 0x8000;
    }
    const buffer = ctx.createBuffer(1, floats.length, SAMPLE_RATE);
    buffer.copyToChannel(floats, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    const start = Math.max(now + 0.02, this.nextPlayTime);
    src.start(start);
    this.nextPlayTime = start + buffer.duration;
  }

  private async handleMessage(raw: unknown) {
    let data: Record<string, unknown>;
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer);
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = String(data.type || "");

    switch (type) {
      case "session.created":
      case "session.updated":
        this.cfg.onActivity?.({ type: "searching_knowledge", label: "Session ready" });
        break;

      case "input_audio_buffer.speech_started":
        this.cfg.onSpeakingState?.("listening");
        this.userBuf = "";
        break;

      case "input_audio_buffer.speech_stopped":
        this.cfg.onSpeakingState?.("thinking");
        break;

      case "conversation.item.input_audio_transcription.delta": {
        const delta = String(data.delta ?? data.text ?? "");
        if (delta) {
          this.userBuf += delta;
          this.cfg.onTranscriptDelta?.("prospect", this.userBuf);
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const text = String(data.transcript ?? data.text ?? this.userBuf).trim();
        if (text) this.emitFinal("prospect", text);
        this.userBuf = "";
        break;
      }

      case "response.created":
        this.cfg.onSpeakingState?.("thinking");
        this.agentBuf = "";
        break;

      case "response.output_audio.delta":
      case "response.audio.delta": {
        this.cfg.onSpeakingState?.("speaking");
        const b64 = String(data.delta ?? data.audio ?? "");
        if (b64) {
          try {
            await this.playPcm16(int16FromB64(b64));
          } catch {
            /* ignore decode glitches */
          }
        }
        break;
      }

      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        const delta = String(data.delta ?? "");
        if (delta) {
          this.agentBuf += delta;
          this.cfg.onTranscriptDelta?.("agent", this.agentBuf);
        }
        break;
      }

      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const text = String(data.transcript ?? this.agentBuf).trim();
        if (text) this.emitFinal("agent", text);
        this.agentBuf = "";
        break;
      }

      case "response.output_text.delta":
      case "response.text.delta": {
        const delta = String(data.delta ?? "");
        if (delta) {
          this.agentBuf += delta;
          this.cfg.onTranscriptDelta?.("agent", this.agentBuf);
        }
        break;
      }

      case "response.function_call_arguments.delta":
      case "response.mcp_call.in_progress":
      case "response.mcp_call_arguments.delta":
        this.cfg.onSpeakingState?.("thinking");
        this.cfg.onActivity?.({
          type: "using_tool",
          label: "Running tool",
        });
        break;

      case "response.mcp_call.completed":
      case "response.function_call_arguments.done":
        this.cfg.onActivity?.({
          type: "using_tool",
          label: "Tool result ready",
        });
        break;

      case "response.file_search_call.in_progress":
      case "response.file_search_call.searching":
        this.cfg.onActivity?.({
          type: "searching_knowledge",
          label: "Searching company knowledge",
        });
        this.cfg.onSpeakingState?.("thinking");
        break;

      case "response.file_search_call.completed":
        this.cfg.onActivity?.({
          type: "searching_knowledge",
          label: "Knowledge retrieved",
        });
        break;

      case "response.done":
        if (this.agentBuf.trim()) {
          this.emitFinal("agent", this.agentBuf.trim());
          this.agentBuf = "";
        }
        this.cfg.onSpeakingState?.("listening");
        break;

      case "error": {
        const msg =
          (data.error as { message?: string } | undefined)?.message ||
          String(data.message || "Realtime error");
        this.cfg.onError?.(msg);
        break;
      }

      default:
        // Surface unknown tool-ish events lightly
        if (type.includes("mcp") || type.includes("tool") || type.includes("function")) {
          this.cfg.onActivity?.({ type: "using_tool", label: type.replace(/\./g, " ") });
        }
        break;
    }
  }

  private emitFinal(speaker: "agent" | "prospect", text: string) {
    this.lineSeq += 1;
    this.cfg.onTranscript?.({
      id: `tl_${this.lineSeq}_${Date.now()}`,
      speaker,
      text,
      at: new Date().toISOString(),
      final: true,
    });
  }

  private send(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  async disconnect() {
    this.closed = true;
    if (this.mockTimer) window.clearTimeout(this.mockTimer);
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    try {
      await this.audioContext?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.playContext?.close();
    } catch {
      /* ignore */
    }
    this.audioContext = null;
    this.playContext = null;
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.cfg.onDisconnected?.();
  }
}
