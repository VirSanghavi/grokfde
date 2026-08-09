"use client";

import { IconPhone } from "@/components/icons";
import { AgentActivity } from "@/components/prospect/AgentActivity";
import { CallStage } from "@/components/prospect/CallStage";
import { Composer } from "@/components/prospect/Composer";
import { hasMemoryContent, MemoryPanel } from "@/components/prospect/MemoryPanel";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { Avatar } from "@/components/ui/Avatar";
import {
  NotPublished,
  PageSkeleton,
  SessionError,
} from "@/components/prospect/ProspectStates";
import { ApiClientError, api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { AgentEvent, Company, Message, Prospect, ProspectMemory } from "@/types/ui";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The entire customer-facing product, on one page.
 *
 * No account, no navigation, no separate routes. Chat, history, memory and the
 * live call are all states of this one surface, because a visitor who has to
 * navigate to reach the engineer has already been made to wait.
 */

type Status = "loading" | "ready" | "not-published" | "error";

/**
 * Openers built from what this company's engineer has actually ingested.
 *
 * Hardcoding four generic questions would be the giveaway that nothing behind
 * the page is real, so every line here comes from the company's own knowledge
 * summary. The objection-led ones are deliberately blunt: watching Atlas give
 * a straight answer to a hostile question is the single most convincing thing
 * it does, and it is the question a real technical buyer would actually ask.
 */
function suggestedOpeners(company: Company): string[] {
  const knowledge = company.knowledgeSummary;
  const openers: string[] = [];

  const objections = (knowledge?.commonObjections ?? [])
    .map((o) => o.trim())
    .filter(Boolean);
  for (const objection of objections.slice(0, 2)) {
    openers.push(`Be blunt about ${objection.toLowerCase()}. How do you handle it?`);
  }

  // Short use cases read as natural questions; long ones are prose fragments.
  const useCase = (knowledge?.coreUseCases ?? [])
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && u.length < 34)
    .sort((a, b) => a.length - b.length)[0];
  if (useCase) {
    openers.push(`How would this work for ${useCase.toLowerCase()}?`);
  }

  // Always worth asking, and true of every company on the platform.
  openers.push("How would this fit our stack?");

  return openers.slice(0, 4);
}

