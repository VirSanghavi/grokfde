"use client";

import { IconActivity, IconStatusDot } from "@/components/icons";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { api } from "@/lib/api/client";
import { cn, formatRelativeTime, formatTime } from "@/lib/utils";
import type { Conversation, Escalation, Message } from "@/types/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

type FeedItem = {
  id: string;
  kind: "chat" | "call" | "email" | "system" | "escalation";
  ts: string;
  title: string;
  preview: string;
  tone: "info" | "success" | "warning";
  href?: string;
  meta?: Record<string, unknown>;
};

function toneForChannel(ch?: string): FeedItem["tone"] {
  if (ch === "call") return "info";
  if (ch === "email") return "success";
  if (ch === "system") return "warning";
  return "success";
}

function kindForChannel(ch?: string): FeedItem["kind"] {
  if (ch === "call") return "call";
  if (ch === "email") return "email";
  if (ch === "system") return "system";
  return "chat";
}

export function ActivityStream() {
  const { openDrawer } = useWorkspace();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [agentName, setAgentName] = useState("Atlas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [company, conversations, dashboard] = await Promise.all([
          api.getCompany().catch(() => null),
          api.getConversations().catch(() => [] as Conversation[]),
          api.getDashboard().catch(() => null),
        ]);
        if (cancelled) return;
        if (company) setAgentName(company.agentName);

        const feed: FeedItem[] = [];

        // Recent conversation activity
        for (const c of conversations.slice(0, 10)) {
          const name =
            c.prospect?.companyName || c.prospect?.personName || "Prospect";
          feed.push({
            id: `conv_${c.id}`,
            kind: kindForChannel(c.lastChannel),
            ts: c.updatedAt,
            title: `${(c.lastChannel || "chat").toUpperCase()} · ${name}`,
            preview: c.lastMessagePreview || "Open conversation",
            tone: toneForChannel(c.lastChannel),
            href: `/conversations/${c.id}`,
            meta: {
              conversationId: c.id,
              prospectId: c.prospectId,
              channel: c.lastChannel,
            },
          });
        }

        // Escalations as HITL activity
        const escalations = (dashboard?.escalations || []) as Escalation[];
        for (const e of escalations.slice(0, 6)) {
          feed.push({
            id: `esc_${e.id}`,
            kind: "escalation",
            ts: e.createdAt,
            title: `HITL · ${e.prospectName || "Prospect"}`,
            preview: e.question || e.reason || "Needs human review",
            tone: "warning",
            href: e.conversationId
              ? `/conversations/${e.conversationId}`
              : e.prospectId
                ? `/accounts/${e.prospectId}`
                : undefined,
            meta: {
              escalationId: e.id,
              reason: e.reason,
              priority: e.priority,
            },
          });
        }

        // Atlas activity lines from dashboard
        for (const a of dashboard?.atlasActivity || []) {
          feed.push({
            id: `atlas_${a.at}_${a.label}`,
            kind: "system",
            ts: a.at,
            title: `${company?.agentName || "FDE"} runtime`,
            preview: a.label,
            tone: "info",
          });
        }

        // Enrich top conversation with latest messages when available
        const top = conversations[0];
        if (top) {
          try {
            const detail = await api.getConversation(top.id);
            if (!cancelled && detail?.messages?.length) {
              const recent = detail.messages.slice(-4);
              for (const m of recent) {
                feed.push(messageToFeed(m, top, company?.agentName || "Atlas"));
              }
            }
          } catch {
            /* optional enrich */
          }
        }

        feed.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
        // Dedupe by id
        const seen = new Set<string>();
        const unique = feed.filter((f) => {
          if (seen.has(f.id)) return false;
          seen.add(f.id);
          return true;
        });

        setItems(unique.slice(0, 24));
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load activity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const t = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <section className="surface-elevated flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)]">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg">
            <IconActivity size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-fg">FDE activity center</h2>
            <p className="mono-ts">
              {loading ? "Syncing…" : `${items.length} events · ${agentName}`}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border diag-info px-2 py-0.5 text-[10px] font-medium">
          <IconStatusDot tone="info" />
          Live
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-thin p-4">
        {error && (
          <p className="rounded-[var(--radius-md)] border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {loading && items.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-bg px-4 py-10 text-center">
            <p className="text-sm text-fg-muted">No FDE activity yet.</p>
            <p className="mt-1 text-xs text-fg-faint">
              Conversations, calls, escalations, and system events appear here.
            </p>
            <Link
              href="/fde/grok-fde"
              className="mt-3 inline-flex text-xs font-medium text-brand hover:text-fg"
            >
              Open prospect link →
            </Link>
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-[var(--radius-lg)] border border-border bg-bg p-3 transition-premium hover:border-border-strong"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <IconStatusDot
                    tone={
                      item.tone === "warning"
                        ? "warning"
                        : item.tone === "info"
                          ? "info"
                          : "success"
                    }
                  />
                  <h3 className="truncate text-xs font-semibold text-fg">{item.title}</h3>
                </div>
                <time className="mono-ts shrink-0 tabular" title={formatTime(item.ts)}>
                  {formatRelativeTime(item.ts)}
                </time>
              </div>

              <p
                className={cn(
                  "rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px] leading-relaxed",
                  item.tone === "warning"
                    ? "diag-warning"
                    : "border-border bg-bg-elevated text-fg-secondary",
                )}
              >
                {item.preview}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {item.href && (
                  <Link
                    href={item.href}
                    className="mono-ts rounded-md border border-border px-2 py-1 transition-premium hover:bg-bg-hover"
                  >
                    Open
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() =>
                    openDrawer({
                      title: item.title,
                      subtitle: item.preview,
                      kind: "generic",
                      meta: item.meta || { kind: item.kind, ts: item.ts },
                    })
                  }
                  className="mono-ts rounded-md border border-border px-2 py-1 transition-premium hover:bg-bg-hover"
                >
                  Inspect
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function messageToFeed(
  m: Message,
  conv: Conversation,
  agentName: string,
): FeedItem {
  const name = conv.prospect?.companyName || "Prospect";
  const who =
    m.role === "assistant" ? agentName : m.role === "user" ? name : "System";
  return {
    id: `msg_${m.id}`,
    kind: kindForChannel(m.channel),
    ts: m.createdAt,
    title: `${m.channel.toUpperCase()} · ${who}`,
    preview: m.content.slice(0, 220) + (m.content.length > 220 ? "…" : ""),
    tone:
      m.channel === "call"
        ? "info"
        : m.events?.some((e) => e.type === "needs_human")
          ? "warning"
          : "success",
    href: `/conversations/${conv.id}`,
    meta: {
      messageId: m.id,
      role: m.role,
      channel: m.channel,
      events: m.events,
    },
  };
}
