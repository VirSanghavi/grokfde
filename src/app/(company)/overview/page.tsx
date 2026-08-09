"use client";

import { PromptComposer } from "@/components/assistant/PromptComposer";
import { ThreadChat } from "@/components/assistant/ThreadChat";
import {
  IconArrowRight,
  IconMessage,
  IconPhone,
  IconPlus,
  IconStatusDot,
  IconVideo,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation } from "@/types/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const SUGGESTIONS = [
  "Summarize open blockers across accounts",
  "Draft a staging update for Globex",
  "What should I prep before the next demo?",
  "Start a video meet with Atlas and a teammate",
];

export default function OverviewPage() {
  const router = useRouter();
  const [agentName, setAgentName] = useState("Atlas");
  const [companyName, setCompanyName] = useState("Grok FDE");
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const [company, convs] = await Promise.all([
        api.getCompany(),
        api.getConversations().catch(() => [] as Conversation[]),
      ]);
      setAgentName(company.agentName);
      setCompanyName(company.name);
      setThreads(
        [...convs].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
      );
    } catch {
      /* no company yet */
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  async function startFromPrompt(text?: string) {
    const q = (text ?? prompt).trim();
    if (!q || booting) return;
    setBooting(true);
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
      setBooting(false);
    }
  }

  async function startMeet(twoPerson: boolean) {
    setBooting(true);
    setError(null);
    try {
      const thread = await api.createThread({
        title: twoPerson ? "Video meet with teammate" : "Video with Atlas",
      });
      router.push(
        twoPerson
          ? `/meet/${thread.conversation.id}?mode=duo`
          : `/meet/${thread.conversation.id}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start meet");
      setBooting(false);
    }
  }

  const recent = threads.slice(0, 6);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {/* Soft dotted wash like the reference, Grok FDE brand */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-border-strong) 0.7px, transparent 0.8px)",
            backgroundSize: "14px 14px",
            maskImage: "linear-gradient(180deg, black, transparent)",
          }}
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 pb-10 pt-10 sm:px-8 sm:pt-14">
          {!activeId ? (
            <>
              <div className="text-center">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1.5 shadow-sm">
                  <IconStatusDot tone="success" />
                  <span className="text-xs font-medium text-fg">{agentName}</span>
                  <span className="text-xs text-fg-faint">· {companyName}</span>
                </div>
                <h1 className="text-balance text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-tight text-fg">
                  What should we tackle today?
                </h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
                  Talk to your FDE first. Chat, jump on video, or pull a teammate into the room.
                </p>
              </div>

              <div className="mx-auto mt-8 max-w-2xl">
                <PromptComposer
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={() => startFromPrompt()}
                  onExpand={() => setExpanded(true)}
                  expanded={expanded || prompt.length > 0}
                  loading={booting}
                  autoFocus
                  placeholder="Ask about accounts, demos, implementations, blockers…"
                  onStartMeet={() => startMeet(true)}
                  footerLeft={
                    <>
                      <button
                        type="button"
                        onClick={() => startMeet(false)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 text-xs font-medium text-fg-secondary transition-premium hover:bg-bg-hover"
                      >
                        <IconPhone size={14} />
                        Call {agentName}
                      </button>
                      <button
                        type="button"
                        onClick={() => startMeet(true)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 text-xs font-medium text-fg-secondary transition-premium hover:bg-bg-hover"
                      >
                        <IconVideo size={14} />
                        Meet with teammate
                      </button>
                    </>
                  }
                />
                {error && (
                  <p className="mt-2 text-center text-xs text-danger">{error}</p>
                )}
              </div>

              <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => startFromPrompt(s)}
                    className="rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-left text-xs text-fg-muted shadow-sm transition-premium hover:border-border-strong hover:bg-bg-hover hover:text-fg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="overflow-hidden rounded-[20px] border border-border bg-bg-elevated shadow-md">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="text-sm font-medium text-fg">Active thread</p>
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
                  onCall={() => router.push(`/meet/${activeId}`)}
                />
              </div>
            </div>
          )}

          {/* Work surface under the prompt */}
          <section className="mt-12">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-fg">Recent threads</h2>
              <Link
                href="/threads"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-fg"
              >
                View all
                <IconArrowRight size={14} />
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    t: "Start a thread",
                    d: "Ask Atlas about a customer or technical question.",
                    action: () => {
                      setExpanded(true);
                    },
                  },
                  {
                    t: "Video with a teammate",
                    d: "Two-person meet with Atlas on the line.",
                    action: () => startMeet(true),
                  },
                ].map((card) => (
                  <button
                    key={card.t}
                    type="button"
                    onClick={card.action}
                    className="rounded-[16px] border border-border bg-bg-elevated p-4 text-left shadow-sm transition-premium hover:border-border-strong hover:shadow-md"
                  >
                    <p className="text-sm font-semibold text-fg">{card.t}</p>
                    <p className="mt-1 text-xs text-fg-muted">{card.d}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand">
                      Go
                      <IconArrowRight size={12} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-[16px] border border-border bg-bg-elevated shadow-sm">
                <ul className="divide-y divide-border">
                  {recent.map((t) => {
                    const name =
                      t.prospect?.companyName || t.prospect?.personName || "Thread";
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/threads/${t.id}`}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3.5 transition-premium hover:bg-bg-hover",
                            activeId === t.id && "bg-brand-dim",
                          )}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-bg">
                            <IconMessage size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-fg">{name}</p>
                              {t.lastChannel && (
                                <span className="mono-ts rounded-full border border-border px-1.5 uppercase">
                                  {t.lastChannel}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-fg-muted">
                              {t.lastMessagePreview || "No messages yet"}
                            </p>
                          </div>
                          <span className="mono-ts shrink-0">
                            {formatRelativeTime(t.updatedAt)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          <section className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: IconMessage,
                title: "Threads",
                body: "Every conversation with Atlas in one place.",
                href: "/threads",
              },
              {
                icon: IconVideo,
                title: "Meet",
                body: "Face-to-face with Atlas — bring a teammate.",
                href: "/meet",
              },
              {
                icon: IconPlus,
                title: "New thread",
                body: "Start fresh without leaving overview.",
                action: () => {
                  setActiveId(null);
                  setExpanded(true);
                  setPrompt("");
                },
              },
            ].map((card) => {
              const inner = (
                <>
                  <card.icon size={18} />
                  <p className="mt-3 text-sm font-semibold text-fg">{card.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{card.body}</p>
                </>
              );
              const cls =
                "rounded-[16px] border border-border bg-bg-elevated p-4 text-left shadow-sm transition-premium hover:border-border-strong hover:shadow-md";
              if ("href" in card && card.href) {
                return (
                  <Link key={card.title} href={card.href} className={cls}>
                    {inner}
                  </Link>
                );
              }
              return (
                <button
                  key={card.title}
                  type="button"
                  onClick={"action" in card ? card.action : undefined}
                  className={cls}
                >
                  {inner}
                </button>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
