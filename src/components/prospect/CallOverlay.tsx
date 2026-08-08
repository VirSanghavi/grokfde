"use client";

import { AgentActivity } from "@/components/prospect/AgentActivity";
import { CallVideoStage } from "@/components/prospect/CallVideoStage";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { api } from "@/lib/api/client";
import { cn, formatDuration } from "@/lib/utils";
import type {
  AgentEvent,
  CallMedia,
  CallSpeakingState,
  CallTranscriptLine,
  ProspectMemory,
} from "@/types/ui";
import { Mic, MicOff, PhoneOff, Subtitles, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CallOverlayProps {
  open: boolean;
  agentName: string;
  conversationId: string;
  /** Optional company-configured face still (falls back to mock Atlas). */
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
    "connecting"
  );
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState<CallTranscriptLine[]>([]);
  const [activity, setActivity] = useState<AgentEvent[]>([]);
  const [learned, setLearned] = useState<string[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [media, setMedia] = useState<CallMedia | undefined>();
  const [speakingState, setSpeakingState] = useState<CallSpeakingState>("idle");
  const [showTranscript, setShowTranscript] = useState(true);
  const [caption, setCaption] = useState<string>("");
  const timerRef = useRef<number | null>(null);
  const scriptCancel = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    scriptCancel.current = false;
    setStatus("connecting");
    setSeconds(0);
    setTranscript([]);
    setActivity([{ type: "searching_knowledge", label: "Connecting secure video channel" }]);
    setLearned([]);
    setMuted(false);
    setSpeakingState("idle");
    setCaption("");
    setMedia({
      faceImageUrl: faceImageUrl || "/agents/atlas-face.jpg",
      displayName: agentName,
    });

    let localCallId: string | null = null;

    (async () => {
      const session = await api.startCall(conversationId);
      localCallId = session.id;
      setCallId(session.id);
      if (session.media) {
        setMedia((prev) => ({
          faceImageUrl: faceImageUrl || prev?.faceImageUrl || "/agents/atlas-face.jpg",
          displayName: agentName,
          ...session.media,
        }));
      }
      if (scriptCancel.current) return;

      const connected = await api.connectCall(session.id);
      if (scriptCancel.current) return;
      setStatus("connected");
      setSpeakingState("listening");
      setActivity(connected.liveActivity ?? []);
      if (connected.media) {
        setMedia((prev) => ({
          ...prev,
          ...connected.media,
          faceImageUrl:
            connected.media?.faceImageUrl ||
            faceImageUrl ||
            prev?.faceImageUrl ||
            "/agents/atlas-face.jpg",
          displayName: connected.media?.displayName || agentName,
        }));
      }

      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);

      const script = api.getCallScript(conversationId);
      const lines: CallTranscriptLine[] = [];

      for (const step of script) {
        if (scriptCancel.current) return;

        // Thinking / listening beat before speech
        if (step.speaker === "agent") {
          setSpeakingState(step.activity ? "thinking" : "listening");
          if (step.activity) {
            setActivity((prev) => [...prev.slice(-3), step.activity!]);
          }
          await new Promise((r) => setTimeout(r, Math.min(600, step.delayMs * 0.25)));
          if (scriptCancel.current) return;
          setSpeakingState("speaking");
        } else {
          setSpeakingState("listening");
          if (step.activity) {
            setActivity((prev) => [...prev.slice(-3), step.activity!]);
          }
        }

        await new Promise((r) => setTimeout(r, step.delayMs));
        if (scriptCancel.current) return;

        const line: CallTranscriptLine = {
          id: `tl_${Math.random().toString(36).slice(2)}`,
          speaker: step.speaker,
          text: step.text,
          at: new Date().toISOString(),
        };
        lines.push(line);
        setTranscript((prev) => [...prev, line]);
        setCaption(step.text);

        // Hold speaking while "saying" the line
        if (step.speaker === "agent") {
          const hold = Math.min(2800, 900 + step.text.length * 18);
          await new Promise((r) => setTimeout(r, hold));
          if (scriptCancel.current) return;
          setSpeakingState("listening");
        }
      }

      // Script finished — stay connected until user ends
      setSpeakingState("idle");
      setCaption("");
    })();

    return () => {
      scriptCancel.current = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      void localCallId;
    };
  }, [open, conversationId, agentName, faceImageUrl]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, caption]);

  async function endCall() {
    if (!callId || status === "ending" || status === "ended") return;
    setStatus("ending");
    setSpeakingState("idle");
    scriptCancel.current = true;
    if (timerRef.current) window.clearInterval(timerRef.current);

    const result = await api.completeCall({
      callId,
      conversationId,
      transcript,
      durationSeconds: seconds,
    });

    setLearned(result.learned);
    setStatus("ended");
    onComplete({
      learned: result.learned,
      prospect: result.prospect,
      transcript,
      durationSeconds: seconds,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-fg text-accent-fg">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{agentName}</p>
          <p className="font-mono text-xs text-white/55 tabular">{formatDuration(seconds)}</p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            label={showTranscript ? "Hide transcript" : "Show transcript"}
            variant="solid"
            className="border-0 bg-white/10 text-white hover:bg-white/15"
            onClick={() => setShowTranscript((v) => !v)}
          >
            <Subtitles className="h-4 w-4" />
          </IconButton>
          {status === "ended" ? (
            <IconButton
              label="Close"
              variant="solid"
              className="border-0 bg-white/10 text-white hover:bg-white/15"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
      </div>

      {/* Main stage */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 sm:px-6 lg:flex-row">
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
          <CallVideoStage
            agentName={agentName}
            media={media}
            speakingState={speakingState}
            status={status}
            className="w-full shadow-lg"
          />

          {/* Live caption under video on mobile when panel hidden */}
          {caption && status === "connected" && !showTranscript && (
            <div className="mt-3 w-full max-w-2xl rounded-[var(--radius-md)] bg-white/10 px-4 py-2.5 text-center text-sm text-white/90 backdrop-blur-sm lg:hidden">
              {caption}
            </div>
          )}
        </div>

        {/* Side panel: activity + transcript */}
        {showTranscript && (
          <aside className="flex max-h-[38vh] w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-white/10 bg-white/5 lg:max-h-none lg:w-[340px]">
            {activity.length > 0 && status !== "ended" && (
              <div className="border-b border-white/10 px-4 py-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                  Live activity
                </p>
                <div className="[&_span]:text-white/70 [&_svg]:text-white/55">
                  <AgentActivity events={activity.slice(-3)} live />
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                Transcript
              </p>
              {transcript.length === 0 && status !== "ended" ? (
                <p className="text-sm text-white/45">Waiting for conversation…</p>
              ) : (
                <div className="space-y-3">
                  {transcript.map((line) => (
                    <div key={line.id}>
                      <p
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-wider",
                          line.speaker === "agent" ? "text-call" : "text-white/45"
                        )}
                      >
                        {line.speaker === "agent" ? agentName : "You"}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-white/85">{line.text}</p>
                    </div>
                  ))}
                  {caption &&
                    status === "connected" &&
                    speakingState === "speaking" &&
                    transcript[transcript.length - 1]?.text !== caption && (
                      <div className="animate-fade">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-call">
                          {agentName}
                        </p>
                        <p className="mt-0.5 text-sm leading-relaxed text-white/70">{caption}</p>
                      </div>
                    )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>

            {status === "ended" && learned.length > 0 && (
              <div className="border-t border-white/10 px-4 py-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-call">
                  {agentName} learned
                </p>
                <ul className="space-y-1">
                  {learned.map((item) => (
                    <li key={item} className="text-sm text-white/85">
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
      <div className="shrink-0 border-t border-white/10 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-center gap-3">
          {status !== "ended" ? (
            <>
              <IconButton
                label={muted ? "Unmute" : "Mute"}
                variant="solid"
                size="lg"
                className="border-0 bg-white/10 text-white hover:bg-white/15"
                onClick={() => setMuted((m) => !m)}
              >
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </IconButton>
              <Button
                size="lg"
                variant="danger"
                className="min-w-[148px] border-0 bg-danger text-white hover:bg-danger/90"
                leftIcon={<PhoneOff className="h-4 w-4" />}
                onClick={endCall}
                loading={status === "ending"}
              >
                End Call
              </Button>
              <IconButton
                label="Speaker"
                variant="solid"
                size="lg"
                className="border-0 bg-white/10 text-white hover:bg-white/15"
              >
                <Volume2 className="h-5 w-5" />
              </IconButton>
            </>
          ) : (
            <Button
              size="lg"
              className="min-w-[200px] bg-white text-fg hover:bg-white/90"
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
