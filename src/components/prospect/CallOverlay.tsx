"use client";

import { AgentActivity } from "@/components/prospect/AgentActivity";
import { CallVideoStage } from "@/components/prospect/CallVideoStage";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { api } from "@/lib/api/client";
import { upsertTurn, type LiveLine } from "@/lib/realtime/transcript";
import { VoiceSession } from "@/lib/realtime/voice-session";
import { cn, formatDuration } from "@/lib/utils";
import type {
  AgentEvent,
  CallMedia,
  CallSpeakingState,
  CallTranscriptLine,
  ProspectMemory,
} from "@/types/ui";
import {
  IconMic,
  IconMicOff,
  IconPhoneOff,
  IconSubtitles,
  IconVideo,
  IconVideoOff,
  IconX,
} from "@/components/icons";
import { useEffect, useRef, useState } from "react";

interface CallOverlayProps {
  open: boolean;
  agentName: string;
  conversationId: string;
  faceImageUrl?: string;
  onClose: () => void;
  onComplete: (result: {
    learned: string[];
    prospect: ProspectMemory;
    transcript: CallTranscriptLine[];
    durationSeconds: number;
  }) => void;
}

export function CallOverlay({
  open,
  agentName,
  conversationId,
  faceImageUrl,
  onClose,
  onComplete,
}: CallOverlayProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "ending" | "ended">(
    "connecting",
  );
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState<CallTranscriptLine[]>([]);
  const [activity, setActivity] = useState<AgentEvent[]>([]);
  const [learned, setLearned] = useState<string[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [media, setMedia] = useState<CallMedia | undefined>();
  const [speakingState, setSpeakingState] = useState<CallSpeakingState>("idle");
  const [showTranscript, setShowTranscript] = useState(true);
  const [caption, setCaption] = useState("");
  /** In-progress speech, rendered as a single bubble that rewrites in place. */
  const [live, setLive] = useState<LiveLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMockVoice, setIsMockVoice] = useState(false);

  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const transcriptRef = useRef<CallTranscriptLine[]>([]);
  const secondsRef = useRef(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    if (!open) return;
    endingRef.current = false;
    setStatus("connecting");
    setSeconds(0);
    setTranscript([]);
    transcriptRef.current = [];
    setActivity([{ type: "searching_knowledge", label: "Connecting secure video channel" }]);
    setLearned([]);
    setMuted(false);
    setCamOff(false);
    setSpeakingState("idle");
    setCaption("");
    setLive(null);
    setError(null);
    setLocalStream(null);
    setIsMockVoice(false);
    setMedia({ faceImageUrl, displayName: agentName });

    let cancelled = false;

    // Face generation is slow and entirely optional — resolve it beside the
    // connection, never in front of it, and merge it in whenever it lands.
    if (!faceImageUrl) {
      void api
        .getAgentFace()
        .then((face) => {
          if (cancelled || !face.faceImageUrl) return;
          setMedia((prev) => ({ ...prev, ...face }));
        })
        .catch(() => undefined);
    }

    (async () => {
      try {
        const session = await api.startCall(conversationId);
        if (cancelled) return;

        setCallId(session.id);
        // Merge — the generated face may already have landed ahead of this.
        setMedia((prev) => ({
          ...prev,
          ...session.media,
          faceImageUrl: faceImageUrl || session.media?.faceImageUrl || prev?.faceImageUrl,
          faceVideoUrl: session.media?.faceVideoUrl || prev?.faceVideoUrl,
          displayName: session.media?.displayName || agentName,
        }));
        setIsMockVoice(Boolean(session.mock));

        const voice = new VoiceSession({
          token: session.realtimeToken || "",
          realtimeUrl: session.realtimeUrl || "wss://api.x.ai/v1/realtime",
          websocketProtocols: session.websocketProtocols,
          // No `mock` here on purpose. The session has no simulated mode: a
          // canned script played as though it were the agent is worse than an
          // honest failure. `isMockVoice` above still records what the server
          // reported, so this surface can say so rather than pretend.
          session: {
            voice: session.voiceSession?.voice || "eve",
            instructions: session.voiceSession?.instructions || "",
            turn_detection: session.voiceSession?.turn_detection || { type: "server_vad" },
            tools: session.voiceSession?.tools || [],
          },
          onConnected: () => {
            if (cancelled) return;
            setStatus("connected");
            setSpeakingState("listening");
            setLocalStream(voice.localStream);
            timerRef.current = window.setInterval(() => {
              setSeconds((s) => s + 1);
            }, 1000);
          },
          onSpeakingState: (s) => {
            if (!cancelled) setSpeakingState(s);
          },
          onActivity: (ev) => {
            if (cancelled) return;
            setActivity((prev) => [
              ...prev.slice(-4),
              { type: (ev.type as AgentEvent["type"]) || "using_tool", label: ev.label },
            ]);
          },
          onTranscript: (line) => {
            if (cancelled) return;
            setTranscript((prev) => {
              const next = upsertTurn(prev, {
                id: line.id,
                speaker: line.speaker,
                text: line.text,
                at: line.at,
                turnId: line.turnId,
              });
              transcriptRef.current = next;
              return next;
            });
            // The finalised text supersedes whatever was streaming for this turn.
            setLive(null);
            setCaption(line.text);
          },
          onTranscriptDelta: (speaker, text, turnId) => {
            if (cancelled) return;
            setCaption(text);
            setLive({ speaker, text, turnId });
            if (speaker === "agent") setSpeakingState("speaking");
          },
          onError: (msg) => {
            if (!cancelled) setError(msg);
          },
          onDisconnected: () => {
            /* ended via hangup */
          },
        });

        sessionRef.current = voice;
        await voice.connect();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not start call");
        setStatus("ended");
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      void sessionRef.current?.disconnect();
      sessionRef.current = null;
    };
  }, [open, conversationId, agentName, faceImageUrl]);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    el.srcObject = localStream;
    el.muted = true;
    void el.play().catch(() => undefined);
    return () => {
      el.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, live]);

  useEffect(() => {
    sessionRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = !camOff;
    });
  }, [camOff, localStream]);

  async function endCall() {
    if (endingRef.current || status === "ending" || status === "ended") return;
    endingRef.current = true;
    setStatus("ending");
    setSpeakingState("idle");
    if (timerRef.current) window.clearInterval(timerRef.current);

    await sessionRef.current?.disconnect();
    sessionRef.current = null;

    const lines = transcriptRef.current;
    const dur = secondsRef.current;

    try {
      const result = await api.completeCall({
        callId: callId || `call_${Date.now()}`,
        conversationId,
        transcript: lines,
        durationSeconds: dur,
      });
      setLearned(result.learned);
      setStatus("ended");
      onComplete({
        learned: result.learned,
        prospect: result.prospect,
        transcript: lines,
        durationSeconds: dur,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save call");
      setStatus("ended");
    }
  }

  if (!open) return null;

  const hasLocalVideo = Boolean(localStream?.getVideoTracks().some((t) => t.enabled && t.readyState === "live"));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg text-fg">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={agentName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-fg">
              {agentName}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-fg-muted">
              Forward-Deployed Engineer
            </p>
          </div>
          <span
            className={cn(
              "ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              status === "connected" && "border-success/25 bg-success-dim text-success",
              status === "connecting" && "border-border bg-bg text-fg-muted",
              status === "ending" && "border-warning/25 bg-warning-dim text-warning",
              status === "ended" && "border-border bg-bg text-fg-muted",
            )}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                status === "connected" && "bg-success",
                status === "connecting" && "animate-pulse-soft bg-fg-faint",
                status === "ending" && "bg-warning",
                status === "ended" && "bg-fg-faint",
              )}
            />
            {status === "connecting" && "Connecting…"}
            {status === "connected" && (isMockVoice ? "Demo call" : "Live")}
            {status === "ending" && "Saving memory…"}
            {status === "ended" && "Ended"}
          </span>
          <span className="mono-ts shrink-0 tabular-nums text-fg-secondary">
            {formatDuration(seconds)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-premium",
              showTranscript
                ? "border-border-strong bg-bg-hover text-fg"
                : "border-border bg-bg-elevated text-fg-muted hover:bg-bg-hover hover:text-fg",
            )}
          >
            <IconSubtitles className="h-4 w-4" />
            Transcript
          </button>
          {status === "ended" ? (
            <IconButton
              label="Close"
              variant="solid"
              className="border border-border bg-bg-elevated text-fg-secondary hover:bg-bg-hover"
              onClick={onClose}
            >
              <IconX className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 mb-1 rounded-xl border border-danger/25 bg-danger-dim px-3 py-2 text-[13px] text-danger sm:mx-6">
          {error}
        </div>
      )}

      {/* Main stage */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 sm:px-6 lg:flex-row lg:gap-4">
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
          <CallVideoStage
            agentName={agentName}
            media={media}
            speakingState={speakingState}
            status={status}
            className="w-full max-w-3xl shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          />

          {/* Local FaceTime PiP */}
          <div className="absolute bottom-3 right-3 overflow-hidden rounded-2xl border border-white/20 bg-black/60 shadow-lg sm:bottom-4 sm:right-4">
            <div className="relative h-[112px] w-[84px] sm:h-[140px] sm:w-[105px]">
              {hasLocalVideo && !camOff ? (
                <video
                  ref={localVideoRef}
                  className="h-full w-full scale-x-[-1] object-cover"
                  playsInline
                  muted
                  autoPlay
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#141820] px-2 text-center">
                  <IconVideoOff className="h-5 w-5 text-white/40" aria-hidden />
                  <span className="text-[10px] font-medium text-white/45">You</span>
                </div>
              )}
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm">
                You
              </span>
            </div>
          </div>

          {caption && status === "connected" && !showTranscript && (
            <div className="mt-3 w-full max-w-2xl rounded-2xl border border-border bg-bg-elevated px-4 py-2.5 text-center text-[14px] leading-snug text-fg shadow-sm lg:hidden">
              {caption}
            </div>
          )}
        </div>

        {showTranscript && (
          <aside className="flex max-h-[34vh] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-sm lg:max-h-none lg:w-[320px]">
            {activity.length > 0 && status !== "ended" && (
              <div className="border-b border-border px-4 py-3">
                <p className="mb-2 text-[11px] font-medium tracking-[-0.01em] text-fg-muted">
                  Live activity
                </p>
                <AgentActivity events={activity.slice(-3)} live />
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
              <p className="mb-3 text-[11px] font-medium tracking-[-0.01em] text-fg-muted">
                Transcript
              </p>
              {transcript.length === 0 && status !== "ended" ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center">
                  <p className="text-[13.5px] font-medium text-fg">Listening…</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
                    Just start talking. {agentName} already has this thread&rsquo;s memory and your
                    company tools.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {transcript.map((line) => (
                    <div
                      key={line.id}
                      className={cn(
                        "rounded-xl px-3 py-2",
                        line.speaker === "agent" ? "bg-bg" : "bg-brand-dim",
                      )}
                    >
                      <p
                        className={cn(
                          "text-[11px] font-medium tracking-[-0.01em]",
                          line.speaker === "agent" ? "text-call" : "text-fg-muted",
                        )}
                      >
                        {line.speaker === "agent" ? agentName : "You"}
                      </p>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed text-fg-secondary">
                        {line.text}
                      </p>
                    </div>
                  ))}
                  {/* One in-progress bubble, rewritten in place as words arrive
                      — for whoever is currently speaking, not just the agent. */}
                  {live?.text && status === "connected" && (
                    <div
                      className={cn(
                        "rounded-xl px-3 py-2",
                        live.speaker === "agent" ? "bg-bg" : "bg-brand-dim",
                      )}
                    >
                      <p
                        className={cn(
                          "flex items-center gap-1.5 text-[11px] font-medium tracking-[-0.01em]",
                          live.speaker === "agent" ? "text-call" : "text-fg-muted",
                        )}
                      >
                        {live.speaker === "agent" ? agentName : "You"}
                        <span className="inline-block h-1 w-1 animate-pulse-soft rounded-full bg-current" />
                      </p>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed text-fg-secondary">
                        {live.text}
                      </p>
                    </div>
                  )}

                  {/* Sits in the scroll flow, not pinned to the bottom of an
                      otherwise empty column. */}
                  {status === "ended" && learned.length > 0 && (
                    <div className="mt-4 rounded-xl border border-brand-border bg-brand-dim px-3 py-3">
                      <p className="mb-1.5 text-[11px] font-medium text-fg">
                        {agentName} learned
                      </p>
                      <ul className="space-y-1">
                        {learned.map((item) => (
                          <li key={item} className="text-[13px] leading-relaxed text-fg-secondary">
                            · {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>

            {status === "ended" && (
              <div className="shrink-0 border-t border-border px-4 py-3">
                <p className="mono-ts uppercase tracking-[0.14em]">Call summary</p>
                <p className="mt-1 text-[13px] text-fg-secondary">
                  {formatDuration(seconds)} · {transcript.length}{" "}
                  {transcript.length === 1 ? "line" : "lines"} · saved to the thread
                </p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-border bg-bg-elevated px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-center gap-3">
          {status !== "ended" ? (
            <>
              {/* Labelled: the dotted icon set is deliberately low-contrast, so
                  icon-only controls make muted-vs-live ambiguous mid-call. */}
              <button
                type="button"
                aria-pressed={muted}
                onClick={() => setMuted((m) => !m)}
                className={cn(
                  "flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-premium",
                  muted
                    ? "border-danger/30 bg-danger-dim text-danger"
                    : "border-border bg-bg-elevated text-fg-secondary hover:bg-bg-hover",
                )}
              >
                {muted ? <IconMicOff className="h-5 w-5" /> : <IconMic className="h-5 w-5" />}
                {muted ? "Muted" : "Mic on"}
              </button>
              <button
                type="button"
                aria-pressed={camOff}
                onClick={() => setCamOff((c) => !c)}
                className={cn(
                  "flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-premium",
                  camOff
                    ? "border-danger/30 bg-danger-dim text-danger"
                    : "border-border bg-bg-elevated text-fg-secondary hover:bg-bg-hover",
                )}
              >
                {camOff ? <IconVideoOff className="h-5 w-5" /> : <IconVideo className="h-5 w-5" />}
                {camOff ? "Camera off" : "Camera on"}
              </button>
              {/* Plain button: `cn` only joins classes, so a Button variant's
                  bg-transparent would win over an override here. */}
              <button
                type="button"
                disabled={status === "ending"}
                onClick={() => void endCall()}
                className="flex h-12 min-w-[140px] items-center justify-center gap-2 rounded-full bg-danger px-5 text-[15px] font-medium text-white shadow-sm transition-premium hover:opacity-90 disabled:opacity-60"
              >
                {status === "ending" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                ) : (
                  <IconPhoneOff className="h-4 w-4" />
                )}
                End
              </button>
            </>
          ) : (
            <Button
              size="lg"
              className="min-w-[200px] rounded-full"
              onClick={onClose}
            >
              Back to conversation
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
