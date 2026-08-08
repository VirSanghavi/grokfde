"use client";

import { AgentActivity } from "@/components/prospect/AgentActivity";
import { CallVideoStage } from "@/components/prospect/CallVideoStage";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { api } from "@/lib/api/client";
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
    setError(null);
    setLocalStream(null);
    setIsMockVoice(false);
    setMedia({
      faceImageUrl: faceImageUrl || "/agents/atlas-face.jpg",
      displayName: agentName,
    });

    let cancelled = false;

    (async () => {
      try {
        const session = await api.startCall(conversationId);
        if (cancelled) return;

        setCallId(session.id);
        setMedia({
          faceImageUrl: faceImageUrl || session.media?.faceImageUrl || "/agents/atlas-face.jpg",
          displayName: session.media?.displayName || agentName,
          ...session.media,
        });
        setIsMockVoice(Boolean(session.mock));

        const voice = new VoiceSession({
          token: session.realtimeToken || "",
          realtimeUrl: session.realtimeUrl || "wss://api.x.ai/v1/realtime",
          websocketProtocols: session.websocketProtocols,
          mock: Boolean(session.mock),
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
            const mapped: CallTranscriptLine = {
              id: line.id,
              speaker: line.speaker,
              text: line.text,
              at: line.at,
            };
            setTranscript((prev) => {
              // Replace trailing partial from same speaker if caption was streaming
              const next = [...prev, mapped];
              transcriptRef.current = next;
              return next;
            });
            setCaption(line.text);
          },
          onTranscriptDelta: (speaker, text) => {
            if (!cancelled) {
              setCaption(text);
              if (speaker === "agent") setSpeakingState("speaking");
            }
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
  }, [transcript, caption]);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0d10] text-white">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white">
            {agentName}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[12px] text-white/50">
            <span className="tabular-nums font-medium text-white/70">{formatDuration(seconds)}</span>
            <span className="text-white/25">·</span>
            <span>
              {status === "connecting" && "Connecting…"}
              {status === "connected" && (isMockVoice ? "Live demo call" : "Live · context loaded")}
              {status === "ending" && "Saving memory…"}
              {status === "ended" && "Call ended"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            label={showTranscript ? "Hide transcript" : "Show transcript"}
            variant="solid"
            className="border-0 bg-white/10 text-white hover:bg-white/15"
            onClick={() => setShowTranscript((v) => !v)}
          >
            <IconSubtitles className="h-4 w-4" />
          </IconButton>
          {status === "ended" ? (
            <IconButton
              label="Close"
              variant="solid"
              className="border-0 bg-white/10 text-white hover:bg-white/15"
              onClick={onClose}
            >
              <IconX className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[13px] text-white/80 sm:mx-6">
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
            <div className="mt-3 w-full max-w-2xl rounded-2xl bg-white/10 px-4 py-2.5 text-center text-[14px] leading-snug text-white/90 backdrop-blur-sm lg:hidden">
              {caption}
            </div>
          )}
        </div>

        {showTranscript && (
          <aside className="flex max-h-[34vh] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] lg:max-h-none lg:w-[320px]">
            {activity.length > 0 && status !== "ended" && (
              <div className="border-b border-white/[0.08] px-4 py-3">
                <p className="mb-2 text-[11px] font-medium tracking-[-0.01em] text-white/40">
                  Live activity
                </p>
                <div className="[&_span]:text-white/70 [&_svg]:text-white/55">
                  <AgentActivity events={activity.slice(-3)} live />
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
              <p className="mb-3 text-[11px] font-medium tracking-[-0.01em] text-white/40">
                Transcript
              </p>
              {transcript.length === 0 && status !== "ended" ? (
                <p className="text-[13.5px] text-white/40">
                  Speak naturally. {agentName} has your chat memory and company tools.
                </p>
              ) : (
                <div className="space-y-3">
                  {transcript.map((line) => (
                    <div key={line.id}>
                      <p
                        className={cn(
                          "text-[11px] font-medium tracking-[-0.01em]",
                          line.speaker === "agent" ? "text-sky-300/90" : "text-white/40",
                        )}
                      >
                        {line.speaker === "agent" ? agentName : "You"}
                      </p>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/88">
                        {line.text}
                      </p>
                    </div>
                  ))}
                  {caption &&
                    status === "connected" &&
                    speakingState === "speaking" &&
                    transcript[transcript.length - 1]?.text !== caption && (
                      <div>
                        <p className="text-[11px] font-medium text-sky-300/90">{agentName}</p>
                        <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/60">
                          {caption}
                        </p>
                      </div>
                    )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>

            {status === "ended" && learned.length > 0 && (
              <div className="border-t border-white/[0.08] px-4 py-3">
                <p className="mb-2 text-[11px] font-medium text-white/45">
                  {agentName} learned
                </p>
                <ul className="space-y-1">
                  {learned.map((item) => (
                    <li key={item} className="text-[13px] text-white/85">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-white/[0.08] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-center gap-3">
          {status !== "ended" ? (
            <>
              <IconButton
                label={muted ? "Unmute" : "Mute"}
                variant="solid"
                size="lg"
                className={cn(
                  "border-0 text-white",
                  muted ? "bg-white text-[#111]" : "bg-white/10 hover:bg-white/15",
                )}
                onClick={() => setMuted((m) => !m)}
              >
                {muted ? <IconMicOff className="h-5 w-5" /> : <IconMic className="h-5 w-5" />}
              </IconButton>
              <IconButton
                label={camOff ? "Camera on" : "Camera off"}
                variant="solid"
                size="lg"
                className={cn(
                  "border-0 text-white",
                  camOff ? "bg-white text-[#111]" : "bg-white/10 hover:bg-white/15",
                )}
                onClick={() => setCamOff((c) => !c)}
              >
                {camOff ? <IconVideoOff className="h-5 w-5" /> : <IconVideo className="h-5 w-5" />}
              </IconButton>
              <Button
                size="lg"
                variant="danger"
                className="min-w-[140px] border-0 bg-[#e5484d] text-white hover:bg-[#d63d42]"
                leftIcon={<IconPhoneOff className="h-4 w-4" />}
                onClick={() => void endCall()}
                loading={status === "ending"}
              >
                End
              </Button>
            </>
          ) : (
            <Button
              size="lg"
              className="min-w-[200px] rounded-full bg-white text-[#111] hover:bg-[#fafafa]"
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
