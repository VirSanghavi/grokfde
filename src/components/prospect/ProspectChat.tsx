"use client";

import { ProspectMemoryPanel } from "@/components/company/ProspectMemoryPanel";
import { AgentActivity } from "@/components/prospect/AgentActivity";
import { CallOverlay } from "@/components/prospect/CallOverlay";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusDot } from "@/components/ui/StatusDot";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api/client";
import type {
  AgentEvent,
  Company,
  Message,
  Prospect,
  ProspectMemory,
} from "@/types/ui";
import { IconCode, IconMail, IconPanelRight, IconPhone, IconSend, IconSparkles } from "@/components/icons";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export function ProspectChat({
  companySlug,
  prospectId,
}: {
  companySlug: string;
  prospectId?: string;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<AgentEvent[]>([]);
  const [callOpen, setCallOpen] = useState(false);
  const [postCallLearned, setPostCallLearned] = useState<string[] | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { push } = useToast();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingEvents, scrollToBottom]);

  async function send() {
    if (!conversationId || !input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
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
      const res = await api.sendMessage(conversationId, text);
      setPendingEvents(res.events);
      await new Promise((r) => setTimeout(r, 600));

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

  return (
    <div className="flex h-dvh flex-col bg-bg">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={company.agentName} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold text-fg">{company.agentName}</h1>
                <StatusDot status="online" />
                <span className="hidden text-xs font-medium text-success sm:inline">Online</span>
              </div>
              <p className="truncate text-sm text-fg-muted">
                Forward-Deployed Engineer at {company.name}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="hidden sm:inline-flex"
              leftIcon={<IconMail className="h-3.5 w-3.5" />}
              onClick={() => push("Email draft queued (mock)", "default")}
            >
              Email me this
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="hidden md:inline-flex"
              leftIcon={<IconSparkles className="h-3.5 w-3.5" />}
              onClick={generateArchitecture}
              disabled={sending}
            >
              Architecture
            </Button>
            {conversationId && (
              <Link href={`/conversations/${conversationId}/workspace`} className="hidden sm:inline-flex">
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<IconCode className="h-3.5 w-3.5" />}
                >
                  Start Implementation
                </Button>
              </Link>
            )}
            <Button
              size="sm"
              className="glow-accent"
              leftIcon={<IconPhone className="h-3.5 w-3.5" />}
              onClick={() => setCallOpen(true)}
            >
              Call {company.agentName}
            </Button>
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
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 scrollbar-thin sm:px-6">
            <div className="mx-auto max-w-2xl rounded-[var(--radius-lg)] border border-border bg-bg-elevated px-4 py-3 shadow-sm">
              <p className="text-sm leading-relaxed text-fg-muted">
                You&apos;re on a dedicated line to a technical engineer. Mention your stack.
                Context carries into calls.
              </p>
            </div>

            {messages.map((m) => (
              <div key={m.id} className="mx-auto max-w-2xl">
                <MessageBubble message={m} agentName={company.agentName} />
              </div>
            ))}

            {pendingEvents.length > 0 && (
              <div className="mx-auto max-w-2xl pl-11">
                <AgentActivity events={pendingEvents} live />
              </div>
            )}

            {postCallLearned && postCallLearned.length > 0 && (
              <div className="mx-auto max-w-2xl animate-in rounded-[var(--radius-lg)] border border-brand-border bg-brand-dim p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand">
                  {company.agentName} learned from the call
                </p>
                <ul className="mt-2 space-y-1">
                  {postCallLearned.map((item) => (
                    <li key={item} className="text-sm text-fg">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Implementation bridge — same FDE continues into the codebase */}
            {conversationId && prospect.memory.currentStack.length > 0 && (
              <div className="mx-auto max-w-2xl animate-in rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-4 shadow-sm">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                  Next step
                </p>
                <p className="mt-1 text-sm font-medium text-fg">
                  {company.agentName} can implement the integration in your environment
                </p>
                <p className="mt-1 text-sm text-fg-muted">
                  Connect a repo, review the plan, watch the build, inspect the diff, approve the PR.
                  Nothing deploys without you.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/conversations/${conversationId}/workspace`}>
                    <Button size="sm" leftIcon={<IconCode className="h-3.5 w-3.5" />}>
                      Start Implementation
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<IconSparkles className="h-3.5 w-3.5" />}
                    onClick={generateArchitecture}
                    disabled={sending}
                  >
                    View Architecture
                  </Button>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-border bg-bg-elevated px-4 py-4 sm:px-6">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-end gap-2 rounded-[var(--radius-xl)] border border-border bg-bg p-2 shadow-sm">
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
                  className="max-h-36 min-h-[44px] w-full flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-fg placeholder:text-fg-faint focus:outline-none"
                />
                <Button
                  size="md"
                  className="shrink-0"
                  disabled={!input.trim() || sending}
                  onClick={send}
                  aria-label="IconSend"
                >
                  <IconSend className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "We use Next.js and Supabase. Could Grok FDE work with our app?",
                  "Can you actually integrate it?",
                  "What would you recommend given our current stack?",
                  "Draft an architecture for us",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-left text-xs text-fg-muted transition-colors hover:border-border-strong hover:bg-bg-hover hover:text-fg"
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
