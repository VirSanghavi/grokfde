"use client";

import { PromptComposer } from "@/components/assistant/PromptComposer";
import { ThreadChat } from "@/components/assistant/ThreadChat";
import { CallOverlay } from "@/components/prospect/CallOverlay";
import {
  IconArrowRight,
  IconLoader,
  IconMessage,
  IconPhone,
  IconVideo,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation, FdeDashboardData } from "@/types/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const SUGGESTIONS = [
  "Summarize open blockers across accounts",
  "Draft a staging update for Globex",
  "What should I prep before the next demo?",
  "Which accounts are closest to production?",
];

/** Busy states we surface to the user so nothing ever looks frozen. */
type Busy = null | { kind: "thread" | "call" | "meet"; label: string };

export default function OverviewPage() {
  const router = useRouter();
  const [agentName, setAgentName] = useState("Atlas");
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [dashboard, setDashboard] = useState<FdeDashboardData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const [company, convs] = await Promise.all([
        api.getCompany(),
        api.getConversations().catch(() => [] as Conversation[]),
      ]);
      setAgentName(company.agentName);
      setThreads(
        [...convs].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
      );
    } catch {
      /* no company yet */
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setDashboard(await api.getDashboard());
    } catch {
      setDashboard(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
    loadStats();
  }, [loadThreads, loadStats]);

  async function startFromPrompt(text?: string) {
    const q = (text ?? prompt).trim();
    if (!q || busy) return;
    setBusy({ kind: "thread", label: `Starting a thread with ${agentName}…` });
    setError(null);
    setExpanded(true);
    try {
      const thread = await api.createThread({ title: q });
      setActiveId(thread.conversation.id);
      setPrompt("");
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start thread");
    } finally {
      setBusy(null);
    }
  }

  /** Reuse the thread already on screen, otherwise the most recent, otherwise create one. */
  async function ensureConversationId(title: string) {
    if (activeId) return activeId;
    if (threads[0]?.id) return threads[0].id;
    const thread = await api.createThread({ title });
    await loadThreads();
    return thread.conversation.id;
  }

  /** Voice call — opens the call overlay in place, no navigation. */
  async function startCall() {
    if (busy) return;
    setBusy({ kind: "call", label: `Connecting a call with ${agentName}…` });
    setError(null);
    try {
      setCallId(await ensureConversationId(`Call with ${agentName}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the call");
    } finally {
      setBusy(null);
    }
  }

  /** Video room — camera on, plus a join link you can send to a teammate. */
  async function startMeet() {
    if (busy) return;
    setBusy({ kind: "meet", label: "Opening the video room…" });
    setError(null);
    try {
      const id = await ensureConversationId("Video room");
      router.push(`/meet/${id}?mode=duo`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the video room");
      setBusy(null);
    }
  }

  const recent = threads.slice(0, 5);
  const m = dashboard?.metrics;
  const stats = [
    { label: "Active accounts", value: m?.activeAccounts ?? m?.activeProspects ?? 0 },
    { label: "Implementations", value: m?.implementations ?? 0 },
    { label: "In production", value: m?.production ?? 0 },
    { label: "Blocked", value: m?.blocked ?? 0, tone: "warn" as const },
    { label: "Knowledge sources", value: dashboard?.agent.knowledgeSourceCount ?? 0 },
    { label: "MCP tools", value: dashboard?.agent.mcpToolCount ?? 0 },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {/* Soft dotted wash like the reference, Grok FDE brand */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-border-strong) 0.7px, transparent 0.8px)",
            backgroundSize: "14px 14px",
            maskImage: "linear-gradient(180deg, black, transparent)",
          }}
        />

        <div className="relative mx-auto w-full max-w-[1600px] px-5 pb-16 pt-10 sm:px-8 sm:pt-14 2xl:px-12">
          {!activeId ? (
            <>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-[34rem]">
                  <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">
                    Your engineer
                  </p>
                  <h1 className="marketing-display mt-1.5 text-[clamp(2rem,4.2vw,3.25rem)] font-medium leading-[1.02] tracking-[-0.04em] text-fg">
                    What should we tackle today?
                  </h1>
                  <p className="marketing-body mt-4 max-w-[28rem] text-[15px] leading-[1.5] text-fg-muted">
                    Talk to your FDE first. Chat, jump on a call, or open a video room.
                  </p>
                </div>

                <p className="inline-flex w-fit items-center rounded-full border border-border bg-bg-elevated px-4 py-2 text-[13px] font-medium text-fg-secondary shadow-sm">
                  Chat · Call · Video room
                </p>
              </div>

              <div className="mt-7 max-w-[56rem]">
                <PromptComposer
                  compact
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={() => startFromPrompt()}
                  onExpand={() => setExpanded(true)}
                  expanded={expanded || prompt.length > 0}
                  loading={busy?.kind === "thread"}
                  autoFocus
                  placeholder="Ask about accounts, demos, implementations, blockers…"
                  footerLeft={
                    <>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={(e) => {
                          e.stopPropagation();
                          void startCall();
                        }}
                        title={`Live voice call with ${agentName} — starts right here`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-bg px-3.5 text-[13px] font-medium text-fg-secondary transition-premium hover:border-border-strong hover:bg-bg-hover disabled:opacity-50"
                      >
                        {busy?.kind === "call" ? (
                          <IconLoader size={14} className="animate-spin" />
                        ) : (
                          <IconPhone size={14} />
                        )}
                        Call {agentName}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={(e) => {
                          e.stopPropagation();
                          void startMeet();
                        }}
                        title="Opens a video room with your camera on, plus a link you can send a teammate"
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-bg px-3.5 text-[13px] font-medium text-fg-secondary transition-premium hover:border-border-strong hover:bg-bg-hover disabled:opacity-50"
                      >
                        {busy?.kind === "meet" ? (
                          <IconLoader size={14} className="animate-spin" />
                        ) : (
                          <IconVideo size={14} />
                        )}
                        Video room + invite
                      </button>
                    </>
                  }
                />

                {/* Always-visible progress — the send-button spinner alone is too easy to miss. */}
                <div aria-live="polite" className="min-h-[26px] pt-2.5">
                  {busy && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-dim px-3 py-1 text-[12.5px] font-medium text-fg">
                      <IconLoader size={13} className="animate-spin" />
                      {busy.label}
                    </span>
                  )}
                  {!busy && error && (
                    <span className="text-[12.5px] text-danger">{error}</span>
                  )}
                  {!busy && !error && (
                    <span className="text-[12.5px] leading-snug text-fg-faint">
                      Call = live voice with {agentName}. Video room = your camera on, with a
                      join link for a teammate.
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex max-w-[56rem] flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => startFromPrompt(s)}
                    className="inline-flex h-9 items-center rounded-full border border-border bg-bg-elevated px-4 text-left text-[13px] font-medium text-fg-muted shadow-sm transition-premium hover:border-border-strong hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-md">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">
                    Active thread
                  </p>
                  <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-fg">
                    {agentName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/threads/${activeId}`}>
                    <Button size="sm" variant="ghost" rightIcon={<IconArrowRight size={14} />}>
                      Open full
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setActiveId(null);
                      setExpanded(false);
                    }}
                  >
                    New chat
                  </Button>
                </div>
              </div>
              <div className="h-[min(70dvh,640px)]">
                <ThreadChat
                  conversationId={activeId}
                  agentName={agentName}
                  compact
                  showHeader
                  onMeet={() => router.push(`/meet/${activeId}?mode=duo`)}
                  onCall={() => setCallId(activeId)}
                />
              </div>
            </div>
          )}

          {/* Workspace statistics — the numbers that used to live in Operations */}
          <section className="mt-12 border-t border-border pt-8 sm:mt-14 sm:pt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">01</p>
                <h2 className="marketing-display mt-1.5 text-[clamp(1.4rem,2.6vw,2rem)] font-medium leading-[1.15] tracking-[-0.03em] text-fg">
                  Workspace
                </h2>
              </div>
              <span className="mono-ts uppercase tracking-[0.14em]">
                {statsLoading ? "loading…" : "live"}
              </span>
            </div>

            {/* Hairline seams instead of gutters — the landing page's product strip */}
            <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="flex min-w-0 flex-col bg-bg-elevated p-5 sm:p-6"
                >
                  <p className="truncate text-[12.5px] font-medium tracking-[-0.01em] text-fg-muted">
                    {s.label}
                  </p>
                  {statsLoading ? (
                    <div className="skeleton mt-3 h-9 w-14" />
                  ) : (
                    <p
                      className={cn(
                        "mt-2 font-mono text-[clamp(1.75rem,2.6vw,2.6rem)] leading-[1.05] tabular tracking-[-0.04em] text-fg",
                        s.tone === "warn" && s.value > 0 && "text-warning",
                      )}
                    >
                      {s.value}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Recent threads — one horizontal row */}
          <section className="mt-12 border-t border-border pt-8 sm:mt-14 sm:pt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">02</p>
                <h2 className="marketing-display mt-1.5 text-[clamp(1.4rem,2.6vw,2rem)] font-medium leading-[1.15] tracking-[-0.03em] text-fg">
                  Recent threads
                </h2>
              </div>
              <Link
                href="/threads"
                className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-4 text-[13px] font-medium text-fg-secondary shadow-sm transition-premium hover:border-border-strong hover:bg-bg-hover hover:text-fg"
              >
                View all
                <IconArrowRight size={14} />
              </Link>
            </div>

            {recent.length === 0 ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-6 w-full rounded-2xl border border-dashed border-border bg-bg-elevated p-6 text-left shadow-sm transition-premium hover:border-border-strong sm:p-8"
              >
                <p className="text-[15px] font-semibold tracking-[-0.02em] text-fg">
                  No threads yet
                </p>
                <p className="mt-1.5 text-[13.5px] leading-snug text-fg-muted">
                  Ask {agentName} something above and it will show up here.
                </p>
              </button>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {recent.map((t) => {
                  const name =
                    t.prospect?.companyName || t.prospect?.personName || "Thread";
                  const preview = t.lastMessagePreview?.trim();
                  // New threads are titled by their opening message — don't say it twice.
                  const showPreview = Boolean(preview) && preview !== name;
                  return (
                    <Link
                      key={t.id}
                      href={`/threads/${t.id}`}
                      className="flex min-w-0 flex-col rounded-2xl border border-border bg-bg-elevated p-5 shadow-sm transition-premium hover:border-border-strong hover:shadow-md"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg">
                        <IconMessage size={14} />
                      </span>
                      <p className="mt-3.5 line-clamp-2 text-[14.5px] font-semibold leading-snug tracking-[-0.015em] text-fg">
                        {name}
                      </p>
                      {showPreview && (
                        <p className="mt-2 line-clamp-3 text-[13px] leading-snug text-fg-muted">
                          {preview}
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
                        {t.lastChannel ? (
                          <span className="mono-ts rounded-full border border-border px-1.5 uppercase">
                            {t.lastChannel}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="mono-ts shrink-0">
                          {formatRelativeTime(t.updatedAt)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {callId && (
        <CallOverlay
          open
          agentName={agentName}
          conversationId={callId}
          onClose={() => {
            setCallId(null);
            void loadThreads();
          }}
          onComplete={() => {
            void loadThreads();
          }}
        />
      )}
    </div>
  );
}
