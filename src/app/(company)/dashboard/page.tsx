"use client";

import { EscalationCard } from "@/components/company/EscalationCard";
import { TopNav } from "@/components/layout/TopNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusDot } from "@/components/ui/StatusDot";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils";
import type { FdeDashboardData } from "@/types/ui";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Code2,
  Lightbulb,
  OctagonAlert,
  Rocket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function DashboardPage() {
  const [data, setData] = useState<FdeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getDashboard();
      setData(d as FdeDashboardData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) {
    return <LoadingState label="Loading dashboard" className="flex-1" />;
  }

  const m = data.metrics;
  const metrics = [
    {
      label: "Active accounts",
      value: m.activeAccounts ?? m.activeProspects,
      icon: Building2,
    },
    {
      label: "Implementations",
      value: m.implementations ?? 0,
      icon: Code2,
    },
    {
      label: "Production",
      value: m.production ?? 0,
      icon: Rocket,
    },
    {
      label: "Blocked",
      value: m.blocked ?? 0,
      icon: OctagonAlert,
      alert: (m.blocked ?? 0) > 0,
    },
    {
      label: "Needs you",
      value: m.needsHelp,
      icon: AlertCircle,
      alert: true,
    },
    {
      label: "Conversations",
      value: m.conversations,
      icon: Users,
    },
  ];

  return (
    <>
      <TopNav
        title="Dashboard"
        subtitle="FDE operating view — accounts, blockers, and field signals"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/accounts/pr_globex">
              <Button size="sm" variant="secondary">
                Globex Account Room
              </Button>
            </Link>
            <Link href="/fde/grok-fde">
              <Button
                size="sm"
                variant="secondary"
                rightIcon={<ArrowUpRight className="h-3.5 w-3.5" />}
              >
                Prospect view
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {metrics.map((item) => (
              <div
                key={item.label}
                className={`rounded-[var(--radius-xl)] border p-4 shadow-sm ${
                  item.alert
                    ? "border-danger/25 bg-danger/5"
                    : "border-border bg-bg-elevated"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs text-fg-muted">{item.label}</p>
                  <item.icon
                    className={`h-4 w-4 ${item.alert ? "text-danger" : "text-fg-faint"}`}
                  />
                </div>
                <p className="mt-3 font-mono text-2xl tabular tracking-tight text-fg">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Needs you</h2>
                <Badge tone="danger">{data.escalations.length} open</Badge>
              </div>
              {data.escalations.length === 0 ? (
                <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated px-5 py-10 text-center text-sm text-fg-muted shadow-sm">
                  No open escalations. {data.agent.name} is handling it.
                </div>
              ) : (
                data.escalations.map((esc) => (
                  <EscalationCard
                    key={esc.id}
                    escalation={esc}
                    onRespond={async (id, response) => {
                      await api.respondEscalation(id, response);
                      push("Response sent to prospect", "success");
                      load();
                    }}
                  />
                ))
              )}

              {data.blockedAccounts && data.blockedAccounts.length > 0 && (
                <div className="pt-4">
                  <h2 className="mb-3 text-sm font-semibold text-fg">Blocked accounts</h2>
                  <div className="space-y-2">
                    {data.blockedAccounts.map((a) => (
                      <Link
                        key={a.id}
                        href={`/accounts/${a.id}`}
                        className="flex items-center justify-between rounded-[var(--radius-lg)] border border-danger/20 bg-bg-elevated px-4 py-3 shadow-sm transition-colors hover:bg-bg-hover"
                      >
                        <div>
                          <p className="text-sm font-medium text-fg">{a.name}</p>
                          <p className="text-xs text-fg-muted">{a.blocker}</p>
                        </div>
                        <Badge tone="danger">Blocked</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <div className="space-y-6">
              <section className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                  FDE status
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <StatusDot status="online" />
                  <span className="text-lg font-semibold text-fg">{data.agent.name}</span>
                  <Badge tone="success">Online</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-mono text-2xl tabular text-fg">
                      {data.agent.knowledgeSourceCount}
                    </p>
                    <p className="text-xs text-fg-muted">Knowledge sources</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl tabular text-fg">
                      {data.agent.mcpToolCount}
                    </p>
                    <p className="text-xs text-fg-muted">MCP tools</p>
                  </div>
                </div>
                {data.atlasActivity && (
                  <ul className="mt-4 space-y-2 border-t border-border pt-4">
                    {data.atlasActivity.map((a) => (
                      <li key={a.label} className="text-xs text-fg-muted">
                        <span className="text-fg-secondary">{a.label}</span>
                        <span className="ml-2 font-mono text-fg-faint">
                          {formatRelativeTime(a.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-fg">Recent field signals</h2>
                  <Link
                    href="/field-signals"
                    className="text-xs font-medium text-brand hover:text-fg"
                  >
                    View all
                  </Link>
                </div>
                <div className="space-y-2">
                  {(data.fieldSignalsPreview || []).map((s) => (
                    <div
                      key={s.id}
                      className="rounded-[var(--radius-lg)] border border-border bg-bg-elevated px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-3.5 w-3.5 text-brand" />
                        <span className="font-mono text-[11px] text-fg-faint">
                          {s.accountCount} accounts
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-fg">{s.title}</p>
                    </div>
                  ))}
                  {!data.fieldSignalsPreview?.length && (
                    <p className="text-sm text-fg-muted">No field signals yet.</p>
                  )}
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold text-fg">Recent conversations</h2>
                <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-bg-elevated shadow-sm">
                  {data.recentConversations.map((c) => (
                    <Link
                      key={c.id}
                      href={`/conversations/${c.id}`}
                      className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-0 hover:bg-bg-hover"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-fg">{c.prospectName}</span>
                          <Badge
                            tone={
                              c.channel === "call"
                                ? "call"
                                : c.channel === "chat"
                                  ? "info"
                                  : "neutral"
                            }
                          >
                            {c.channel}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-fg-muted">{c.preview}</p>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-fg-faint">
                        {formatRelativeTime(c.updatedAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
