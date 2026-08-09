"use client";

import { AtlasStage } from "@/components/prospect/AtlasStage";
import { normalizeDashes } from "@/components/prospect/MessageBubble";
import { IconMic, IconMicOff, IconPhoneOff, IconX } from "@/components/icons";
import { api } from "@/lib/api/client";
import { repoToolHandlers } from "@/lib/realtime/repo-tools";
import {
  VoiceSession,
  type VoiceActivityEvent,
  type VoiceTranscriptLine,
} from "@/lib/realtime/voice-session";
import { cn, formatDuration } from "@/lib/utils";
import type { ProspectMemory } from "@/types/ui";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "connecting" | "live" | "ending" | "ended" | "failed";

/**
 * The call: a full viewport takeover and one of only two earned dark surfaces
 * in the product, earned because the content is a live feed of a person.
 *
 * The round trip is the whole product story, so it is made visible rather than
 * silent: chat context goes in with the session instructions, the transcript
 * and everything Atlas learned come back out and are written to the thread
 * before this surface closes.
 */
export function CallStage({
  open,
  agentName,
  companyName,
  conversationId,
  faceImageUrl = "/agents/atlas-face.jpg",
  onClose,
  onComplete,
}: {
  open: boolean;
  agentName: string;
  companyName: string;
  conversationId: string;
  faceImageUrl?: string;
  onClose: () => void;
  onComplete: (result: { learned: string[]; prospect: ProspectMemory }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<VoiceTranscriptLine[]>([]);
  const [activity, setActivity] = useState<VoiceActivityEvent[]>([]);
  const [learned, setLearned] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // ~100Hz signals. Refs, not state: see the note in AtlasStage.
  const levelRef = useRef(0);
  const inputLevelRef = useRef(0);

  const sessionRef = useRef<VoiceSession | null>(null);
  const linesRef = useRef<VoiceTranscriptLine[]>([]);
  const secondsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const endingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  /** Upsert by id. Cumulative transcripts REPLACE their line, never append. */
  const upsertLine = useCallback((line: VoiceTranscriptLine) => {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.id === line.id);
      if (at === -1) return [...prev, line];
      const next = prev.slice();
      next[at] = line;
      return next;
    });
  }, []);

  const upsertActivity = useCallback((event: VoiceActivityEvent) => {
    setActivity((prev) => {
      if (!event.id) return [...prev.slice(-5), event];
      const at = prev.findIndex((e) => e.id === event.id);
      if (at === -1) return [...prev.slice(-5), event];
      const next = prev.slice();
      next[at] = event;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    endingRef.current = false;
    setPhase("connecting");
    setSeconds(0);
    setLines([]);
    linesRef.current = [];
    setActivity([]);
    setLearned([]);
    setMuted(false);
    setSpeaking(false);
    setListening(false);
    setError(null);
    levelRef.current = 0;
    inputLevelRef.current = 0;

    (async () => {
      try {
        const session = await api.startCall(conversationId);
        if (cancelled) return;

        const voice = new VoiceSession({
          token: session.realtimeToken,
          realtimeUrl: session.realtimeUrl,
          websocketProtocols: session.websocketProtocols,
          session: {
            voice: session.voiceSession.voice,
            instructions: session.voiceSession.instructions,
            turn_detection: session.voiceSession.turn_detection,
            tools: session.voiceSession.tools,
          },
          toolHandlers: {
            // Runs in the browser against our own backend. The definition the
            // model sees carries no credential of any kind.
            email_conversation_summary: async (args) => {
              const to = typeof args.to === "string" ? args.to.trim() : "";
              if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
                return { error: "That does not look like a valid email address." };
              }
              const sent = await api.emailConversation({ conversationId, to });
              return { sent: true, to: sent.to, subject: sent.subject };
            },
            ...repoToolHandlers(conversationId, (event: VoiceActivityEvent) => {
              if (!cancelled) upsertActivity(event);
            }),
          },
          onConnected: () => {
            if (cancelled) return;
            setPhase("live");
            timerRef.current = window.setInterval(
              () => setSeconds((s) => s + 1),
              1000,
            );
          },
          onSpeakingState: (state) => {
            if (cancelled) return;
            setSpeaking(state === "speaking");
            setListening(state === "listening");
          },
          onLevel: (v) => {
            levelRef.current = v;
          },
          onInputLevel: (v) => {
            inputLevelRef.current = v;
          },
          onTranscript: (line) => {
            if (!cancelled) upsertLine(line);
          },
          onActivity: (event) => {
            if (!cancelled) upsertActivity(event);
          },
          onError: (message) => {
            if (!cancelled) setError(message);
          },
          onDisconnected: () => {
            /* Hangup and teardown are both handled explicitly. */
          },
        });

        sessionRef.current = voice;
        await voice.connect();
      } catch (err) {
        if (cancelled) return;
        // An honest failure with a retry. Never a scripted stand-in: a canned
        // voice presented as Atlas demos a product that does not exist.
        setError(
          err instanceof Error ? err.message : "The call could not be started.",
        );
        setPhase("failed");
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      void sessionRef.current?.disconnect();
      sessionRef.current = null;
    };
  }, [open, conversationId, attempt, upsertLine, upsertActivity]);

  useEffect(() => {
    sessionRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, activity]);

  // Focus management. Deliberately NOT closing on Escape while the call is
  // live: hanging up a real conversation on a stray keypress is unrecoverable.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const root = rootRef.current;
    root?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (phase === "ended" || phase === "failed")) {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, phase, onClose]);

  async function endCall() {
    if (endingRef.current) return;
    endingRef.current = true;
    setPhase("ending");
    if (timerRef.current) window.clearInterval(timerRef.current);

    await sessionRef.current?.disconnect();
    sessionRef.current = null;

    const transcript = linesRef.current;
    const duration = secondsRef.current;

    if (transcript.length === 0) {
      // Nothing was said. Writing an empty call to the thread would put a
      // meaningless entry in the history and teach the memory nothing.
      setPhase("ended");
      return;
    }

    try {
      const result = await api.completeCall({
        callId: `call_${Date.now()}`,
        conversationId,
        transcript: transcript.map((l) => ({
          id: l.id,
          speaker: l.speaker,
          text: l.text,
          at: l.at,
        })),
        durationSeconds: duration,
      });
      setLearned(result.learned);
      setPhase("ended");
      onComplete({ learned: result.learned, prospect: result.prospect });
    } catch (err) {
      setError(
        err instanceof Error
          ? `The call ended but the summary could not be saved. ${err.message}`
          : "The call ended but the summary could not be saved.",
      );
      setPhase("ended");
    }
  }

  if (!open) return null;

  const live = phase === "live" || phase === "ending";

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Live call with ${agentName}`}
      /* `on-stage` flips the global focus ring from ink to white, which is the
         only way it stays visible on this dark surface. `focus:outline-none`
         applies to THIS container only: it is focused programmatically when the
         call opens, and a ring around the whole viewport would be nonsense. */
      className="on-stage fixed inset-0 z-50 flex flex-col bg-stage text-stage-ink focus:outline-none"
    >
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-stage-rule px-5 py-4 md:px-8 lg:px-12">
        <div className="flex min-w-0 items-center gap-3">
          {live && (
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: "var(--color-live)" }}
                aria-hidden
              />
              <span
                className="font-mono text-[0.6875rem] uppercase tracking-[0.08em]"
                style={{ color: "var(--color-live)" }}
              >
                Live
              </span>
            </span>
          )}
          <p className="truncate text-[0.9375rem] text-stage-ink-2">
            {agentName} at {companyName}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[0.8125rem] tabular-nums text-stage-ink-2">
          {formatDuration(seconds)}
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="shrink-0 border-b border-stage-rule px-5 py-3 md:px-8 lg:px-12"
          style={{ backgroundColor: "var(--color-live-soft)" }}
        >
          <p className="max-w-[68ch] text-[0.9375rem] leading-[1.5] text-stage-ink">
            {error}
          </p>
        </div>
      )}

      {/* Stage */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 px-5 py-6 md:px-8 lg:flex-row lg:gap-12 lg:px-12">
        {phase === "failed" ? (
          <div className="flex flex-1 flex-col items-start justify-center">
            <h2 className="max-w-[68ch] text-[clamp(1.5rem,2.6vw,2rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-stage-ink text-balance">
              The call could not be connected
            </h2>
            <p className="mt-4 max-w-[68ch] text-[1rem] leading-[1.6] text-stage-ink-2">
              Nothing was recorded and the conversation is untouched. You can try again,
              or keep going in chat where {agentName} has the same context.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setAttempt((a) => a + 1);
                }}
                className="inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] bg-white px-5 text-[0.9375rem] font-medium text-stage transition-colors duration-[120ms] hover:bg-white/90 active:scale-[0.99]"
              >
                Try the call again
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] border border-stage-rule px-5 text-[0.9375rem] font-medium text-stage-ink transition-colors duration-[120ms] hover:bg-white/5 active:scale-[0.99]"
              >
                Back to the conversation
              </button>
            </div>
          </div>
        ) : (
          <>
            <AtlasStage
              agentName={agentName}
              faceImageUrl={faceImageUrl}
              levelRef={levelRef}
              inputLevelRef={inputLevelRef}
              /* Viseme source for the mouth. The agent's own transcript
                 deltas are incremental and accumulate into a single line per
                 turn, so the most recent agent line IS the current turn's
                 cumulative text. No new state: this component already
                 re-renders on every delta. */
              agentTranscript={
                [...lines].reverse().find((l) => l.speaker === "agent")?.text ?? ""
              }
              speaking={speaking}
              listening={listening}
              connecting={phase === "connecting"}
              className="flex-1"
            />

            {/* Transcript and live activity */}
            <div className="flex min-h-0 w-full flex-col lg:w-[24rem] lg:shrink-0">
              <h2 className="shrink-0 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-stage-ink-2">
                Transcript
              </h2>
              <div
                ref={scrollRef}
                className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto"
              >
                {lines.length === 0 && phase !== "ended" && (
                  <p className="max-w-[68ch] text-[0.9375rem] leading-[1.55] text-stage-ink-2">
                    {phase === "connecting"
                      ? `Setting up the call. ${agentName} is loading everything from your conversation.`
                      : `Say anything. ${agentName} already has the whole conversation and can look things up while you talk.`}
                  </p>
                )}

                {lines.map((line) => (
                  <div key={line.id}>
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-stage-ink-2">
                      {line.speaker === "agent" ? agentName : "You"}
                    </p>
                    <p className="mt-1.5 max-w-[68ch] text-[0.9375rem] leading-[1.55] text-stage-ink">
                      {normalizeDashes(line.text)}
                    </p>
                  </div>
                ))}

                {activity.length > 0 && (
                  <div className="space-y-2 border-t border-stage-rule pt-4">
                    {activity.map((event, i) => (
                      <p
                        key={event.id ?? `${event.label}-${i}`}
                        className="font-mono text-[0.8125rem] text-stage-ink-2"
                      >
                        {event.label}
                        {event.state === "done" && " · done"}
                        {event.state === "failed" && " · failed"}
                        {event.detail ? ` · ${event.detail}` : ""}
                      </p>
                    ))}
                  </div>
                )}

                {phase === "ended" && (
                  <div className="border-t border-stage-rule pt-5">
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-stage-ink-2">
                      {learned.length > 0
                        ? `${agentName} learned`
                        : "Nothing new was learned"}
                    </p>
                    {learned.length > 0 ? (
                      <ul className="mt-3 space-y-1.5">
                        {learned.map((item) => (
                          <li
                            key={item}
                            className="max-w-[68ch] text-[0.9375rem] leading-[1.5] text-stage-ink"
                          >
                            {normalizeDashes(item)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 max-w-[68ch] text-[0.9375rem] leading-[1.5] text-stage-ink-2">
                        The call was too short to add anything to what {agentName}
                        already knew.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      {phase !== "failed" && (
        <div className="shrink-0 border-t border-stage-rule px-5 py-4 md:px-8 lg:px-12">
          <div className="flex items-center justify-between gap-3">
            {phase === "ended" ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] bg-white px-5 text-[0.9375rem] font-medium text-stage transition-colors duration-[120ms] hover:bg-white/90 active:scale-[0.99]"
              >
                <IconX className="mr-2 h-4 w-4" aria-hidden />
                Back to the conversation
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-pressed={muted}
                  aria-label={muted ? "Unmute your microphone" : "Mute your microphone"}
                  className={cn(
                    "inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-[var(--radius-control)] px-4",
                    "text-[0.9375rem] font-medium transition-colors duration-[120ms]",
                    "active:scale-[0.99]",
                    muted
                      ? "bg-white text-stage"
                      : "border border-stage-rule text-stage-ink hover:bg-white/5",
                  )}
                >
                  {muted ? (
                    <IconMicOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <IconMic className="h-4 w-4" aria-hidden />
                  )}
                  <span className="hidden sm:inline">{muted ? "Muted" : "Mute"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void endCall()}
                  disabled={phase === "ending"}
                  className={cn(
                    "inline-flex h-11 min-w-[8rem] items-center justify-center gap-2 rounded-[var(--radius-control)] px-5",
                    "text-[0.9375rem] font-medium text-white transition-colors duration-[120ms]",
                    "active:scale-[0.99]",
                    "disabled:cursor-not-allowed disabled:opacity-70",
                  )}
                  style={{ backgroundColor: "var(--color-critical)" }}
                >
                  <IconPhoneOff className="h-4 w-4" aria-hidden />
                  {phase === "ending" ? "Saving" : "End call"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
