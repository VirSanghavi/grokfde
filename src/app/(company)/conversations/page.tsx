"use client";

import { ConversationRow } from "@/components/company/ConversationRow";
import { ProspectMemoryPanel } from "@/components/company/ProspectMemoryPanel";
import { useActiveCompany } from "@/components/layout/WorkspaceContext";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { cn, errorMessage, fetchJson, isAbortError } from "@/lib/utils";
import type { Channel, Message, Prospect } from "@/types/ui";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ── Data ────────────────────────────────────────────────────────────────── */

interface ThreadSummary {
  id: string;
  prospectId: string;
  name: string;
  personName: string | null;
  stage: string;
  updatedAt: string;
}

interface ThreadDetail {
  prospect: Prospect;
  messages: Message[];
}

const str = (v: unknown, fallback = "") => (v == null ? fallback : String(v));

async function loadThreads(companyId: string, signal: AbortSignal): Promise<ThreadSummary[]> {
  const data = await fetchJson<{
    conversations?: Array<{
      id?: string;
      prospectId?: string;
      updatedAt?: string;
      prospect?: {
        id?: string;
        companyName?: string;
        personName?: string;
        stage?: string;
      } | null;
    }>;
  }>(`/api/conversations?companyId=${encodeURIComponent(companyId)}`, { signal });

  return (data.conversations ?? [])
    .filter((c) => c?.id)
    .map((c) => ({
      id: String(c.id),
      prospectId: str(c.prospect?.id ?? c.prospectId),
      name: str(c.prospect?.companyName, "Unnamed prospect"),
      personName: c.prospect?.personName ? String(c.prospect.personName) : null,
      stage: str(c.prospect?.stage, "new"),
      updatedAt: str(c.updatedAt, new Date().toISOString()),
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function loadThread(id: string, signal: AbortSignal): Promise<ThreadDetail> {
  const data = await fetchJson<{
    prospect?: Record<string, unknown> & { memory?: Partial<Prospect["memory"]> };
    messages?: Array<Record<string, unknown>>;
  }>(`/api/conversations/${id}`, { signal });

  const raw = data.prospect ?? {};
  const memory = (raw.memory ?? {}) as Partial<Prospect["memory"]>;

  const prospect: Prospect = {
    id: str(raw.id),
    companyId: str(raw.companyId),
    companyName: str(raw.companyName, "Unnamed prospect"),
    personName: raw.personName ? String(raw.personName) : undefined,
    email: raw.email ? String(raw.email) : undefined,
    memory: {
      stage: str(memory.stage, "discovery"),
      summary: str(memory.summary),
      currentStack: memory.currentStack ?? [],
      painPoints: memory.painPoints ?? [],
      requirements: memory.requirements ?? [],
      objections: memory.objections ?? [],
      nextAction: str(memory.nextAction),
    },
    createdAt: str(raw.createdAt, new Date().toISOString()),
    updatedAt: str(raw.updatedAt, new Date().toISOString()),
  };

  // One malformed row must never blank the whole transcript.
  const messages: Message[] = (Array.isArray(data.messages) ? data.messages : [])
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      id: str(m.id),
      conversationId: id,
      channel: (m.channel as Channel) || "chat",
      role: (m.role as Message["role"]) || "assistant",
      content: str(m.content),
      createdAt: str(m.createdAt ?? m.created_at, new Date().toISOString()),
      metadata: (m.metadata ?? m.metadata_json ?? undefined) as Message["metadata"],
    }))
    .filter((m) => m.id && m.content);

  return { prospect, messages };
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function ConversationsPage() {
  const company = useActiveCompany();
  const router = useRouter();

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listKey, setListKey] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailKey, setDetailKey] = useState(0);

  const [filter, setFilter] = useState("");

  const retryList = useCallback(() => setListKey((n) => n + 1), []);
  const retryDetail = useCallback(() => setDetailKey((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setListLoading(true);
    setListError(null);

    loadThreads(company.id, controller.signal)
      .then((next) => {
        if (!active) return;
        setThreads(next);
        setSelectedId((current) =>
          current && next.some((t) => t.id === current) ? current : (next[0]?.id ?? null),
        );
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setThreads([]);
        setListError(errorMessage(err, "The inbox could not be loaded."));
      })
      .finally(() => {
        if (active) setListLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [company.id, listKey]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setDetailLoading(true);
    setDetailError(null);

    loadThread(selectedId, controller.signal)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setDetail(null);
        setDetailError(errorMessage(err, "This conversation could not be read."));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedId, detailKey]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.personName ?? "").toLowerCase().includes(q) ||
        t.stage.toLowerCase().includes(q),
    );
  }, [threads, filter]);

  function openThread(id: string) {
    setSelectedId(id);
    // On a phone there is no second pane, so the row is a link to the thread.
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      router.push(`/conversations/${id}`);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Inbox rail */}
      <div className="flex w-full min-w-0 flex-col border-r border-rule bg-surface md:w-[21rem] lg:w-[23rem]">
        <div className="shrink-0 border-b border-rule px-5 py-4">
          <h1 className="text-title text-ink">Conversations</h1>
          <p className="mt-1 text-caption">
            Every thread {company.agentName} is holding, newest first.
          </p>
          {threads.length > 6 && (
            <div className="mt-3">
              <label htmlFor="thread-filter" className="sr-only">
                Filter conversations
              </label>
              <input
                id="thread-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by prospect or stage"
                className="transition-premium h-11 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 text-body text-ink placeholder:text-ink-4 hover:border-rule-strong"
              />
            </div>
          )}
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {listLoading ? (
            <LoadingState variant="list" rows={5} label="Loading conversations" />
          ) : listError ? (
            <ErrorState
              compact
              title="The inbox did not load"
              message={listError}
              onRetry={retryList}
            />
          ) : threads.length === 0 ? (
            <div className="px-5 py-10">
              <h2 className="text-title text-ink">No conversations yet</h2>
              <p className="mt-2 text-body text-ink-2">
                A thread appears here the first time someone opens your prospect link and
                talks to {company.agentName}.
              </p>
              <div className="mt-5">
                <Link href={`/fde/${company.slug}`}>
                  <Button size="sm">Open the prospect link</Button>
                </Link>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-5 py-10">
              <p className="text-body text-ink-2">
                No conversation matches &ldquo;{filter.trim()}&rdquo;.
              </p>
            </div>
          ) : (
            <ul>
              {visible.map((thread) => (
                <li key={thread.id}>
                  <ConversationRow
                    name={thread.name}
                    personName={thread.personName}
                    stage={thread.stage}
                    updatedAt={thread.updatedAt}
                    active={thread.id === selectedId}
                    onClick={() => openThread(thread.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Transcript, laptop and up */}
      <div className="hidden min-w-0 flex-1 md:flex">
        {detailLoading ? (
          <LoadingState variant="chat" rows={4} label="Loading the transcript" className="flex-1" />
        ) : detailError ? (
          <div className="flex flex-1 items-center justify-center">
            <ErrorState
              title="This conversation did not load"
              message={detailError}
              onRetry={retryDetail}
            />
          </div>
        ) : !detail ? (
          <div className="flex flex-1 items-center justify-center px-8">
            <div className="max-w-[46ch]">
              <h2 className="text-title text-ink">Pick a conversation</h2>
              <p className="mt-2 text-body text-ink-2">
                Each one is the whole relationship in one place: chat, email, calls, and the
                shared Slack channel, with what {company.agentName} remembers beside it.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface px-6 py-4">
                <div className="min-w-0">
                  <h2 className="text-title truncate text-ink">
                    {detail.prospect.companyName}
                  </h2>
                  <p className="mt-0.5 text-caption">
                    {detail.prospect.personName ?? "No named contact yet"} ·{" "}
                    {detail.messages.length}{" "}
                    {detail.messages.length === 1 ? "message" : "messages"}
                  </p>
                </div>
                <Link href={`/conversations/${selectedId}`}>
                  <Button size="sm" variant="secondary">
                    Open full thread
                  </Button>
                </Link>
              </div>

              <div
                className={cn(
                  "scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6",
                  detail.messages.length > 0 && "space-y-6",
                )}
              >
                {detail.messages.length === 0 ? (
                  <div className="max-w-[52ch]">
                    <h3 className="text-title text-ink">Nothing has been said yet</h3>
                    <p className="mt-2 text-body text-ink-2">
                      This thread exists but is empty. It fills in the moment{" "}
                      {detail.prospect.companyName} writes to {company.agentName}.
                    </p>
                  </div>
                ) : (
                  detail.messages.map((m) => (
                    <MessageBubble key={m.id} message={m} agentName={company.agentName} />
                  ))
                )}
              </div>
            </div>

            <aside className="hidden w-[19rem] shrink-0 border-l border-rule bg-surface xl:block">
              <ProspectMemoryPanel
                name={detail.prospect.companyName}
                memory={detail.prospect.memory}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
