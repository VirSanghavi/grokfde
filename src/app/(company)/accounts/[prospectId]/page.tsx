"use client";

import { SlackThreadPanel } from "@/components/account/SlackThreadPanel";
import { MilestoneTrack } from "@/components/account/MilestoneTrack";
import { TimelineFeed } from "@/components/account/TimelineFeed";
import { TopNav } from "@/components/layout/TopNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { ImplementationStatus } from "@/components/workspace/ImplementationStatus";
import { api } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils";
import type { AccountRoom, SlackThread } from "@/types/ui";
import {
  AlertTriangle,
  Check,
  Code2,
  ExternalLink,
  MessageSquare,
  Play,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Tab = "overview" | "timeline" | "implementation" | "deployment" | "feedback";

function stageLabel(s: string) {
  return s.replace(/_/g, " ");
}

export default function AccountRoomPage() {
  const params = useParams<{ prospectId: string }>();
  const prospectId = params.prospectId;
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [room, setRoom] = useState<AccountRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<SlackThread | null>(null);
  const [agentName, setAgentName] = useState("Atlas");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acct, company] = await Promise.all([
        api.getAccountRoom(prospectId),
        api.getCompany(),
      ]);
      setAgentName(company.agentName);
      setRoom(acct);
    } finally {
      setLoading(false);
    }
  }, [prospectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openThread(id: string) {
    const t = await api.getSlackThread(id);
    setThread(t);
    setTab("timeline");
  }

  async function advanceDemo() {
    setBusy(true);
    try {
      const next = await api.advanceAccountDemo(room?.prospectId || "pr_globex");
      setRoom(next);
      push("Account timeline advanced", "success");
      if (next.issue || next.timeline.some((t) => t.threadId === "thread_401")) {
        const t = await api.getSlackThread("thread_401");
        if (t) setThread(t);
      }
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState className="flex-1" label="Opening account room" />;
  if (!room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-fg-muted">Account not found</p>
        <Link href="/dashboard">
          <Button variant="secondary">Dashboard</Button>
        </Link>
      </div>
    );
  }

  const openBlockers = room.blockers.filter((b) => b.status === "open");

  return (
    <>
      <TopNav
        title={room.name}
        subtitle={`${stageLabel(room.stage)} · ${agentName} is the assigned FDE`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" loading={busy} onClick={advanceDemo} leftIcon={<Play className="h-3.5 w-3.5" />}>
              Advance demo
            </Button>
            <Link href={`/conversations/${room.conversationId}/workspace`}>
              <Button size="sm" variant="secondary" leftIcon={<Code2 className="h-3.5 w-3.5" />}>
                Implementation
              </Button>
            </Link>
            <Link href={`/conversations/${room.conversationId}`}>
              <Button size="sm" variant="ghost">Conversation</Button>
            </Link>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header strip */}
          <div className="shrink-0 border-b border-border bg-bg-elevated px-5 py-4 sm:px-8">
            <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-fg">{room.name}</h2>
                  <Badge tone="accent">{stageLabel(room.stage)}</Badge>
                  {openBlockers.length > 0 && (
                    <Badge tone="danger">{openBlockers.length} blocked</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-fg-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot status="online" />
                    {agentName} · {room.atlasStatus}
                  </span>
                  <span className="text-fg-faint">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Chat · Slack · Email · Calls
                  </span>
                </div>
              </div>
              {room.slack && (
                <div className="rounded-[var(--radius-lg)] border border-border bg-bg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="success">Slack connected</Badge>
                    <span className="font-mono text-sm text-fg">{room.slack.channelName}</span>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {room.slack.workspaceName} · {room.slack.participantCount ?? 0} participants ·
                    last active{" "}
                    {room.slack.lastActiveAt
                      ? formatRelativeTime(room.slack.lastActiveAt)
                      : "—"}
                  </p>
                </div>
              )}
            </div>
            <div className="mx-auto mt-4 max-w-6xl">
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  { value: "overview", label: "Overview" },
                  { value: "timeline", label: "Timeline" },
                  { value: "implementation", label: "Implementation" },
                  { value: "deployment", label: "Deployment" },
                  { value: "feedback", label: "Feedback" },
                ]}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 sm:px-8">
              {tab === "overview" && (
                <>
                  {/* Issue banner */}
                  {room.issue && room.issue.status !== "resolved" && (
                    <section className="rounded-[var(--radius-xl)] border border-danger/25 bg-danger/5 p-5 shadow-sm animate-in">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-danger" />
                            <Badge tone="danger">
                              {room.issue.environment === "Production"
                                ? "Production issue"
                                : "Staging issue"}
                            </Badge>
                            <ImplementationStatus status={room.issue.status} />
                          </div>
                          <h3 className="mt-2 text-lg font-semibold text-fg">{room.issue.title}</h3>
                          <p className="mt-1 text-sm text-fg-muted">
                            First reported: {room.issue.source}
                            {room.issue.firstReported
                              ? ` · ${formatRelativeTime(room.issue.firstReported)}`
                              : ""}
                          </p>
                          {room.issue.rootCause && (
                            <p className="mt-3 text-sm text-fg-secondary">
                              <span className="font-medium text-fg">Root cause: </span>
                              {room.issue.rootCause}
                            </p>
                          )}
                          {room.issue.linkedPr && (
                            <p className="mt-2 font-mono text-sm text-brand">
                              {room.issue.linkedPr} · {room.issue.atlasStatus}
                            </p>
                          )}
                        </div>
                        {room.issue.status === "fix_ready" && (
                          <Badge tone="success">Fix ready</Badge>
                        )}
                      </div>
                    </section>
                  )}

                  <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                    <section className="space-y-4">
                      <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                          Success outcome
                        </p>
                        <p className="mt-2 text-base font-medium leading-relaxed text-fg">
                          {room.successOutcome}
                        </p>
                        <ul className="mt-4 space-y-1.5">
                          {room.successCriteria.map((c) => (
                            <li key={c} className="flex items-start gap-2 text-sm text-fg-secondary">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <StatCard label="Stage" value={stageLabel(room.stage)} />
                        <StatCard label="Environment" value={room.currentEnvironment || "—"} />
                        <StatCard label="Implementation" value={room.currentImplementation || "—"} />
                        <StatCard label="Next action" value={room.nextAction} />
                      </div>

                      <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                          Stack
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {room.stack.map((s) => (
                            <span
                              key={s}
                              className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg-secondary"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>

                      {openBlockers.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-fg">Blockers</p>
                          {openBlockers.map((b) => (
                            <div
                              key={b.id}
                              className="rounded-[var(--radius-lg)] border border-danger/20 bg-bg-elevated p-4 shadow-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone="danger">Blocked</Badge>
                                <Badge tone="neutral">{b.ownerKind || "unknown"}</Badge>
                              </div>
                              <p className="mt-2 text-sm font-medium text-fg">{b.title}</p>
                              {b.description && (
                                <p className="mt-1 text-sm text-fg-muted">{b.description}</p>
                              )}
                              <div className="mt-2 grid gap-1 text-xs text-fg-muted sm:grid-cols-2">
                                <p>Owner: {b.owner || "—"}</p>
                                <p>Impact: {b.impact || "—"}</p>
                                <p>Source: {b.source || "—"}</p>
                                <p>Atlas: {b.atlasAction || "—"}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {room.implementationRequest && room.implementationRequest.status !== "done" && (
                        <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                            Implementation request
                          </p>
                          <p className="mt-2 text-sm font-medium text-fg">
                            {room.implementationRequest.request}
                          </p>
                          <p className="mt-1 text-xs text-fg-muted">
                            Source: {room.implementationRequest.source}
                          </p>
                          <Link
                            href={`/conversations/${room.conversationId}/workspace`}
                            className="mt-3 inline-flex"
                          >
                            <Button size="sm">Review plan</Button>
                          </Link>
                        </div>
                      )}
                    </section>

                    <aside className="space-y-4">
                      <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                          Milestones
                        </p>
                        <MilestoneTrack milestones={room.milestones} />
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                          Decisions
                        </p>
                        <div className="space-y-3">
                          {room.decisions.map((d) => (
                            <div key={d.id}>
                              <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
                                {d.title}
                              </p>
                              <p className="mt-1 text-sm text-fg">{d.decision}</p>
                              {d.rationale && (
                                <p className="mt-0.5 text-xs text-fg-muted">{d.rationale}</p>
                              )}
                              <p className="mt-1 font-mono text-[10px] text-fg-faint">
                                {d.source} · {formatRelativeTime(d.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                          Commitments
                        </p>
                        <ul className="space-y-2.5">
                          {room.commitments.map((c) => (
                            <li key={c.id} className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-medium text-brand">{c.owner}</p>
                                <p className="text-sm text-fg-secondary">{c.description}</p>
                              </div>
                              <Badge tone={c.status === "done" ? "success" : "neutral"}>
                                {c.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </aside>
                  </div>
                </>
              )}

              {tab === "timeline" && (
                <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                  <TimelineFeed items={room.timeline} onOpenThread={openThread} />
                  <div className="hidden min-h-[420px] overflow-hidden rounded-[var(--radius-xl)] border border-border lg:block">
                    {thread ? (
                      <SlackThreadPanel thread={thread} onClose={() => setThread(null)} />
                    ) : (
                      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
                        Select a Slack timeline item to open the thread
                      </div>
                    )}
                  </div>
                  {thread && (
                    <div className="max-h-[50vh] overflow-hidden rounded-[var(--radius-xl)] border border-border lg:hidden">
                      <SlackThreadPanel thread={thread} onClose={() => setThread(null)} />
                    </div>
                  )}
                </div>
              )}

              {tab === "implementation" && (
                <div className="space-y-4">
                  <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                      Current implementation
                    </p>
                    <p className="mt-2 text-lg font-semibold text-fg">
                      {room.currentImplementation || "Not started"}
                    </p>
                    <p className="mt-1 text-sm text-fg-muted">{room.atlasStatus}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/conversations/${room.conversationId}/workspace`}>
                        <Button leftIcon={<Code2 className="h-4 w-4" />}>
                          Open implementation workspace
                        </Button>
                      </Link>
                    </div>
                  </div>
                  {room.implementationRequest && (
                    <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                      <Badge tone="info">From {room.implementationRequest.source}</Badge>
                      <p className="mt-2 text-sm font-medium text-fg">
                        {room.implementationRequest.request}
                      </p>
                      <p className="mt-1 text-xs text-fg-muted">
                        Status: {room.implementationRequest.status}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {tab === "deployment" && (
                <div className="space-y-4">
                  {room.deployment && (
                    <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                          Deployment
                        </p>
                        {room.deployment.demo && <Badge tone="neutral">Demo</Badge>}
                        <ImplementationStatus status={room.deployment.status} large />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <StatCard label="Environment" value={room.deployment.environment} />
                        <StatCard label="Version" value={room.deployment.version || "—"} />
                        <StatCard label="Next" value={room.deployment.next || "—"} />
                      </div>
                      {room.deployment.checks && (
                        <ul className="mt-5 space-y-2">
                          {room.deployment.checks.map((c) => (
                            <li
                              key={c.label}
                              className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2 text-sm"
                            >
                              <span className="text-fg-secondary">{c.label}</span>
                              <Badge
                                tone={
                                  c.status === "passed"
                                    ? "success"
                                    : c.status === "failed"
                                      ? "danger"
                                      : c.status === "running"
                                        ? "warning"
                                        : "neutral"
                                }
                              >
                                {c.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {room.adoption && (
                    <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                        Production · adoption
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatCard label="Live for" value={room.adoption.liveFor || "—"} />
                        <StatCard label="Runs" value={String(room.adoption.runs ?? "—")} />
                        <StatCard
                          label="Success"
                          value={
                            room.adoption.successRate != null
                              ? `${room.adoption.successRate}%`
                              : "—"
                          }
                        />
                        <StatCard
                          label="Users"
                          value={String(room.adoption.customerUsers ?? "—")}
                        />
                      </div>
                      {room.adoption.recommendation && (
                        <p className="mt-4 rounded-[var(--radius-md)] border border-brand-border bg-brand-dim px-3 py-2 text-sm text-fg">
                          <span className="font-medium">{agentName} recommendation: </span>
                          {room.adoption.recommendation}
                        </p>
                      )}
                    </div>
                  )}

                  {room.quality && (
                    <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                          Quality
                        </p>
                        <Badge
                          tone={room.quality.status === "PASSING" ? "success" : "warning"}
                        >
                          {room.quality.status}
                        </Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatCard
                          label="Scenario pass"
                          value={`${room.quality.scenarioPassRate ?? "—"}%`}
                        />
                        <StatCard
                          label="Policy"
                          value={`${room.quality.policyAdherence ?? "—"}%`}
                        />
                        <StatCard
                          label="Tool correctness"
                          value={`${room.quality.toolCorrectness ?? "—"}%`}
                        />
                        <StatCard
                          label="Escalation accuracy"
                          value={`${room.quality.escalationAccuracy ?? "—"}%`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "feedback" && (
                <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                  <p className="text-sm text-fg-muted">
                    Account-level notes feed company Field Signals. Open the global view for
                    cross-account patterns.
                  </p>
                  <Link href="/field-signals" className="mt-4 inline-flex">
                    <Button variant="secondary" rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>
                      Open Field Signals
                    </Button>
                  </Link>
                  <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-bg px-3 py-3">
                    <Shield className="mt-0.5 h-4 w-4 text-brand" />
                    <p className="text-sm text-fg-secondary">
                      {agentName} surfaces repeated custom work and customer requests so Product
                      can turn FDE patterns into native features.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-bg-elevated p-4 shadow-sm">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-fg">{value}</p>
    </div>
  );
}
