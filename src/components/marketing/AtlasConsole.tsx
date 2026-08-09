"use client";

import { IconArrowRight, IconSend } from "@/components/icons";
import { AnswerText } from "@/components/marketing/AnswerText";
import { cn } from "@/lib/utils";
import type { ProspectMemory } from "@/types/ui";
import { useCallback, useEffect, useRef, useState } from "react";

/** The company this site deploys. Its knowledge sources are live. */
const COMPANY_ID = "778f9573-b6c6-4530-826d-1a29e536fc58";

/**
 * The subset of the server's stream union this surface consumes. The authority
 * is `ChatStreamEvent` in src/lib/server/chat-agent.ts; this mirrors only the
 * variants rendered here so the marketing bundle stays decoupled from server
 * code. `reasoning` deliberately drives the trace only and is never rendered as
 * text, because a model's private reasoning is not an answer.
 */
type StreamEvent =
  | { type: "activity"; event: { type: string; label?: string } }
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "message"; message: { content: string } }
  | { type: "memory"; prospect: ProspectMemory }
  | { type: "error"; code: string; message: string; recoverable: boolean }
  | { type: "done" };

type Phase = "idle" | "sending" | "streaming" | "answered" | "error";

/** One exchange. The thread keeps every one, so follow-ups have context. */
type Turn = {
  id: number;
  question: string;
  answer: string;
  error: string | null;
};

/** A real thing that happened, with the millisecond it happened at. */
type Trace = {
  id: number;
  /** Milliseconds since the current question was sent. */
  at: number;
  label: string;
  detail?: string;
  /** Marks the row that is still running, so its elapsed time ticks. */
  running?: boolean;
};

const OPENERS = [
  "How do you handle a prospect running Kubernetes on AWS?",
  "What happens on a call when you do not know the answer?",
  "Can you read our repository and open a pull request?",
];