export function ProspectPage({
  companySlug,
  prospectId,
}: {
  companySlug: string;
  prospectId?: string;
}) {
  const searchParams = useSearchParams();
  const autoCall = searchParams.get("call") === "1";

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<AgentEvent[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  const [callOpen, setCallOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [emailError, setEmailError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const autoCallFired = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        const session = await api.ensureProspectSession(companySlug, prospectId);
        if (cancelled) return;
        setCompany(session.company);
        setProspect(session.prospect);
        setConversationId(session.conversation.id);
        setMessages(session.messages);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        // A mistyped subdomain is an ordinary event and gets a real page. It
        // must never surface as an unhandled rejection or a forever spinner,
        // which is exactly what "Uncaught (in promise) Company not found" was.
        if (err instanceof ApiClientError && err.isNotFound) {
          setStatus("not-published");
          return;
        }
        setErrorMessage(
          err instanceof ApiClientError && err.isServerFault
            ? "The engineer's knowledge base is not responding. This is on our side, not yours."
            : err instanceof Error
              ? err.message
              : "Something went wrong while opening the conversation.",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companySlug, prospectId, attempt]);

  useEffect(() => {
    if (!autoCall || status !== "ready" || autoCallFired.current) return;
    autoCallFired.current = true;
    setCallOpen(true);
  }, [autoCall, status]);

  useEffect(() => {
    if (messages.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pendingEvents]);

  const send = useCallback(async () => {
    if (!conversationId || !input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setSendError(null);

    const optimistic: Message = {
      id: `tmp_${Date.now()}`,
      conversationId,
      channel: "chat",
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await api.sendMessage(conversationId, text);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        { ...optimistic, id: `user_${Date.now()}` },
        res.message,
      ]);
      setProspect((prev) =>
        prev
          ? { ...prev, memory: res.prospect, updatedAt: new Date().toISOString() }
          : prev,
      );
    } catch (err) {
      // Put the words back in the box. Losing what someone typed because the
      // network blinked is unforgivable and trivially avoidable.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      setSendError(
        err instanceof Error
          ? `That did not send. ${err.message}`
          : "That did not send.",
      );
    } finally {
      setPendingEvents([]);
      setSending(false);
    }
  }, [conversationId, input, sending]);

  const handleCallComplete = useCallback(
    (result: { learned: string[]; prospect: ProspectMemory }) => {
      setProspect((prev) =>
        prev
          ? { ...prev, memory: result.prospect, updatedAt: new Date().toISOString() }
          : prev,
      );
      // Pull the thread back so the call transcript and summary are visibly
      // part of the conversation. The round trip is the product story.
      if (conversationId) {
        void api.getConversation(conversationId).then((data) => {
          if (data) setMessages(data.messages);
        });
      }
    },
    [conversationId],
  );

  async function sendEmail() {
    if (!conversationId || !emailAddress.trim()) return;
    setEmailState("sending");
    setEmailError("");
    try {
      await api.emailConversation({ conversationId, to: emailAddress.trim() });
      setEmailState("sent");
    } catch (err) {
      setEmailState("error");
      setEmailError(
        err instanceof Error ? err.message : "The email could not be sent.",
      );
    }
  }

  if (status === "loading") return <PageSkeleton />;
  if (status === "not-published") return <NotPublished companySlug={companySlug} />;
  if (status === "error") {
    return (
      <SessionError
        message={errorMessage}
        onRetry={() => setAttempt((a) => a + 1)}
        retrying={false}
      />
    );
  }
  if (!company || !prospect || !conversationId) return <PageSkeleton />;

  const started = messages.length > 0;
  const showMemory = hasMemoryContent(prospect.memory);
  const openers = suggestedOpeners(company);

  const callButton = (
    <button
      type="button"
      onClick={() => setCallOpen(true)}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] px-5",
        "border border-rule-strong bg-surface text-[0.9375rem] font-medium text-ink",
        "transition-colors duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
        "hover:bg-hover active:scale-[0.99]",
        "",
      )}
    >
      <IconPhone className="h-4 w-4" aria-hidden />
      Talk to {company.agentName}
    </button>
  );

  const composer = (
    <Composer
      value={input}
      onChange={setInput}
      onSubmit={() => void send()}
      disabled={sending}
      label={`Ask ${company.agentName}`}
      showLabel={!started}
      autoFocus={!started}
      placeholder={`Ask ${company.agentName} about ${company.name}'s architecture, security, or pricing.`}
    />
  );

  return (
    <div className={cn("flex bg-paper", started ? "h-dvh flex-col" : "min-h-dvh flex-col")}>
      {/* Header. One status, no competing actions: the call lives beside the
          prompt box, which is on screen in every state. */}
      <header className="shrink-0 border-b border-rule">
        <div className="flex items-center justify-between gap-4 px-5 py-4 md:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-3">
            {/*
              Initials, not a photograph. public/agents/atlas-face.jpg is gone:
              a stock headshot of a man fronting a synthesized voice was the
              single most dishonest thing on this surface, and the file has been
              deleted, so pointing at it here rendered a broken image icon in
              the header. The drawn portrait that does exist is rigged for
              real-time lip sync and belongs on the call stage, not shrunk to
              nine pixels of head in a nav bar.
            */}
            <Avatar name={company.agentName} size="sm" tone="agent" />
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-semibold tracking-[-0.02em] text-ink">
                {company.agentName}
              </p>
              {/* On a narrow phone the full role phrase truncates to something
                  like "at Gro…", which reads as broken. Drop the role there and
                  keep the company name whole. */}
              <p className="truncate text-[0.8125rem] leading-[1.45] text-ink-3">
                <span className="hidden sm:inline">Forward deployed engineer at </span>
                {company.name}
              </p>
            </div>
          </div>

          <p className="flex shrink-0 items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--color-positive)" }}
              aria-hidden
            />
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
              Online
            </span>
          </p>
        </div>
      </header>

      {started ? (
        /* ── Conversation ─────────────────────────────────────────────── */
        <div
          className={cn(
            "grid min-h-0 flex-1",
            showMemory ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "grid-cols-1",
          )}
        >
          <main className="flex min-h-0 flex-col">
            {/* The conversation replaces the headline visually, but the page
                still needs exactly one h1 for anyone navigating by heading. */}
            <h1 className="sr-only">
              Your conversation with {company.agentName} at {company.name}
            </h1>
            <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-8 md:px-8 lg:px-12">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} agentName={company.agentName} />
              ))}

              {sending && (
                <p className="font-mono text-[0.8125rem] text-ink-3">
                  {company.agentName} is reading {company.name}&rsquo;s documentation
                </p>
              )}
              {pendingEvents.length > 0 && <AgentActivity events={pendingEvents} />}

              {sendError && (
                <p role="alert" className="max-w-[68ch] text-[0.9375rem] text-critical">
                  {sendError}
                </p>
              )}

              {/* Email is asked for inline, only once there is something worth
                  sending, and only when the visitor asks for it. */}
              <div className="border-t border-rule pt-6">
                {emailState === "sent" ? (
                  <p className="text-[0.9375rem] text-ink-2">
                    Sent to <span className="font-mono text-ink">{emailAddress}</span>.
                  </p>
                ) : emailOpen ? (
                  <div className="max-w-[32rem]">
                    <label
                      htmlFor="email"
                      className="block font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3"
                    >
                      Where should {company.agentName} send it
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        id="email"
                        type="email"
                        value={emailAddress}
                        onChange={(e) => setEmailAddress(e.target.value)}
                        placeholder="you@company.com"
                        className="h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 text-[0.9375rem] text-ink placeholder:text-ink-4 focus:border-ink"
                      />
                      <button
                        type="button"
                        onClick={() => void sendEmail()}
                        disabled={!emailAddress.trim() || emailState === "sending"}
                        className="h-11 shrink-0 rounded-[var(--radius-control)] bg-ink px-5 text-[0.9375rem] font-medium text-paper transition-colors duration-[120ms] hover:bg-[var(--color-ink-lift)] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-ink-4"
                      >
                        {emailState === "sending" ? "Sending" : "Send"}
                      </button>
                    </div>
                    {emailState === "error" && (
                      <p role="alert" className="mt-2 text-[0.875rem] text-critical">
                        {emailError}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEmailOpen(true)}
                    /* Reads as a text link but keeps a 44px hit area, because
                       this gets tapped with a thumb. */
                    className="inline-flex min-h-[44px] items-center text-[0.9375rem] text-ink-2 underline underline-offset-4 transition-colors duration-[120ms] hover:text-ink"
                  >
                    Email me this conversation
                  </button>
                )}
              </div>

              <div ref={bottomRef} />
            </div>

            {/* Docked composer */}
            <div className="shrink-0 border-t border-rule bg-paper px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-8 lg:px-12">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">{composer}</div>
                <div className="sm:pt-0">{callButton}</div>
              </div>
            </div>
          </main>

          {showMemory && (
            <aside className="hidden overflow-y-auto border-l border-rule px-8 py-8 lg:block">
              <MemoryPanel memory={prospect.memory} agentName={company.agentName} />
            </aside>
          )}
        </div>
      ) : (
        /* ── First paint ──────────────────────────────────────────────── */
        /* Centred vertically, not pinned to the top. The composition is short
           by design, and hanging it from the header left a third of the
           viewport as dead space below it. Centring distributes that space
           instead of pooling it in one place. The layout stays full width;
           only the vertical rhythm changes. */
        <main className="flex flex-1 items-center px-5 py-12 md:px-8 md:py-16 lg:px-12">
          <div className="grid w-full gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
            <div className="min-w-0">
              <h1 className="max-w-[20ch] text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance">
                Ask {company.name}&rsquo;s engineer anything
              </h1>
              <p className="mt-5 max-w-[68ch] text-[1rem] leading-[1.6] text-ink-2">
                {company.agentName} has read {company.name}&rsquo;s documentation, APIs,
                security posture and pricing. Type a question, or start a voice call and
                talk it through. Nothing to install, no account.
              </p>

              <div className="mt-10 max-w-[52rem]">{composer}</div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                {callButton}
                <p className="text-[0.875rem] leading-[1.45] text-ink-3">
                  {company.agentName} answers by voice too, with the same context.
                </p>
              </div>

              {sendError && (
                <p role="alert" className="mt-4 max-w-[68ch] text-[0.9375rem] text-critical">
                  {sendError}
                </p>
              )}
            </div>

            {/* Openers, as a plain hairline list. Not floating capsules, and
                never truncated: a question cut off mid-word is unreadable. */}
            <aside className="min-w-0">
              <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                Things worth asking
              </h2>
              <ul className="mt-3 border-t border-rule">
                {openers.map((opener) => (
                  <li key={opener} className="border-b border-rule">
                    <button
                      type="button"
                      onClick={() => setInput(opener)}
                      className={cn(
                        "block w-full py-3 text-left text-[0.9375rem] leading-[1.5] text-ink-2",
                        "transition-colors duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                        "hover:text-ink",
                      )}
                    >
                      {opener}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </main>
      )}

      <CallStage
        open={callOpen}
        agentName={company.agentName}
        companyName={company.name}
        conversationId={conversationId}
        onClose={() => setCallOpen(false)}
        onComplete={handleCallComplete}
      />
    </div>
  );
}
