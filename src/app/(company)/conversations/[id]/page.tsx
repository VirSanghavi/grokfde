"use client";

import { ProspectMemoryPanel } from "@/components/company/ProspectMemoryPanel";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/ui/Button";
import { errorMessage, fetchJson, humanize, isAbortError } from "@/lib/utils";
import { agentDisplayName } from "@/lib/personas";
import type { Channel, Message, Prospect, WorkspaceStatus } from "@/types/ui";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/* ── Data ────────────────────────────────────────────────────────────────── */

interface ConversationView {
  prospect: Prospect;
  messages: Message[];
  agentName: string;
  /** Null when this prospect has no workspace yet, which is the common case. */
  workspaceStatus: WorkspaceStatus | null;
}

/** Includes `slack`, which the database stores but the Channel union omits. */
const CHANNEL_LABEL: Record<string, string> = {
  chat: "chat",
  email: "email",
  call: "calls",
  slack: "Slack",
  system: "system events",
};

async function loadConversation(
  id: string,
  signal: AbortSignal,
): Promise<ConversationView> {
  const detail = await fetchJson<{
    prospect: Record<string, unknown> & { memory?: Prospect["memory"] };
    company: {
      slug?: string;
      agentName?: string;
      agentVoice?: string;
      agentPersona?: string;
    };
    messages: Array<Record<string, unknown>>;
  }>(`/api/conversations/${id}`, { signal });

  const rawProspect = detail.prospect ?? {};
  const memory = (rawProspect.memory ?? {}) as Partial<Prospect["memory"]>;

  const prospect: Prospect = {
    id: String(rawProspect.id ?? ""),
    companyId: String(rawProspect.companyId ?? ""),
    companyName: String(rawProspect.companyName ?? "Prospect"),
    personName: rawProspect.personName ? String(rawProspect.personName) : undefined,
    email: rawProspect.email ? String(rawProspect.email) : undefined,
    memory: {
      stage: String(memory.stage ?? "discovery"),
      summary: String(memory.summary ?? ""),
      currentStack: memory.currentStack ?? [],
      painPoints: memory.painPoints ?? [],
      requirements: memory.requirements ?? [],
      objections: memory.objections ?? [],
      nextAction: String(memory.nextAction ?? ""),
    },
    createdAt: String(rawProspect.createdAt ?? new Date().toISOString()),
    updatedAt: String(rawProspect.updatedAt ?? new Date().toISOString()),
  };

  // One malformed row must never blank the whole transcript.
  const messages: Message[] = (Array.isArray(detail.messages) ? detail.messages : [])
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      id: String(m.id ?? ""),
      conversationId: id,
      channel: (m.channel as Channel) || "chat",
      role: (m.role as Message["role"]) || "assistant",
      content: String(m.content ?? ""),
      createdAt: String(m.createdAt ?? m.created_at ?? new Date().toISOString()),
      metadata: (m.metadata ?? m.metadata_json ?? undefined) as Message["metadata"],
    }))
    .filter((m) => m.id && m.content);

  // Supplementary: this only decides whether the button reads "Start" or
  // "Open", so a lookup failure degrades rather than failing the page.
  let workspaceStatus: WorkspaceStatus | null = null;
  if (prospect.id) {
    try {
      const list = await fetchJson<{
        workspaces: Array<{ conversationId?: string; status?: string }>;
      }>(`/api/workspaces?prospectId=${encodeURIComponent(prospect.id)}`, { signal });
      const workspaces = list.workspaces ?? [];
      const match =
        workspaces.find((w) => w.conversationId === id) ?? workspaces[0] ?? null;
      workspaceStatus = (match?.status as WorkspaceStatus) ?? null;
    } catch (err) {
      if (isAbortError(err)) throw err;
    }
  }

  return {
    prospect,
    messages,
    // The engineer belongs to this company. Never a literal name.
    agentName: agentDisplayName({
      slug: detail.company?.slug ?? null,
      agent_name: detail.company?.agentName ?? null,
      agent_voice: detail.company?.agentVoice ?? null,
      agent_persona: detail.company?.agentPersona ?? null,
    }),
    workspaceStatus,
  };
}

/* ── States ──────────────────────────────────────────────────────────────── */

function TranscriptSkeleton() {
  return (
    <div className="space-y-6 px-5 py-6 sm:px-8" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3">
          <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
          <div className="w-full max-w-[520px] space-y-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-20 w-full rounded-[var(--radius-lg)]" />
          </div>
        </div>
      ))}
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

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;

  const [view, setView] = useState<ConversationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    loadConversation(conversationId, controller.signal)
      .then((next) => {
        if (!active) return;
        setView(next);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setView(null);
        setError(
          errorMessage(err, "This conversation could not be loaded."),
        );
      })
      .finally(() => {
        // Loading always terminates, on every path.
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [conversationId, reloadKey]);

  if (loading) {
    return (
      <>
        <TopNav title="Conversation" subtitle="Loading the transcript" />
        <TranscriptSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <TopNav title="Conversation" />
        <PageMessage title="We could not open this conversation." body={error}>
          <Button onClick={retry}>Try again</Button>
          <Link href="/conversations">
            <Button variant="secondary">Back to inbox</Button>
          </Link>
        </PageMessage>
      </>
    );
  }

  if (!view) {
    return (
      <>
        <TopNav title="Conversation" />
        <PageMessage
          title="This conversation is not here."
          body="It may have been removed, or the link points at an id that no longer exists. The inbox lists every conversation your engineer is holding."
        >
          <Link href="/conversations">
            <Button>Back to inbox</Button>
          </Link>
        </PageMessage>
      </>
    );
  }

  const { prospect, messages, agentName, workspaceStatus } = view;
  const started = workspaceStatus && workspaceStatus !== "discovery";
  const channels = [...new Set(messages.map((m) => m.channel))];
  const subtitle = channels.length
    ? `${messages.length} ${messages.length === 1 ? "message" : "messages"} across ${channels
        .map((c) => CHANNEL_LABEL[c] ?? c)
        .join(", ")}`
    : `${humanize(String(prospect.memory.stage))} · no messages yet`;

  return (
    <>
      <TopNav
        title={prospect.companyName}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/conversations">
              <Button size="md" variant="ghost">
                Inbox
              </Button>
            </Link>
            {prospect.id && (
              <Link href={`/accounts/${prospect.id}`}>
                <Button size="md" variant="secondary">
                  Account room
                </Button>
              </Link>
            )}
            <Link href={`/conversations/${conversationId}/workspace`}>
              <Button size="md">
                {started ? "Open implementation" : "Start implementation"}
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-12">
            {/* On a phone the memory rail is not on screen, so it lives here. */}
            <details className="mb-6 border-b border-rule pb-2 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer items-center text-body font-medium text-ink">
                What {agentName} knows about {prospect.companyName}
              </summary>
              <div className="border-t border-rule">
                <ProspectMemoryPanel
                  name={prospect.companyName}
                  memory={prospect.memory}
                />
              </div>
            </details>

            {messages.length === 0 ? (
              <div className="max-w-[52ch]">
                <h2 className="text-title text-ink">No messages yet</h2>
                <p className="mt-2 text-body text-ink-2">
                  This conversation exists but nothing has been said in it. It fills in as
                  soon as {prospect.companyName} writes to {agentName} in chat, email, or
                  the shared Slack channel.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} agentName={agentName} />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="hidden w-[320px] shrink-0 border-l border-rule bg-surface lg:block">
          <ProspectMemoryPanel name={prospect.companyName} memory={prospect.memory} />
        </aside>
      </div>
    </>
  );
}
