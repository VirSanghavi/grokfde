"use client";

import { ProspectMemoryPanel } from "@/components/company/ProspectMemoryPanel";
import { AgentActivity } from "@/components/prospect/AgentActivity";
import { CallOverlay } from "@/components/prospect/CallOverlay";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusDot } from "@/components/ui/StatusDot";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type {
  AgentEvent,
  Company,
  Message,
  Prospect,
  ProspectMemory,
} from "@/types/ui";
import { IconCode, IconMail, IconPanelRight, IconPhone, IconSend, IconSparkles } from "@/components/icons";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared pill language — matches /overview and /meet. `cn()` here is a plain
 * string join, so these are complete class strings rather than overrides.
 */
const PILL_QUIET =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3.5 text-[13px] font-medium text-fg-secondary shadow-sm transition-premium hover:border-border-strong hover:bg-bg-hover hover:text-fg disabled:opacity-50";

const PILL_BRAND =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-brand-border bg-brand-dim px-3.5 text-[13px] font-medium text-fg shadow-sm transition-premium hover:border-brand hover:bg-brand-dim disabled:opacity-50";

const PILL_INK =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-fg px-5 text-[13.5px] font-semibold tracking-[-0.01em] text-bg-elevated shadow-sm transition-premium hover:opacity-90 active:scale-[0.985] disabled:opacity-50";

const SUGGESTIONS = [
  "We use Next.js and Supabase. Could Grok FDE work with our app?",
  "Can you actually integrate it?",
  "What would you recommend given our current stack?",
  "Draft an architecture for us",
];

const CAPABILITIES = ["Live video call", "Architecture diagrams", "Repo implementation"];

/** Agent-side "working on it" placeholder: avatar + breathing dots. */
function ThinkingBubble({
  agentName,
  events,
}: {
  agentName: string;
  events: AgentEvent[];
}) {
  return (
    <div className="flex w-full animate-in gap-3">
      <Avatar name={agentName} size="sm" className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 max-w-[min(100%,42rem)] flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2 pl-1">
          <span className="text-[12px] font-semibold tracking-[-0.01em] text-fg">
            {agentName}
          </span>
          <span className="mono-ts">thinking</span>
        </div>

        <div className="w-fit rounded-[var(--radius-xl)] rounded-tl-[var(--radius-sm)] border border-border bg-bg-elevated px-4 py-3.5 shadow-sm">
          <span className="flex items-center gap-1.5" aria-label="Agent is thinking">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-delay:-320ms] [animation-duration:1.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-delay:-160ms] [animation-duration:1.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-duration:1.1s]" />
          </span>
        </div>

        {events.length > 0 && <AgentActivity events={events} live className="pl-1 pt-0.5" />}
      </div>
    </div>
  );
}