/** Machine data is mono and tabular everywhere in this product. */
function secs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function words(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * A real conversation with the engineer, and the engineer's real working notes
 * beside it.
 *
 * Nothing here is scripted. It opens a genuine conversation against the live
 * company and reads the server-sent stream, so what a visitor sees is the same
 * agent the product ships. The trace on the right is not decoration either:
 * every row is an event that arrived on that stream, stamped with when it
 * arrived, including the retrieval steps and each tool the agent reached for.
 *
 * The stage is a FIXED height at every breakpoint. An answer that pushed the
 * page down would move the composer out from under the cursor mid-sentence and
 * throw away the visitor's scroll position, so the thread and the trace scroll
 * inside themselves and the page never moves.
 *
 * The session is opened on mount rather than on submit. Opening measured about
 * two seconds warm, and paying that before anyone types keeps the visible wait
 * down to generation alone.
 */
export function AtlasConsole({
  onMemory,
}: {
  /** Fires when the agent has updated what it knows about this visitor. */
  onMemory?: (memory: ProspectMemory) => void;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionFailed, setSessionFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [draft, setDraft] = useState("");
  /**
   * Drives the ticking elapsed time. The value is never read; the render pulls
   * `Date.now()` directly, and this only exists to schedule the re-render.
   */
  const [, tick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const traceRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const startedAt = useRef(0);
  const traceId = useRef(0);
  const turnId = useRef(0);
  /** Releases auto-follow the moment the visitor scrolls up to re-read. */
  const stick = useRef(true);

  const busy = phase === "sending" || phase === "streaming";

  const addTrace = useCallback((label: string, detail?: string, running = false) => {
    setTrace((prev) => [
      // Only one row runs at a time; the previous one is finished by definition.
      ...prev.map((row) => (row.running ? { ...row, running: false } : row)),
      { id: traceId.current++, at: Date.now() - startedAt.current, label, detail, running },
    ]);
  }, []);

  /**
   * Returns the id as well as storing it. A caller that opens a session and then
   * immediately needs it cannot read `conversationId`, which is still the value
   * captured when the callback was created.
   */
  const openSession = useCallback(async (): Promise<string | null> => {
    setSessionFailed(false);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId: COMPANY_ID,
          personName: "Website visitor",
        }),
      });
      if (!res.ok) throw new Error(`session ${res.status}`);
      const body = await res.json();
      const id = (body?.data ?? body)?.conversation?.id;
      if (typeof id !== "string") throw new Error("no conversation id");
      setConversationId(id);
      return id;
    } catch {
      setSessionFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void openSession();
    return () => abortRef.current?.abort();
  }, [openSession]);

  // The elapsed column has to move while a step is running, or the trace reads
  // as a static list of claims rather than something happening now.
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => tick((t) => t + 1), 100);
    return () => window.clearInterval(id);
  }, [busy, tick]);

  // Follow the newest text, unless the visitor has scrolled back to read.
  useEffect(() => {
    if (!stick.current) return;
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
    traceRef.current?.scrollTo({ top: traceRef.current.scrollHeight });
  }, [turns, trace]);

  // "/" focuses the composer, the way every tool a developer already uses does.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const box = composerRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      // Only claim the key while the console is actually on screen.
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      event.preventDefault();
      box.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;

      startedAt.current = Date.now();
      traceId.current = 0;
      const id = turnId.current++;

      stick.current = true;
      setDraft("");
      setTurns((prev) => [...prev, { id, question: message, answer: "", error: null }]);
      setTrace([]);
      setPhase("sending");
      addTrace("Question sent", undefined, true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (change: Partial<Turn>) =>
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...change } : t)));

      try {
        // Normally already open from mount. This only pays the cost when that
        // failed, or when a visitor asks before the prewarm has landed.
        const conversation = conversationId ?? (await openSession());
        if (!conversation) throw new Error("stream 0");

        const res = await fetch(`/api/conversations/${conversation}/message/stream`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let answer = "";
        let failed = false;
        let firstToken = 0;
        let reasoningSteps = 0;

        // Frames are "event: <type>\n data: <json>\n\n", plus a ": open" comment.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let split: number;
          while ((split = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);

            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;

              let event: StreamEvent;
              try {
                event = JSON.parse(payload) as StreamEvent;
              } catch {
                continue;
              }

              switch (event.type) {
                case "activity":
                  if (event.event?.label) addTrace(event.event.label, undefined, true);
                  break;
                case "reasoning":
                  reasoningSteps += 1;
                  setPhase((p) => (p === "sending" ? "streaming" : p));
                  setTrace((prev) => {
                    const last = prev[prev.length - 1];
                    // Reasoning arrives in bursts. One row that counts them beats
                    // sixteen rows that each say the same word.
                    if (last?.label === "Reasoning") {
                      return [
                        ...prev.slice(0, -1),
                        { ...last, detail: `${reasoningSteps} steps` },
                      ];
                    }
                    return [
                      ...prev.map((row) => (row.running ? { ...row, running: false } : row)),
                      {
                        id: traceId.current++,
                        at: Date.now() - startedAt.current,
                        label: "Reasoning",
                        detail: `${reasoningSteps} steps`,
                        running: true,
                      },
                    ];
                  });
                  break;
                case "delta":
                  if (!firstToken) {
                    firstToken = Date.now() - startedAt.current;
                    addTrace("First token", secs(firstToken), true);
                  }
                  answer += event.text;
                  setPhase("streaming");
                  patch({ answer });
                  break;
                case "replace":
                  answer = event.text;
                  setPhase("streaming");
                  patch({ answer });
                  break;
                case "message":
                  // Authoritative: the persisted text wins over accumulated deltas.
                  answer = event.message.content;
                  patch({ answer });
                  break;
                case "memory":
                  addTrace("Memory updated", undefined, true);
                  onMemory?.(event.prospect);
                  break;
                case "error":
                  failed = true;
                  patch({ error: event.message });
                  setPhase("error");
                  break;
                default:
                  break;
              }
            }
          }
        }

        // A stream that closes having produced nothing is a failure, not an
        // answer. Saying so beats leaving an empty panel that looks broken.
        if (failed) {
          // already reported on the stream
        } else if (answer.trim().length === 0) {
          patch({ error: "The engineer did not answer that one. Worth another try." });
          setPhase("error");
        } else {
          addTrace("Answer complete", `${words(answer)} words`);
          setPhase("answered");
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // A deliberate stop is not a failure. Keep whatever arrived.
          setTurns((prev) =>
            prev.map((t) => (t.id === id && !t.answer ? { ...t, error: "Stopped." } : t)),
          );
          addTrace("Stopped");
          setPhase("answered");
          return;
        }
        patch({
          error:
            err instanceof Error && err.message.startsWith("stream")
              ? "The engineer could not be reached just now."
              : "Something broke on the way to the engineer.",
        });
        setPhase("error");
      }
    },
    [addTrace, busy, conversationId, onMemory, openSession],
  );

  const started = turns.length > 0;
  const last = turns[turns.length - 1];

  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-surface",
        // Fixed at every breakpoint. The page must not move when an answer lands.
        // On a laptop the parent owns the height, so the whole section is one
        // frame; `--stage-h` is the fallback when this is rendered on its own.
        "h-[var(--stage-h,clamp(30rem,72svh,44rem))] lg:h-full",
        "grid-rows-[auto_minmax(0,1fr)_auto]",
      )}
    >
      {/* Who is answering, and whether anything is happening right now. */}
      <div className="flex items-center gap-3 border-b border-rule px-4 py-3.5 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Atlas
          </p>
          <p className="truncate text-[13px] text-ink-3">
            Forward-deployed engineer, Grok FDE
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {busy && (
            <>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-live" />
              <span className="text-[13px] text-ink-3">
                {phase === "streaming" ? "Answering" : "Thinking"}
              </span>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="ml-1 inline-flex h-9 items-center rounded-[var(--radius-control)] border border-rule-strong px-3 text-[13px] font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-hover active:scale-[0.99]"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Thread on the left, the engineer's working notes on the right. */}
      <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div
          ref={threadRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
          className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
        >
          {/* EMPTY: what it can answer, then real questions that actually send. */}
          {!started && (
            <div>
              <p className="max-w-[68ch] text-body-l text-ink-2">
                It has your documentation, your API reference, and your repository.
                It will say when something is not in there rather than guess.
              </p>
              <ul className="mt-5 border-t border-rule">
                {OPENERS.map((opener) => (
                  <li key={opener} className="border-b border-rule">
                    <button
                      type="button"
                      onClick={() => void ask(opener)}
                      disabled={busy}
                      className={cn(
                        "group flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left",
                        "text-body text-ink-2",
                        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                        "hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4",
                      )}
                    >
                      <span>{opener}</span>
                      <IconArrowRight
                        size={14}
                        className="shrink-0 text-ink-4 transition-[transform,color] duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:text-ink"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {turns.map((turn, index) => (
            <div key={turn.id} className={index === 0 ? undefined : "mt-8 border-t border-rule pt-7"}>
              <p className="text-[13px] font-medium text-ink-3">You</p>
              <p className="mt-1.5 max-w-[68ch] text-body-l text-ink">{turn.question}</p>

              <div className="mt-5">
                {/* LOADING: content-shaped, never a bare spinner. */}
                {!turn.answer && !turn.error && (
                  <div>
                    <div className="space-y-2.5" aria-hidden>
                      <div className="skeleton h-3.5 w-[92%]" />
                      <div className="skeleton h-3.5 w-[78%]" />
                      <div className="skeleton h-3.5 w-[85%]" />
                    </div>
                    <span className="sr-only" role="status">
                      Atlas is answering
                    </span>
                  </div>
                )}

                {turn.answer && (
                  <div aria-live="polite">
                    <p className="text-[13px] font-medium text-ink-3">Atlas</p>
                    <div className="mt-1.5">
                      <AnswerText text={turn.answer} />
                    </div>
                  </div>
                )}

                {/* ERROR: a sentence a person can act on, and a real retry. */}
                {turn.error && (
                  <div className={turn.answer ? "mt-4" : undefined}>
                    <p className="max-w-[68ch] text-body text-ink-2">{turn.error}</p>
                    <button
                      type="button"
                      onClick={() => void ask(turn.question)}
                      disabled={busy}
                      className="mt-3 inline-flex h-11 items-center rounded-[var(--radius-control)] border border-rule-strong px-4 text-[15px] font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-hover disabled:cursor-not-allowed disabled:text-ink-4 active:scale-[0.99]"
                    >
                      Ask again
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/*
          The working notes. Held back below lg, where there is no room for a
          second column and the composer matters more; the newest step still
          shows under the thread on a phone.
        */}
        <div className="hidden min-h-0 flex-col border-l border-rule bg-sunken lg:flex">
          <p className="border-b border-rule px-5 py-3 text-label">Working notes</p>
          <div ref={traceRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {trace.length === 0 ? (
              <p className="text-caption text-ink-3">
                Every retrieval, tool call, and timing lands here as it happens.
              </p>
            ) : (
              <ol className="tabular-nums">
                {trace.map((row) => (
                  <li key={row.id} className="flex gap-3 py-1.5">
                    <span className="w-[3.25rem] shrink-0 font-mono text-[12px] text-ink-4">
                      {secs(row.running ? Math.max(row.at, Date.now() - startedAt.current) : row.at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[13px] leading-snug",
                          row.running ? "text-ink" : "text-ink-2",
                        )}
                      >
                        {row.label}
                      </span>
                      {row.detail && (
                        <span className="block font-mono text-[12px] text-ink-3">
                          {row.detail}
                        </span>
                      )}
                    </span>
                    {row.running && busy && (
                      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-live" />
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
          {trace.length > 0 && (
            <p className="border-t border-rule px-5 py-3 font-mono text-[12px] text-ink-3">
              {busy
                ? `${secs(Math.max(0, Date.now() - startedAt.current))} elapsed`
                : last && phase === "answered" && !last.error
                  ? `${trace.length} steps`
                  : ""}
            </p>
          )}
        </div>
      </div>

      {/* The composer. Always in the same place, because the stage never grows. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
        className="border-t border-rule p-3 sm:p-4"
      >
        <label htmlFor="atlas-question" className="sr-only">
          Your question for Atlas
        </label>
        <div className="flex items-end gap-2">
          <textarea
            ref={composerRef}
            id="atlas-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(draft);
              }
            }}
            rows={2}
            placeholder={
              started
                ? "Ask a follow-up. It remembers the rest of this conversation."
                : "Ask about architecture, security, or what it costs"
            }
            className={cn(
              "min-h-11 w-full resize-none rounded-[var(--radius-control)] border border-rule bg-paper px-3.5 py-2.5",
              "text-body-l text-ink placeholder:text-ink-4",
              "transition-[border-color] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
              "hover:border-rule-strong focus:border-rule-strong",
            )}
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            aria-label="Send question to Atlas"
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)]",
              "bg-ink text-paper",
              "transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
              "hover:bg-ink-lift active:scale-[0.99]",
              // ink-4 on sunken measures 4.35:1, just under the floor, so the
              // disabled glyph uses ink-3 and stays readable.
              "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3",
            )}
          >
            <IconSend size={16} />
          </button>
        </div>

        {/* Reserved slot, so nothing shifts when this fills. Raw step labels are
            deliberately not shown here: read directly under the composer, a line
            like "Company confirmation required" looks like a complaint about the
            visitor rather than a note the agent wrote to itself. Those belong in
            the working notes, which is where they say what they mean. */}
        <p className="mt-2 min-h-5 truncate text-[13px] text-ink-3">
          {sessionFailed
            ? "The engineer is not reachable right now. Your question will still send."
            : busy
              ? "Answering. It reads your documentation before it replies."
              : started
                ? "Press Enter to send. It keeps the thread."
                : "Press Enter to send."}
        </p>
      </form>
    </div>
  );
}
