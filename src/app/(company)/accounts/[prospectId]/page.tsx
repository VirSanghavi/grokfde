"use client";

import { MilestoneTrack } from "@/components/account/MilestoneTrack";
import { SlackThreadPanel } from "@/components/account/SlackThreadPanel";
import { TimelineFeed } from "@/components/account/TimelineFeed";
import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import {
  cn,
  errorMessage,
  fetchJson,
  formatRelativeTime,
  humanize,
  isAbortError,
} from "@/lib/utils";
import { agentDisplayName } from "@/lib/personas";
import type { Milestone, SlackMessage, SlackThread, TimelineItem } from "@/types/ui";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ── API shapes, matched to what the routes actually return ──────────────── */

interface SnapshotRow {
  id: string;
  [key: string]: unknown;
}

interface AccountSnapshot {
  id: string;
  prospectId: string;
  conversationId: string | null;
  workspaceId: string | null;
  stage: string;
  successOutcome: string | null;
  successCriteria: unknown;
  accountSummary?: { prospectCompany?: string; personName?: string; memorySummary?: string };
  technicalEnvironment?: { stack?: string[]; requirements?: string[]; facts?: string[] };
  quality?: Record<string, unknown>;
  slack?: {
    connected?: boolean;
    workspaceName?: string;
    channelName?: string;
    channelId?: string;
  };
  milestones: SnapshotRow[];
  blockers: SnapshotRow[];
  decisions: SnapshotRow[];
  commitments: SnapshotRow[];
  issues: SnapshotRow[];
  deployment: {
    environment?: string;
    version?: string | null;
    status?: string;
    checks?: unknown;
    updatedAt?: string;
  } | null;
  implementation: {
    runId?: string;
    status?: string;
    branchName?: string | null;
    pullRequest?: { url?: string; number?: number; title?: string; status?: string } | null;
    updatedAt?: string;
  } | null;
  updatedAt: string;
}

interface DeterministicStatus {
  milestone: string | null;
  nextAction: string;
  openIssueCount: number;
  blockers: string[];
}

interface AccountView {
  snapshot: AccountSnapshot;
  agentName: string;
  status: DeterministicStatus | null;
  timeline: TimelineItem[];
  threads: SlackThread[];
  /** Sections whose supplementary source failed, so each can say so itself. */
  degraded: { status: boolean; timeline: boolean; slack: boolean };
}

