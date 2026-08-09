"use client";

import {
  loadControlRoom,
  type BookingRow,
  type ControlRoomData,
  type DeskEntry,
} from "@/components/ops/control-room";
import {
  Eyebrow,
  FactList,
  FactRow,
  Note,
  RowList,
  Section,
  StateMark,
  type Tone,
} from "@/components/ops/primitives";
import { useActiveCompany } from "@/components/layout/WorkspaceContext";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { IconCheck, IconCopy, IconExternalLink } from "@/components/icons";
import {
  cn,
  errorMessage,
  formatRelativeTime,
  formatTime,
  humanize,
  isAbortError,
} from "@/lib/utils";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ── Page frame ──────────────────────────────────────────────────────────── */

/** Full width on a laptop. 20 / 32 / 48 side padding, never a centred column. */
const FRAME = "w-full px-5 sm:px-8 lg:px-12";

function firstSentence(text: string, max = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const cut = clean.slice(0, max);
  const stop = cut.search(/[.!?](\s|$)/);
  if (stop > 40) return cut.slice(0, stop + 1);
  return clean.length > max ? `${cut.trimEnd()}…` : clean;
}

/* ── The thing at the top: who this agent is and whether it can work ─────── */

function AgentBanner({
  agentName,
  companyName,
  whatWeSell,
  slug,
  readiness,
  lastMessageAt,
}: {
  agentName: string;
  companyName: string;
  whatWeSell?: string;
  slug: string;
  readiness: { tone: Tone; label: string; detail: string };
  lastMessageAt: string | null;
}) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);
  const prospectPath = `/fde/${slug}`;

  const copyLink = useCallback(async () => {
    const url =
      typeof window === "undefined"
        ? prospectPath
        : `${window.location.origin}${prospectPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      push("Prospect link copied", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      push("Your browser blocked the clipboard. The link is on the agent page.", "error");
    }
  }, [prospectPath, push]);

  return (
    <header className={cn(FRAME, "pt-8 pb-7 sm:pt-10")}>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <Eyebrow>{companyName}</Eyebrow>
          <h1 className="text-display-l mt-2 text-ink">{agentName}</h1>
          <p className="mt-3 max-w-[62ch] text-body-l text-ink-2">
            Your forward-deployed engineer.{" "}
            {whatWeSell
              ? `${agentName} has been taught that ${firstSentence(whatWeSell, 180)}`
              : `${agentName} answers your prospects in chat, on a call, and over email, using only what you have taught it.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <StateMark tone={readiness.tone}>{readiness.label}</StateMark>
            <span className="text-caption">{readiness.detail}</span>
            {lastMessageAt ? (
              <span className="mono-ts tabular">
                Last message {formatRelativeTime(lastMessageAt)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={copyLink}
            leftIcon={
              copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />
            }
          >
            {copied ? "Copied" : "Copy prospect link"}
          </Button>
          <Link href={prospectPath}>
            <Button rightIcon={<IconExternalLink className="h-4 w-4" />}>
              Talk to {agentName}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ── First run: a real path, not a grid of zeroes ────────────────────────── */

interface SetupStep {
  title: string;
  body: string;
  done: boolean;
  optional?: boolean;
  action: { label: string; href: string } | null;
}

function SetupPath({
  agentName,
  companyName,
  steps,
}: {
  agentName: string;
  companyName: string;
  steps: SetupStep[];
}) {
  const remaining = steps.filter((s) => !s.done && !s.optional).length;

  return (
    <Section
      title={`Get ${agentName} in front of someone`}
      note={
        remaining === 0
          ? `${agentName} is set up and waiting. The moment a prospect opens your link, this page becomes the desk you work from.`
          : `Nobody has talked to ${agentName} yet, so there is nothing to report here. These are the steps that change that.`
      }
    >
      <ol className="divide-y divide-rule border-y border-rule">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 py-5"
          >
            <div className="flex min-w-0 flex-1 basis-[22rem] gap-4">
              <span
                aria-hidden
                className={cn(
                  "tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border font-mono text-[0.75rem]",
                  step.done
                    ? "border-positive-rule bg-positive-soft text-positive"
                    : "border-rule-strong bg-surface text-ink-3",
                )}
              >
                {step.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-body font-medium text-ink">
                  {step.title}
                  {step.optional ? (
                    <span className="ml-2 font-mono text-[0.75rem] text-ink-4">optional</span>
                  ) : null}
                </p>
                <p className="mt-1 max-w-[64ch] text-caption">{step.body}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <StateMark tone={step.done ? "positive" : "neutral"}>
                {step.done ? "Done" : "To do"}
              </StateMark>
              {step.action ? (
                <Link href={step.action.href}>
                  <Button size="sm" variant={step.done ? "ghost" : "secondary"}>
                    {step.action.label}
                  </Button>
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-5 max-w-[64ch] text-caption">
        Everything on this page is read from {companyName}&rsquo;s own records. Nothing is
        shown until there is something real to show.
      </p>
    </Section>
  );
}

/* ── Needs you: the only queue a human has to work ───────────────────────── */

interface NeedsItem {
  id: string;
  tone: Tone;
  state: string;
  title: string;
  detail: string;
  meta: string;
  action: { label: string; href: string } | null;
}

function bookingWhen(booking: BookingRow): string {
  return `${formatTime(booking.startsAt)} · ${booking.durationMinutes} min`;
}

function buildNeedsYou(data: ControlRoomData, agentName: string): NeedsItem[] {
  const items: NeedsItem[] = [];

  for (const e of data.escalations) {
    items.push({
      id: `escalation-${e.id}`,
      tone: "critical",
      state: `${humanize(e.priority)} priority`,
      title: e.question || `${agentName} needs a human answer`,
      detail: e.reason || `${agentName} stopped rather than guess.`,
      meta: `${e.prospectName} · raised ${formatRelativeTime(e.createdAt)}`,
      action: e.conversationId
        ? { label: "Open conversation", href: `/conversations/${e.conversationId}` }
        : null,
    });
  }

  for (const b of data.bookings.filter((b) => b.canJoin)) {
    items.push({
      id: `booking-live-${b.id}`,
      tone: "live",
      state: "Starting now",
      title: `${b.guestName}${b.guestCompany ? ` from ${b.guestCompany}` : ""} is on a demo`,
      detail: b.notes || `${agentName} takes the call. You can join and take over.`,
      meta: bookingWhen(b),
      action: b.joinUrl ? { label: "Join the call", href: b.joinUrl } : null,
    });
  }

  for (const entry of data.desk) {
    const questions = entry.detail?.unresolvedQuestions ?? [];
    if (questions.length === 0) continue;
    items.push({
      id: `questions-${entry.conversationId}`,
      tone: "caution",
      state: `${questions.length} open ${questions.length === 1 ? "question" : "questions"}`,
      title: questions[0]!,
      detail:
        questions.length > 1
          ? questions.slice(1, 3).join(" · ")
          : `${agentName} could not close this out of what it knows.`,
      meta: `${entry.name} · last active ${formatRelativeTime(entry.updatedAt)}`,
      action: {
        label: "Open conversation",
        href: `/conversations/${entry.conversationId}`,
      },
    });
  }

  for (const b of data.bookings.filter((b) => !b.canJoin)) {
    items.push({
      id: `booking-${b.id}`,
      tone: "neutral",
      state: "Booked",
      title: `Demo with ${b.guestName}${b.guestCompany ? ` from ${b.guestCompany}` : ""}`,
      detail: b.notes || b.joinMessage || `${agentName} runs this one.`,
      meta: bookingWhen(b),
      action: b.conversationId
        ? { label: "Open conversation", href: `/conversations/${b.conversationId}` }
        : null,
    });
  }

  return items;
}

function NeedsYou({
  items,
  agentName,
  conversationCount,
  degraded,
}: {
  items: NeedsItem[];
  agentName: string;
  conversationCount: number;
  degraded: string[];
}) {
  return (
    <Section
      title="Needs you"
      note={`Only what a person has to decide. ${agentName} handles the rest on its own.`}
    >
      {items.length === 0 ? (
        <Note>
          Nothing needs you right now.{" "}
          {conversationCount > 0
            ? `${agentName} is holding ${conversationCount} ${
                conversationCount === 1 ? "conversation" : "conversations"
              } and will put anything it cannot answer here.`
            : `Anything ${agentName} cannot answer from your knowledge lands here instead of being guessed at.`}
        </Note>
      ) : (
        <RowList>
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 py-4"
            >
              <div className="min-w-0 flex-1 basis-[24rem]">
                <StateMark tone={item.tone}>{item.state}</StateMark>
                <p className="mt-1.5 max-w-[72ch] text-body font-medium text-ink">
                  {item.title}
                </p>
                <p className="mt-1 max-w-[72ch] text-caption">{item.detail}</p>
                <p className="mono-ts tabular mt-1.5">{item.meta}</p>
              </div>
              {item.action ? (
                <div className="shrink-0">
                  {item.action.href.startsWith("http") ? (
                    <a href={item.action.href} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="secondary">
                        {item.action.label}
                      </Button>
                    </a>
                  ) : (
                    <Link href={item.action.href}>
                      <Button size="sm" variant="secondary">
                        {item.action.label}
                      </Button>
                    </Link>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </RowList>
      )}

      {degraded.length > 0 && (
        <p className="mt-4 max-w-[64ch] text-caption">
          This queue is incomplete right now: {degraded.join(" and ")} could not be read.
          Everything else on this page loaded.
        </p>
      )}
    </Section>
  );
}

/* ── The desk: who the agent is talking to and what they wait on ────────── */

function DeskRow({ entry, agentName }: { entry: DeskEntry; agentName: string }) {
  const detail = entry.detail;
  const waiting =
    detail?.nextAction ||
    (detail?.lastMessage
      ? `${detail.lastMessage.role === "assistant" ? agentName : entry.name} said: ${firstSentence(
          detail.lastMessage.content,
          140,
        )}`
      : "No messages in this thread yet.");

  return (
    <li>
      <Link
        href={`/conversations/${entry.conversationId}`}
        className="transition-premium block py-4 hover:bg-hover active:scale-[0.997]"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-2">
          <div className="min-w-0 flex-1 basis-[26rem]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-body font-medium text-ink">{entry.name}</span>
              {entry.personName ? (
                <span className="text-caption">{entry.personName}</span>
              ) : null}
              <span className="mono-ts">{humanize(entry.stage)}</span>
            </div>
            <p className="mt-1.5 max-w-[80ch] text-caption">{waiting}</p>
            {detail && detail.stack.length > 0 ? (
              <div className="mt-2">
                <FactList items={detail.stack.slice(0, 5)} />
              </div>
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            <p className="mono-ts tabular">{formatRelativeTime(entry.updatedAt)}</p>
            {detail ? (
              <p className="mono-ts tabular mt-1">
                {detail.messageCount}{" "}
                {detail.messageCount === 1 ? "message" : "messages"}
                {detail.channels.length > 1 ? ` · ${detail.channels.join(", ")}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

function ControlRoomSkeleton() {
  return (
    <div className={cn(FRAME, "pt-10 pb-16")} aria-hidden>
      <div className="skeleton h-2.5 w-24" />
      <div className="skeleton mt-3 h-10 w-52" />
      <div className="skeleton mt-4 h-3.5 w-full max-w-[52ch]" />
      <div className="skeleton mt-2 h-3.5 w-full max-w-[38ch]" />

      <div className="mt-10 grid grid-cols-2 gap-x-8 border-y border-rule sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="py-3.5">
            <div className="skeleton h-2.5 w-20" />
            <div className="skeleton mt-2 h-6 w-12" />
          </div>
        ))}
      </div>

      <div className="mt-10 space-y-5">
        <div className="skeleton h-4 w-36" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 border-t border-rule pt-4">
            <div className="skeleton h-3.5" style={{ width: `${64 - i * 7}%` }} />
            <div className="skeleton h-3" style={{ width: `${46 - i * 5}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ControlRoomPage() {
  const company = useActiveCompany();
  const [data, setData] = useState<ControlRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    loadControlRoom(company, controller.signal)
      .then((next) => {
        if (active) setData(next);
      })
      .catch((err: unknown) => {
        // Aborts are expected on unmount and are never an error state.
        if (!active || isAbortError(err)) return;
        setData(null);
        setError(errorMessage(err, "We could not read your workspace."));
      })
      .finally(() => {
        // Loading terminates on every path, including failure.
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [company, reloadKey]);

  const needsYou = useMemo(
    () => (data ? buildNeedsYou(data, company.agentName) : []),
    [data, company.agentName],
  );

  if (loading) return <ControlRoomSkeleton />;

  if (error || !data) {
    return (
      <div className={cn(FRAME, "flex flex-1 items-center justify-center")}>
        <ErrorState
          title={`We could not open ${company.agentName}'s control room.`}
          message={error ?? "The workspace did not load."}
          onRetry={retry}
        />
      </div>
    );
  }

  const readySources = data.knowledge.filter((k) => k.status === "ready");
  const processingSources = data.knowledge.filter((k) => k.status === "processing");

  // A thread nobody has spoken in is not a conversation. It stays in the inbox,
  // it just does not belong on the desk.
  const liveThreads = data.desk.filter((entry) => (entry.detail?.messageCount ?? 0) > 0);
  const hasTalked = liveThreads.length > 0;
  const conversationCount = `${data.totalConversations}${
    data.conversationsTruncated ? "+" : ""
  }`;

  const readiness: { tone: Tone; label: string; detail: string } =
    readySources.length > 0
      ? {
          tone: "positive",
          label: "Ready to answer",
          detail: `${readySources.length} knowledge ${
            readySources.length === 1 ? "source" : "sources"
          }${data.toolCount > 0 ? `, ${data.toolCount} tools it can run` : ", no tools connected"}.`,
        }
      : processingSources.length > 0
        ? {
            tone: "caution",
            label: "Learning",
            detail: `${processingSources.length} ${
              processingSources.length === 1 ? "source is" : "sources are"
            } still being read.`,
          }
        : {
            tone: "critical",
            label: "Not ready",
            detail: `${company.agentName} has nothing to answer from until you add knowledge.`,
          };

  const openQuestions = data.desk.reduce(
    (n, entry) => n + (entry.detail?.unresolvedQuestions.length ?? 0),
    0,
  );

  const degradedQueue = [
    data.degraded.escalations ? "escalations" : null,
    data.degraded.bookings ? "booked demos" : null,
  ].filter((v): v is string => Boolean(v));

  const setupSteps: SetupStep[] = [
    {
      title: `Teach ${company.agentName} about ${company.name}`,
      body: `Paste your docs, upload a file, or point it at a URL. ${company.agentName} answers only from what you give it, and says so when it does not know.`,
      done: readySources.length > 0,
      action: { label: "Add knowledge", href: "/knowledge" },
    },
    {
      title: "Put the link in front of a prospect",
      body: `Anyone with this link gets ${company.agentName} in chat or on a live call, with your knowledge behind it. Their questions and stack land back here.`,
      done: hasTalked,
      action: { label: `Open /fde/${company.slug}`, href: `/fde/${company.slug}` },
    },
    {
      title: `Let people book time with ${company.agentName}`,
      body: `${company.agentName} is available around the clock, so the booking page offers real slots on any day rather than your calendar's leftovers.`,
      done: data.bookings.length > 0,
      action: { label: "Open the booking page", href: `/book/${company.slug}` },
    },
    {
      title: `Give ${company.agentName} tools it can run`,
      body: "Connect an MCP server and it can look things up in your systems during a conversation instead of describing them.",
      done: data.toolCount > 0,
      optional: true,
      action: { label: "Connect a server", href: "/agent" },
    },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <AgentBanner
        agentName={company.agentName}
        companyName={company.name}
        whatWeSell={company.whatWeSell}
        slug={company.slug}
        readiness={readiness}
        lastMessageAt={data.lastMessageAt}
      />

      <div className={cn(FRAME, "space-y-10 pb-20")}>
        {hasTalked ? (
          <>
            <FactRow
              facts={[
                {
                  label: "Needs you",
                  value: String(needsYou.length),
                  hint:
                    needsYou.length === 0
                      ? "Nothing waiting on a human"
                      : "Open the queue below",
                },
                {
                  label: "Conversations",
                  value: conversationCount,
                  hint: `${company.agentName} is holding these`,
                },
                {
                  label: "Open questions",
                  value: String(openQuestions),
                  hint:
                    openQuestions === 0
                      ? "Everything asked has been answered"
                      : `${company.agentName} could not close these`,
                },
                {
                  label: "Booked demos",
                  value: data.degraded.bookings ? "unavailable" : String(data.bookings.length),
                  hint: data.degraded.bookings
                    ? "The booking service did not answer"
                    : data.bookings.length === 0
                      ? "Nothing on the calendar"
                      : `Upcoming, ${company.agentName} takes the call`,
                },
              ]}
            />

            <NeedsYou
              items={needsYou}
              agentName={company.agentName}
              conversationCount={data.totalConversations}
              degraded={degradedQueue}
            />

            <Section
              title={`Who ${company.agentName} is talking to`}
              note="The most recent threads, with what each prospect is waiting on."
              action={
                data.totalConversations > liveThreads.length ? (
                  <Link href="/conversations">
                    <Button size="sm" variant="ghost">
                      Open the inbox
                    </Button>
                  </Link>
                ) : null
              }
            >
              <RowList>
                {liveThreads.slice(0, 6).map((entry) => (
                  <DeskRow
                    key={entry.conversationId}
                    entry={entry}
                    agentName={company.agentName}
                  />
                ))}
              </RowList>
              {data.degraded.deskDetail && (
                <p className="mt-4 max-w-[64ch] text-caption">
                  One or more threads could not be read in full, so they are left out rather
                  than shown half empty. The inbox has all of them.
                </p>
              )}
            </Section>
          </>
        ) : (
          <SetupPath
            agentName={company.agentName}
            companyName={company.name}
            steps={setupSteps}
          />
        )}

        <Section
          title={`What ${company.agentName} knows`}
          note={`Everything it can answer from. Nothing else. When a question falls outside this, it escalates instead of guessing.`}
          action={
            <Link href="/knowledge">
              <Button size="sm" variant="secondary">
                Manage knowledge
              </Button>
            </Link>
          }
        >
          {data.degraded.knowledge ? (
            <Note>
              Your knowledge sources could not be read just now. They are unchanged, this
              page simply could not fetch them.
            </Note>
          ) : data.knowledge.length === 0 ? (
            <Note>
              Nothing yet. {company.agentName} will say it does not know rather than invent
              an answer, so the first source you add is the one that makes it useful.
            </Note>
          ) : (
            <RowList>
              {data.knowledge.map((source) => (
                <li
                  key={source.id}
                  className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-3.5"
                >
                  <div className="min-w-0 flex-1 basis-[20rem]">
                    <p className="truncate text-body text-ink">{source.title}</p>
                    <p className="mono-ts tabular mt-1">
                      {source.type} · added {formatRelativeTime(source.createdAt)}
                    </p>
                  </div>
                  <StateMark
                    tone={
                      source.status === "ready"
                        ? "positive"
                        : source.status === "processing"
                          ? "caution"
                          : "critical"
                    }
                  >
                    {humanize(source.status)}
                  </StateMark>
                </li>
              ))}
            </RowList>
          )}
        </Section>

        {data.signals.length > 0 && (
          <Section
            title="What keeps coming up"
            note={`Questions and needs ${company.agentName} has seen across more than one prospect.`}
            action={
              <Link href="/field-signals">
                <Button size="sm" variant="ghost">
                  All signals
                </Button>
              </Link>
            }
          >
            <RowList>
              {data.signals.slice(0, 5).map((signal) => (
                <li key={signal.key} className="py-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-body text-ink">{signal.title}</span>
                    <span className="mono-ts tabular">
                      {signal.occurrenceCount}{" "}
                      {signal.occurrenceCount === 1 ? "mention" : "mentions"}
                    </span>
                  </div>
                  {signal.recommendation ? (
                    <p className="mt-1 max-w-[72ch] text-caption">{signal.recommendation}</p>
                  ) : null}
                </li>
              ))}
            </RowList>
          </Section>
        )}
      </div>
    </div>
  );
}