export function ProspectChat({
  companySlug,
  prospectId,
}: {
  companySlug: string;
  prospectId?: string;
}) {
  const searchParams = useSearchParams();
  const autoCall = searchParams.get("call") === "1";
  const [company, setCompany] = useState<Company | null>(null);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<AgentEvent[]>([]);
  /**
   * In-progress assistant reply. `null` (or empty) means nothing is streaming
   * yet, in which case the thinking indicator is shown while `sending`.
   * Streaming transport is wired up elsewhere; this component only renders it.
   */
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [postCallLearned, setPostCallLearned] = useState<string[] | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoCallFired = useRef(false);
  const { push } = useToast();

  const scrollToBottom = useCallback((instant = false) => {
    bottomRef.current?.scrollIntoView({ behavior: instant ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const session = await api.ensureProspectSession(companySlug, prospectId);
        setCompany(session.company);
        setProspect(session.prospect);
        setConversationId(session.conversation.id);
        setMessages(session.messages);
      } finally {
        setLoading(false);
      }
    })();
  }, [companySlug, prospectId]);

  // Booked demo join: open FaceTime as soon as the session is ready
  useEffect(() => {
    if (!autoCall || loading || !conversationId || autoCallFired.current) return;
    autoCallFired.current = true;
    setCallOpen(true);
  }, [autoCall, loading, conversationId]);

  useEffect(() => {
    // Streaming updates land every few milliseconds and each smooth scroll
    // restarts the previous animation, so it never settles at the bottom and
    // the reply grows out of view. Jump instantly while streaming; keep the
    // smooth glide for discrete new messages.
    scrollToBottom(streamingText !== null);
  }, [messages, pendingEvents, streamingText, sending, scrollToBottom]);

  async function send() {
    if (!conversationId || !input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setStreamingText(null);
    setPostCallLearned(null);

    const optimistic: Message = {
      id: `tmp_${Date.now()}`,
      conversationId,
      channel: "chat",
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setPendingEvents([
      { type: "searching_knowledge", label: "Searching deployment documentation" },
    ]);

    try {
      let streamed = false;
      const res = await api.sendMessageStreaming(conversationId, text, (accumulated) => {
        streamed = true;
        // First token replaces the thinking bubble with the live reply.
        setPendingEvents([]);
        setStreamingText(accumulated);
      });

      setPendingEvents(res.events);
      // Only hold on the thinking state when nothing streamed — otherwise the
      // reply is already on screen and a pause just makes it feel slower.
      if (!streamed) await new Promise((r) => setTimeout(r, 600));
      setStreamingText(null);

      setMessages((prev) => {
        const withoutTmp = prev.filter((m) => m.id !== optimistic.id);
        return [...withoutTmp, { ...optimistic, id: `user_${Date.now()}` }, res.message];
      });
      setPendingEvents([]);

      if (prospect) {
        setProspect({
          ...prospect,
          memory: res.prospect,
          updatedAt: new Date().toISOString(),
        });
      }

      if (res.events.some((e) => e.type === "needs_human")) {
        push("Flagged for the company team", "default");
      }
    } catch {
      push("Failed to send message", "error");
      setPendingEvents([]);
    } finally {
      setStreamingText(null);
      setSending(false);
    }
  }

  async function generateArchitecture() {
    if (!conversationId) return;
    setSending(true);
    setPendingEvents([{ type: "generating_architecture", label: "Generating architecture" }]);
    try {
      await api.generateArchitecture(conversationId);
      const data = await api.getConversation(conversationId);
      if (data) setMessages(data.messages);
      push("Architecture generated", "success");
    } finally {
      setPendingEvents([]);
      setSending(false);
    }
  }

  function handleCallComplete(result: {
    learned: string[];
    prospect: ProspectMemory;
    durationSeconds: number;
  }) {
    setPostCallLearned(result.learned);
    if (prospect) {
      setProspect({
        ...prospect,
        memory: result.prospect,
        updatedAt: new Date().toISOString(),
      });
    }
    if (conversationId) {
      api.getConversation(conversationId).then((data) => {
        if (data) setMessages(data.messages);
      });
    }
  }

  if (loading || !company || !prospect || !conversationId) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <LoadingState label="Connecting to your engineer" />
      </div>
    );
  }

  const isStreaming = Boolean(streamingText && streamingText.length > 0);
  const isThinking = (sending || pendingEvents.length > 0) && !isStreaming;

  return (
    <div className="flex h-dvh flex-col bg-bg">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={company.agentName} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-fg">
                  {company.agentName}
                </h1>
                <StatusDot status="online" />
                <span className="hidden text-xs font-medium text-success sm:inline">Online</span>
              </div>
              <p className="truncate text-[13px] text-fg-muted">
                Forward-Deployed Engineer at {company.name}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className={cn(PILL_QUIET, "hidden sm:inline-flex")}
              onClick={() => push("Email draft queued (mock)", "default")}
            >
              <IconMail className="h-3.5 w-3.5" />
              Email me this
            </button>
            <button
              type="button"
              className={cn(PILL_QUIET, "hidden md:inline-flex")}
              onClick={generateArchitecture}
              disabled={sending}
            >
              <IconSparkles className="h-3.5 w-3.5" />
              Architecture
            </button>
            <Link
              href={`/conversations/${conversationId}/workspace`}
              className={cn(PILL_QUIET, "hidden lg:inline-flex")}
            >
              <IconCode className="h-3.5 w-3.5" />
              Start Implementation
            </Link>
            <button type="button" className={PILL_BRAND} onClick={() => setCallOpen(true)}>
              <IconPhone className="h-3.5 w-3.5 text-brand" />
              <span className="hidden sm:inline">FaceTime {company.agentName}</span>
              <span className="sm:hidden">FaceTime</span>
            </button>
            <IconButton
              label="Memory"
              className="lg:hidden"
              variant="solid"
              onClick={() => setShowMemory((v) => !v)}
            >
              <IconPanelRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1">
        {/* Chat column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin sm:px-6">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
              {/* Intro card */}
              <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                <div className="flex items-start gap-3.5">
                  <Avatar name={company.agentName} size="lg" className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
                      {company.agentName}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-fg-muted">
                      Forward-Deployed Engineer · {company.name}
                    </p>
                    <p className="mt-3 max-w-[52ch] text-[14px] leading-[1.6] text-fg-secondary">
                      Talk to me like an engineer — name your stack and what you&apos;re trying to
                      ship. Jump on a call any time; the full thread and every company tool comes
                      with me.
                    </p>
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {CAPABILITIES.map((cap) => (
                        <span
                          key={cap}
                          className="rounded-full border border-border bg-bg px-2.5 py-1 text-[11.5px] font-medium text-fg-muted"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Empty state */}
              {messages.length === 0 && !isThinking && (
                <p className="pl-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                  No messages yet — start below
                </p>
              )}

              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} agentName={company.agentName} />
              ))}

              {/* In-flight assistant reply (streaming wired up separately) */}
              {isStreaming && (
                <MessageBubble
                  streaming
                  agentName={company.agentName}
                  message={{
                    id: "streaming",
                    conversationId,
                    channel: "chat",
                    role: "assistant",
                    content: streamingText as string,
                    createdAt: new Date().toISOString(),
                  }}
                />
              )}

              {isThinking && (
                <ThinkingBubble agentName={company.agentName} events={pendingEvents} />
              )}

              {postCallLearned && postCallLearned.length > 0 && (
                <div className="animate-in rounded-[var(--radius-xl)] border border-brand-border bg-brand-dim p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand">
                    {company.agentName} learned from the call
                  </p>
                  <ul className="mt-2 space-y-1">
                    {postCallLearned.map((item) => (
                      <li key={item} className="text-[14px] leading-[1.6] text-fg">
                        · {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Implementation bridge — same FDE continues into the codebase */}
              {conversationId && prospect.memory.currentStack.length > 0 && (
                <div className="animate-in rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                    Next step
                  </p>
                  <p className="mt-1.5 text-[14.5px] font-semibold tracking-[-0.01em] text-fg">
                    {company.agentName} can implement the integration in your environment
                  </p>
                  <p className="mt-1.5 max-w-[58ch] text-[14px] leading-[1.6] text-fg-muted">
                    Connect a repo, review the plan, watch the build, inspect the diff, approve the
                    PR. Nothing deploys without you.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/conversations/${conversationId}/workspace`}
                      className={PILL_INK}
                    >
                      <IconCode className="h-4 w-4" />
                      Start Implementation
                    </Link>
                    <button
                      type="button"
                      className={cn(PILL_QUIET, "h-10 px-4")}
                      onClick={generateArchitecture}
                      disabled={sending}
                    >
                      <IconSparkles className="h-3.5 w-3.5" />
                      View Architecture
                    </button>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-border bg-bg-elevated px-4 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-2xl">
              <div className="flex items-end gap-2 rounded-[var(--radius-xl)] border border-border bg-bg p-2 shadow-sm transition-premium focus-within:border-border-strong">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder={`Message ${company.agentName}...`}
                  className="max-h-36 min-h-[40px] w-full flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-[1.5] text-fg placeholder:text-fg-faint focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Send message"
                  disabled={!input.trim() || sending}
                  onClick={send}
                  className={cn(
                    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-premium",
                    !input.trim() || sending
                      ? "bg-bg-hover text-fg-faint"
                      : "bg-brand text-brand-fg shadow-sm hover:bg-brand-strong active:scale-[0.96]"
                  )}
                >
                  <IconSend className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className={PILL_INK} onClick={() => setCallOpen(true)}>
                  <IconPhone className="h-4 w-4" />
                  Talk to {company.agentName}
                </button>
                <span className="hidden h-5 w-px bg-border sm:block" />
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="inline-flex h-8 items-center rounded-full border border-border bg-bg-elevated px-3 text-left text-[12.5px] font-medium text-fg-muted transition-premium hover:border-border-strong hover:bg-bg-hover hover:text-fg"
                  >
                    {suggestion.length > 42 ? `${suggestion.slice(0, 42)}…` : suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Memory panel */}
        <div className="hidden w-[300px] shrink-0 border-l border-border bg-bg-elevated lg:block">
          <ProspectMemoryPanel name={prospect.companyName} memory={prospect.memory} />
        </div>
      </div>

      {showMemory && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-fg/25 backdrop-blur-[2px]"
            aria-label="Close memory"
            onClick={() => setShowMemory(false)}
          />
          <div className="absolute inset-y-0 right-0 w-[min(100%,340px)] bg-bg-elevated shadow-lg animate-in">
            <ProspectMemoryPanel name={prospect.companyName} memory={prospect.memory} />
          </div>
        </div>
      )}

      <CallOverlay
        open={callOpen}
        agentName={company.agentName}
        conversationId={conversationId}
        onClose={() => setCallOpen(false)}
        onComplete={handleCallComplete}
      />
    </div>
  );
}