const str = (v: unknown, fallback = "") => (v == null ? fallback : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/** Only real numbers reach the screen. Nulls and fixtures are dropped. */
function realNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The database stores owners as `fde` / `customer` / `vendor` / `unknown`. */
function ownerLabel(raw: unknown, agentName: string): string {
  const owner = str(raw, "unknown").toLowerCase();
  if (owner === "fde" || owner === "atlas" || owner === "vendor") return agentName;
  if (owner === "customer") return "Customer";
  if (owner === "unknown" || !owner) return "Unassigned";
  return humanize(owner);
}

function milestoneStatus(raw: unknown): Milestone["status"] {
  const s = String(raw ?? "upcoming");
  return s === "completed" || s === "current" || s === "blocked" ? s : "upcoming";
}

/**
 * Slack history lives in the messages table, written by the same handler that
 * answers real Slack events. Threads are rebuilt from it by thread timestamp.
 */
function buildThreads(
  messages: Array<Record<string, unknown>>,
  channelName: string,
  agentName: string,
  customerName: string,
): SlackThread[] {
  const byThread = new Map<string, SlackMessage[]>();

  for (const m of messages) {
    if (str(m.channel) !== "slack") continue;
    const meta = (m.metadata ?? m.metadata_json ?? {}) as {
      slack?: { threadTs?: string; userName?: string; channelName?: string };
    };
    const isAgent = str(m.role) === "assistant";
    const key = str(meta.slack?.threadTs) || str(m.id);
    const message: SlackMessage = {
      id: str(m.id),
      author: isAgent ? agentName : str(meta.slack?.userName) || customerName,
      authorRole: isAgent ? "agent" : "customer",
      text: str(m.content).replace(/@atlas\s*/i, "").trim(),
      createdAt: str(m.createdAt ?? m.created_at, new Date().toISOString()),
    };
    if (!message.text) continue;
    byThread.set(key, [...(byThread.get(key) ?? []), message]);
  }

  return [...byThread.entries()]
    .map(([id, msgs]) => {
      const ordered = [...msgs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return {
        id,
        channelName,
        root: ordered[0],
        replies: ordered.slice(1),
      } satisfies SlackThread;
    })
    .sort(
      (a, b) =>
        new Date(b.replies.at(-1)?.createdAt ?? b.root.createdAt).getTime() -
        new Date(a.replies.at(-1)?.createdAt ?? a.root.createdAt).getTime(),
    );
}

/**
 * The timeline route returns two views of every Slack exchange: a truncated
 * `account_timeline_events` row (written as "Slack: …" inbound and
 * "<agent name>: …" outbound) and the message row it came from. Keep the message
 * rows, which hold the full text and the thread id, and drop the truncated
 * duplicates. The agent half of the prefix is built from this company's own
 * engineer, with the legacy default kept so older rows still match.
 */
function slackEcho(agentName: string): RegExp {
  const escaped = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(Slack|${escaped}|Atlas): `);
}

function buildTimeline(
  events: Array<Record<string, unknown>>,
  threadIds: Set<string>,
  agentName: string,
  customerName: string,
): TimelineItem[] {
  const items: TimelineItem[] = [];

  const echo = slackEcho(agentName);

  for (const e of events) {
    const type = str(e.type, "event");
    const summary = str(e.summary);
    if (type === "slack" && echo.test(summary)) continue;

    const meta = (e.metadata ?? {}) as {
      slack?: { threadTs?: string; userName?: string };
      threadTs?: string;
    };
    const threadTs = str(meta.slack?.threadTs) || str(meta.threadTs) || str(e.id);

    const roleMatch = /^(user|assistant|system): ([\s\S]*)$/.exec(summary);
    let title: string | undefined;
    let body = summary;
    if (roleMatch) {
      const [, role, content] = roleMatch;
      const who =
        role === "assistant"
          ? agentName
          : role === "system"
            ? "System"
            : str(meta.slack?.userName) || customerName;
      title = `${who} on ${type === "slack" ? "Slack" : type}`;
      body = content.trim();
    }

    items.push({
      id: str(e.id),
      type,
      title,
      summary: body,
      createdAt: str(e.timestamp, new Date().toISOString()),
      threadId: threadIds.has(threadTs) ? threadTs : undefined,
    });
  }

  return items.filter((i) => i.id && (i.summary || i.title));
}

async function loadAccount(prospectId: string, signal: AbortSignal): Promise<AccountView> {
  const found = await fetchJson<{ accounts?: Array<{ id: string }> }>(
    `/api/accounts?prospectId=${encodeURIComponent(prospectId)}`,
    { signal },
  );

  let snapshot: AccountSnapshot;
  const existingId = found.accounts?.[0]?.id;
  if (existingId) {
    const res = await fetchJson<{ account: AccountSnapshot }>(
      `/api/accounts/${existingId}`,
      { signal },
    );
    snapshot = res.account;
  } else {
    const res = await fetchJson<{ account: AccountSnapshot }>("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ prospectId }),
      signal,
    });
    snapshot = res.account;
  }

  const degraded = { status: false, timeline: false, slack: false };
  const bail = (err: unknown) => {
    if (isAbortError(err)) throw err;
    return null;
  };

  const [statusRes, timelineRes, conversationRes] = await Promise.all([
    fetchJson<{ status: DeterministicStatus }>(`/api/accounts/${snapshot.id}/status`, {
      signal,
    }).catch(bail),
    fetchJson<{ events: Array<Record<string, unknown>> }>(
      `/api/accounts/${snapshot.id}/timeline`,
      { signal },
    ).catch(bail),
    snapshot.conversationId
      ? fetchJson<{
          company?: {
            slug?: string;
            agentName?: string;
            agentVoice?: string;
            agentPersona?: string;
          };
          messages?: Array<Record<string, unknown>>;
        }>(`/api/conversations/${snapshot.conversationId}`, { signal }).catch(bail)
      : Promise.resolve(null),
  ]);

  degraded.status = statusRes === null;
  degraded.timeline = timelineRes === null;
  degraded.slack = Boolean(snapshot.conversationId) && conversationRes === null;

  const agentName = agentDisplayName({
    slug: conversationRes?.company?.slug ?? null,
    agent_name: conversationRes?.company?.agentName ?? null,
    agent_voice: conversationRes?.company?.agentVoice ?? null,
    agent_persona: conversationRes?.company?.agentPersona ?? null,
  });
  const customerName = snapshot.accountSummary?.personName || "Customer";
  const channelName = snapshot.slack?.channelName || "shared channel";

  const threads = buildThreads(
    conversationRes?.messages ?? [],
    channelName,
    agentName,
    customerName,
  );
  const threadIds = new Set(threads.map((t) => t.id));

  return {
    snapshot,
    agentName,
    status: statusRes?.status ?? null,
    timeline: buildTimeline(timelineRes?.events ?? [], threadIds, agentName, customerName),
    threads,
    degraded,
  };
}

/* ── Small building blocks ───────────────────────────────────────────────── */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 py-3">
      <dt className="text-label">{label}</dt>
      <dd className="mt-1 text-body break-words text-ink">{value}</dd>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-6">
      <h3 className="text-title text-ink">{title}</h3>
      {note ? <p className="mt-1 max-w-[64ch] text-caption">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item, i) => (
        <li
          key={item}
          className="flex items-center gap-3 font-mono text-[0.75rem] text-ink-2"
        >
          {i > 0 && (
            <span aria-hidden className="text-ink-4">
              /
            </span>
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StateTag({
  tone,
  children,
}: {
  tone: "positive" | "caution" | "critical" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[0.75rem] tracking-[0.02em] whitespace-nowrap",
        tone === "positive" && "text-positive",
        tone === "caution" && "text-caution",
        tone === "critical" && "text-critical",
        tone === "neutral" && "text-ink-3",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "positive" && "bg-positive",
          tone === "caution" && "bg-caution",
          tone === "critical" && "bg-critical",
          tone === "neutral" && "bg-ink-4",
        )}
      />
      {children}
    </span>
  );
}

function AccountSkeleton() {
  return (
    <div className="w-full px-5 py-6 sm:px-8 lg:px-12" aria-hidden>
      <div className="grid grid-cols-2 gap-x-6 border-y border-rule py-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="py-3">
            <div className="skeleton h-2.5 w-16" />
            <div className="skeleton mt-2 h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-8 space-y-3">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-3 w-full max-w-[52ch]" />
        <div className="skeleton h-3 w-full max-w-[44ch]" />
      </div>
      <div className="mt-8 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </div>
  );
}

function PageMessage({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
      <div className="max-w-[52ch]">
        <h2 className="text-display-m text-ink">{title}</h2>
        <p className="mt-3 text-body-l text-ink-2">{body}</p>
        {children ? <div className="mt-6 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

type Tab = "overview" | "timeline" | "slack" | "delivery";

export default function AccountRoomPage() {
  const params = useParams<{ prospectId: string }>();
  const prospectId = params.prospectId;
  const { push } = useToast();

  const [view, setView] = useState<AccountView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<Tab>("overview");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    if (!prospectId) return;
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    loadAccount(prospectId, controller.signal)
      .then((next) => {
        if (!active) return;
        setView(next);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setView(null);
        setError(errorMessage(err, "This account room could not be opened."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [prospectId, reloadKey]);

  const openThread = useCallback((id: string) => {
    setThreadId(id);
    setTab("slack");
  }, []);

  const snapshot = view?.snapshot;
  const accountId = snapshot?.id;

  const openBlockers = useMemo(
    () => (snapshot?.blockers ?? []).filter((b) => str(b.status, "open") !== "resolved"),
    [snapshot],
  );
  const openIssues = useMemo(
    () => (snapshot?.issues ?? []).filter((i) => str(i.status) !== "resolved"),
    [snapshot],
  );

  async function resolveBlocker(blockerId: string, title: string) {
    if (!accountId) return;
    setResolving(blockerId);
    try {
      await fetchJson(`/api/accounts/${accountId}/blockers`, {
        method: "PATCH",
        body: JSON.stringify({ blockerId, resolve: true }),
      });
      push(`Resolved: ${title}`, "success");
      reload();
    } catch (err) {
      push(errorMessage(err, "The blocker could not be resolved."), "error");
    } finally {
      setResolving(null);
    }
  }

  async function postToChannel(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!accountId || !text) return;
    setPosting(true);
    setPostError(null);
    try {
      await fetchJson(`/api/demo/slack-message`, {
        method: "POST",
        body: JSON.stringify({
          accountId,
          user: snapshot?.accountSummary?.personName || "Customer",
          text,
        }),
      });
      setDraft("");
      push("Posted to the channel", "success");
      reload();
    } catch (err) {
      setPostError(
        errorMessage(err, "The message could not be posted to the channel."),
      );
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopNav title="Account room" subtitle="Loading the account" />
        <AccountSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <TopNav title="Account room" />
        <PageMessage title="We could not open this account room." body={error}>
          <Button onClick={reload}>Try again</Button>
          <Link href="/dashboard">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </PageMessage>
      </>
    );
  }

  if (!view || !snapshot) {
    return (
      <>
        <TopNav title="Account room" />
        <PageMessage
          title="There is no account room here."
          body="An account room is created the first time a prospect moves past a conversation. Open the prospect's conversation to start one."
        >
          <Link href="/conversations">
            <Button>Open the inbox</Button>
          </Link>
        </PageMessage>
      </>
    );
  }

  const { agentName, status, timeline, threads, degraded } = view;
  const name = snapshot.accountSummary?.prospectCompany || "Account";
  const stack = list(snapshot.technicalEnvironment?.stack);
  const criteria = list(snapshot.successCriteria);
  const slackConnected = Boolean(snapshot.slack?.connected);
  const channelName = (snapshot.slack?.channelName || "").replace(/^#/, "");
  const selectedThread = threads.find((t) => t.id === threadId) ?? null;

  const milestones: Milestone[] = (snapshot.milestones ?? []).map((m) => ({
    id: str(m.id),
    label: str(m.label),
    status: milestoneStatus(m.status),
  }));

  const quality = snapshot.quality ?? {};
  const qualityMetrics = [
    ["Scenario pass rate", realNumber(quality.scenarioPassRate)],
    ["Policy adherence", realNumber(quality.policyAdherence)],
    ["Tool correctness", realNumber(quality.toolCorrectness)],
    ["Escalation accuracy", realNumber(quality.escalationAccuracy)],
  ].filter((entry): entry is [string, number] => entry[1] !== null);

  const deployment = snapshot.deployment;
  const deploymentChecks = (Array.isArray(deployment?.checks) ? deployment.checks : []).filter(
    (c): c is { label: string; status: string } =>
      Boolean(c && typeof c === "object" && "label" in c),
  );
  const implementation = snapshot.implementation;
  const pr = implementation?.pullRequest;

  return (
    <>
      <TopNav
        title={name}
        subtitle={`Account room · ${humanize(snapshot.stage)} · ${agentName} is the assigned FDE`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {snapshot.conversationId && (
              <Link href={`/conversations/${snapshot.conversationId}`}>
                <Button size="md" variant="ghost">
                  Conversation
                </Button>
              </Link>
            )}
            {snapshot.conversationId && (
              <Link href={`/conversations/${snapshot.conversationId}/workspace`}>
                <Button size="md" variant="secondary">
                  Implementation
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="w-full px-5 py-6 sm:px-8 lg:px-12">
          {/* Status strip: the five facts an FDE checks first. */}
          <dl className="grid grid-cols-1 gap-x-8 border-y border-rule divide-y divide-rule sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            <Field label="Stage" value={humanize(snapshot.stage)} />
            <Field
              label="Current milestone"
              value={status?.milestone || "Not set"}
            />
            <Field
              label="Open blockers"
              value={
                openBlockers.length === 0
                  ? "None"
                  : `${openBlockers.length} ${openBlockers.length === 1 ? "blocker" : "blockers"}`
              }
            />
            <Field label="Last activity" value={formatRelativeTime(snapshot.updatedAt)} />
          </dl>

          {status?.nextAction && (
            <p className="mt-4 max-w-[64ch] text-body-l text-ink">
              <span className="text-ink-3">Next: </span>
              {status.nextAction}
            </p>
          )}
          {degraded.status && (
            <p className="mt-2 max-w-[64ch] text-caption">
              The computed next action is unavailable right now. Everything below is loaded
              from the account record.
            </p>
          )}

          <div className="mt-6">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: "overview", label: "Overview" },
                { value: "timeline", label: "Timeline" },
                { value: "slack", label: "Slack" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
          </div>

          {/* ── Overview ─────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="mt-8 space-y-8 pb-16">
              {openBlockers.length > 0 && (
                <section>
                  <h3 className="text-title text-ink">
                    {openBlockers.length === 1 ? "Open blocker" : "Open blockers"}
                  </h3>
                  <ul className="mt-4 divide-y divide-rule border-t border-rule">
                    {openBlockers.map((b) => {
                      const id = str(b.id);
                      const title = str(b.title, "Untitled blocker");
                      return (
                        <li
                          key={id}
                          className="flex flex-wrap items-start justify-between gap-4 py-4"
                        >
                          <div className="min-w-0 flex-1 basis-[18rem]">
                            <div className="flex flex-wrap items-center gap-2">
                              <StateTag tone="critical">Blocked</StateTag>
                              <span className="mono-ts">
                                {ownerLabel(b.owner_type, agentName)} owns this
                              </span>
                            </div>
                            <p className="mt-2 text-body font-medium text-ink">{title}</p>
                            {str(b.description) && (
                              <p className="mt-1 max-w-[64ch] text-caption">
                                {str(b.description)}
                              </p>
                            )}
                            {str(b.impact) && (
                              <p className="mt-1 max-w-[64ch] text-caption">
                                Impact: {str(b.impact)}
                              </p>
                            )}
                          </div>
                          <Button
                            size="md"
                            variant="secondary"
                            loading={resolving === id}
                            loadingLabel={`Resolving ${title}`}
                            onClick={() => resolveBlocker(id, title)}
                          >
                            Mark resolved
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {openIssues.length > 0 && (
                <Section title="Open issues">
                  <ul className="divide-y divide-rule border-t border-rule">
                    {openIssues.map((i) => (
                      <li key={str(i.id)} className="py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <StateTag
                            tone={str(i.status) === "fix_ready" ? "positive" : "caution"}
                          >
                            {humanize(str(i.status, "open"))}
                          </StateTag>
                          <span className="mono-ts">
                            {humanize(str(i.severity, "medium"))} severity ·{" "}
                            {humanize(str(i.source, "unknown source"))}
                          </span>
                        </div>
                        <p className="mt-2 text-body font-medium text-ink">
                          {str(i.title, "Untitled issue")}
                        </p>
                        {str(i.root_cause) && (
                          <p className="mt-1 max-w-[64ch] text-caption">
                            Root cause: {str(i.root_cause)}
                          </p>
                        )}
                        {str(i.resolution) && (
                          <p className="mt-1 max-w-[64ch] text-caption">
                            {str(i.resolution)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section
                title="What success looks like"
                note={`Agreed with the customer and used by ${agentName} to decide what to do next.`}
              >
                {snapshot.successOutcome ? (
                  <p className="max-w-[64ch] text-body-l text-ink">
                    {snapshot.successOutcome}
                  </p>
                ) : (
                  <p className="max-w-[52ch] text-body text-ink-2">
                    No outcome recorded yet. It is captured from the conversation as soon as
                    the customer states what a successful rollout means for them.
                  </p>
                )}
                {criteria.length > 0 && (
                  <ul className="mt-4 divide-y divide-rule border-t border-rule">
                    {criteria.map((c) => (
                      <li key={c} className="py-2.5 text-body text-ink-2">
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <div className="grid gap-8 lg:grid-cols-2">
                <Section title="Delivery track">
                  <MilestoneTrack milestones={milestones} agentName={agentName} />
                </Section>

                <div className="space-y-8">
                  <Section
                    title="Decisions"
                    note="Captured from calls and the shared channel so nothing is re-litigated."
                  >
                    {snapshot.decisions.length === 0 ? (
                      <p className="max-w-[48ch] text-body text-ink-2">
                        No decisions recorded yet. {agentName} writes one down whenever
                        the customer settles a technical question.
                      </p>
                    ) : (
                      <ul className="divide-y divide-rule border-t border-rule">
                        {snapshot.decisions.map((d) => (
                          <li key={str(d.id)} className="py-3">
                            <p className="text-caption">{str(d.title)}</p>
                            <p className="mt-0.5 text-body text-ink">{str(d.decision)}</p>
                            {str(d.rationale) && (
                              <p className="mt-0.5 max-w-[56ch] text-caption">
                                {str(d.rationale)}
                              </p>
                            )}
                            <p className="mono-ts mt-1">
                              {humanize(str(d.source, "unknown"))} ·{" "}
                              {formatRelativeTime(str(d.created_at))}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title="Commitments">
                    {snapshot.commitments.length === 0 ? (
                      <p className="max-w-[48ch] text-body text-ink-2">
                        Nothing outstanding. Commitments appear here when either side agrees
                        to do something.
                      </p>
                    ) : (
                      <ul className="divide-y divide-rule border-t border-rule">
                        {snapshot.commitments.map((c) => {
                          const done = str(c.status) === "done";
                          return (
                            <li
                              key={str(c.id)}
                              className="flex items-start justify-between gap-3 py-3"
                            >
                              <div className="min-w-0">
                                <p className="mono-ts">{ownerLabel(c.owner, agentName)}</p>
                                <p className="mt-0.5 text-body text-ink-2">
                                  {str(c.description)}
                                </p>
                              </div>
                              <StateTag tone={done ? "positive" : "neutral"}>
                                {done ? "Done" : "Open"}
                              </StateTag>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Section>
                </div>
              </div>

              {stack.length > 0 && (
                <Section title="Customer stack">
                  <Chips items={stack} />
                </Section>
              )}
            </div>
          )}

          {/* ── Timeline ─────────────────────────────────────────────── */}
          {tab === "timeline" && (
            <div className="mt-8 pb-16">
              {degraded.timeline ? (
                <div className="max-w-[52ch]">
                  <h3 className="text-title text-ink">The timeline did not load</h3>
                  <p className="mt-2 text-body text-ink-2">
                    Everything else on this page loaded. The account history is fetched
                    separately and that request failed.
                  </p>
                  <div className="mt-4">
                    <Button onClick={reload}>Try again</Button>
                  </div>
                </div>
              ) : (
                <TimelineFeed items={timeline} onOpenThread={openThread} />
              )}
            </div>
          )}

          {/* ── Slack ────────────────────────────────────────────────── */}
          {tab === "slack" && (
            <div
              className={cn(
                "mt-8 grid gap-8 pb-16",
                selectedThread && "lg:grid-cols-[1fr_340px]",
              )}
            >
              <div className="min-w-0">
                {!slackConnected ? (
                  <div className="max-w-[52ch]">
                    <h3 className="text-title text-ink">No shared channel yet</h3>
                    <p className="mt-2 text-body text-ink-2">
                      {agentName} works the account from a Slack channel shared with the
                      customer: it answers there, records decisions, and opens blockers.
                      Connect a channel from the customer&rsquo;s workspace to switch it on.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StateTag tone="positive">Connected</StateTag>
                      <span className="font-mono text-body text-ink">#{channelName}</span>
                      <span className="mono-ts">
                        {snapshot.slack?.workspaceName || "Customer workspace"}
                      </span>
                    </div>

                    <form onSubmit={postToChannel} className="mt-5">
                      <label
                        htmlFor="slack-draft"
                        className="text-body font-medium text-ink"
                      >
                        Post to #{channelName} as the customer
                      </label>
                      <p className="mt-1 max-w-[56ch] text-caption">
                        Runs the same handler as a real Slack event. {agentName} reads it,
                        replies in the channel, and updates this account.
                      </p>
                      <textarea
                        id="slack-draft"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        placeholder={`@${agentName} `}
                        className="transition-premium mt-2 w-full rounded-[var(--radius-sm)] border border-rule-strong bg-surface px-3 py-2.5 text-body text-ink placeholder:text-ink-4 hover:border-ink-3"
                      />
                      <div className="mt-2 min-h-[1.25rem]">
                        {postError ? (
                          <p className="text-caption text-critical">{postError}</p>
                        ) : null}
                      </div>
                      <Button
                        type="submit"
                        size="md"
                        loading={posting}
                        loadingLabel={`Waiting for ${agentName} to reply`}
                        disabled={!draft.trim()}
                      >
                        Send to channel
                      </Button>
                    </form>

                    <div className="mt-8">
                      <h3 className="text-title text-ink">Threads</h3>
                      {degraded.slack ? (
                        <p className="mt-2 max-w-[52ch] text-body text-ink-2">
                          The channel history could not be read. It is stored with the
                          conversation and that request failed.
                        </p>
                      ) : threads.length === 0 ? (
                        <p className="mt-2 max-w-[52ch] text-body text-ink-2">
                          Nothing has been posted in this channel yet. Send a message above
                          and it will appear here with {agentName}&rsquo;s reply.
                        </p>
                      ) : (
                        <ul className="mt-4 divide-y divide-rule border-t border-rule">
                          {threads.map((t) => {
                            const latest = t.replies.at(-1) ?? t.root;
                            const active = t.id === threadId;
                            return (
                              <li key={t.id}>
                                <button
                                  type="button"
                                  onClick={() => setThreadId(t.id)}
                                  aria-pressed={active}
                                  className={cn(
                                    "transition-premium block w-full py-3.5 text-left hover:bg-hover active:scale-[0.995]",
                                    active && "bg-hover",
                                  )}
                                >
                                  <div className="flex flex-wrap items-baseline gap-2">
                                    <span className="text-body font-medium text-ink">
                                      {t.root.author}
                                    </span>
                                    <span className="mono-ts">
                                      {t.replies.length + 1}{" "}
                                      {t.replies.length === 0 ? "message" : "messages"} ·{" "}
                                      {formatRelativeTime(latest.createdAt)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 max-w-[64ch] text-caption">
                                    {t.root.text}
                                  </p>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </div>

              {selectedThread && (
                <div className="max-h-[70dvh] min-h-[320px] overflow-hidden rounded-[var(--radius-lg)] border border-rule lg:sticky lg:top-6 lg:max-h-[calc(100dvh-9rem)]">
                  <SlackThreadPanel
                    thread={selectedThread}
                    agentName={agentName}
                    onClose={() => setThreadId(null)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Delivery ─────────────────────────────────────────────── */}
          {tab === "delivery" && (
            <div className="mt-8 space-y-8 pb-16">
              <section>
                <h3 className="text-title text-ink">Deployment</h3>
                {!deployment ? (
                  <p className="mt-2 max-w-[52ch] text-body text-ink-2">
                    Nothing is deployed yet. A deployment record appears once an
                    implementation reaches an environment.
                  </p>
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <StateTag
                        tone={
                          str(deployment.status) === "production"
                            ? "positive"
                            : str(deployment.status).includes("fail")
                              ? "critical"
                              : "caution"
                        }
                      >
                        {humanize(str(deployment.status, "not started"))}
                      </StateTag>
                      <span className="mono-ts">
                        {humanize(str(deployment.environment, "unknown environment"))}
                        {deployment.version ? ` · ${deployment.version}` : ""}
                        {deployment.updatedAt
                          ? ` · ${formatRelativeTime(str(deployment.updatedAt))}`
                          : ""}
                      </span>
                    </div>
                    {deploymentChecks.length > 0 && (
                      <ul className="mt-4 divide-y divide-rule border-t border-rule">
                        {deploymentChecks.map((c) => (
                          <li
                            key={c.label}
                            className="flex items-center justify-between gap-3 py-2.5"
                          >
                            <span className="text-body text-ink-2">{c.label}</span>
                            <StateTag
                              tone={
                                c.status === "passed"
                                  ? "positive"
                                  : c.status === "failed"
                                    ? "critical"
                                    : "neutral"
                              }
                            >
                              {humanize(c.status)}
                            </StateTag>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>

              <Section title="Implementation">
                {!implementation ? (
                  <div className="max-w-[52ch]">
                    <p className="text-body text-ink-2">
                      No implementation run yet. {agentName} connects the customer
                      repository, plans the change, and opens a pull request for review.
                    </p>
                    {snapshot.conversationId && (
                      <div className="mt-4">
                        <Link href={`/conversations/${snapshot.conversationId}/workspace`}>
                          <Button size="md">Open the workspace</Button>
                        </Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <StateTag
                        tone={
                          str(implementation.status) === "failed"
                            ? "critical"
                            : str(implementation.status) === "ready_for_review"
                              ? "positive"
                              : "caution"
                        }
                      >
                        {humanize(str(implementation.status, "queued"))}
                      </StateTag>
                      {implementation.branchName && (
                        <span className="mono-ts">{implementation.branchName}</span>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {snapshot.conversationId && (
                        <Link href={`/conversations/${snapshot.conversationId}/workspace`}>
                          <Button size="md" variant="secondary">
                            Open the workspace
                          </Button>
                        </Link>
                      )}
                      {pr?.url && (
                        <a href={pr.url} target="_blank" rel="noreferrer">
                          <Button size="md">
                            {pr.number ? `Review pull request #${pr.number}` : "Review pull request"}
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Quality">
                {qualityMetrics.length === 0 ? (
                  <p className="max-w-[56ch] text-body text-ink-2">
                    No quality numbers yet. These populate from real eval and test runs, so
                    nothing is shown until there is something measured to show.
                  </p>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-8 border-y border-rule sm:grid-cols-4">
                    {qualityMetrics.map(([label, value]) => (
                      <div key={label} className="py-3">
                        <dt className="text-label">{label}</dt>
                        <dd className="tabular mt-1 font-mono text-body text-ink">
                          {value}%
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
