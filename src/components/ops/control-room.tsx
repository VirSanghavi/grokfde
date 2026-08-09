"use client";

import type { CompanyProfile } from "@/components/layout/WorkspaceContext";
import { fetchJson, isAbortError } from "@/lib/utils";

/**
 * The control room reads from the same routes the product itself runs on. There
 * is no derived, cached, or invented number in here: if a value cannot be read
 * from the database it is reported as unavailable and the screen says so.
 */

/** How many conversations get a full memory read on the control room. */
const DESK_LIMIT = 10;

/**
 * `/api/conversations` returns at most this many rows, so a count that reaches
 * it is a floor, not a total, and the screen has to say so.
 */
export const CONVERSATION_PAGE_LIMIT = 50;

const str = (v: unknown, fallback = "") => (v == null ? fallback : String(v));
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

export interface DeskDetail {
  messageCount: number;
  channels: string[];
  lastMessage: { role: string; content: string; createdAt: string } | null;
  summary: string;
  stack: string[];
  unresolvedQuestions: string[];
  openObjections: string[];
  nextAction: string;
}

export interface DeskEntry {
  conversationId: string;
  prospectId: string;
  name: string;
  personName: string | null;
  stage: string;
  updatedAt: string;
  /** Null when this conversation's detail could not be read. */
  detail: DeskDetail | null;
}

export interface EscalationRow {
  id: string;
  conversationId: string | null;
  prospectName: string;
  question: string;
  reason: string;
  priority: string;
  createdAt: string;
}

export interface BookingRow {
  id: string;
  startsAt: string;
  durationMinutes: number;
  guestName: string;
  guestCompany: string | null;
  notes: string | null;
  joinUrl: string | null;
  canJoin: boolean;
  joinMessage: string | null;
  conversationId: string | null;
}

export interface KnowledgeRow {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
}

export interface SignalRow {
  key: string;
  type: string;
  title: string;
  accountCount: number;
  occurrenceCount: number;
  recommendation: string | null;
}

export interface ControlRoomData {
  /** The conversations the agent is holding, newest first, with memory read. */
  desk: DeskEntry[];
  totalConversations: number;
  /** True when the list hit the route's page size, so the count is a floor. */
  conversationsTruncated: boolean;
  /** When someone last actually said something, not when a thread was opened. */
  lastMessageAt: string | null;
  escalations: EscalationRow[];
  bookings: BookingRow[];
  knowledge: KnowledgeRow[];
  toolCount: number;
  serverCount: number;
  signals: SignalRow[];
  /** Each supplementary source reports its own failure instead of blanking. */
  degraded: {
    escalations: boolean;
    bookings: boolean;
    knowledge: boolean;
    tools: boolean;
    signals: boolean;
    deskDetail: boolean;
  };
}

/** Aborts must propagate; every other failure degrades one region only. */
function optional<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | null> {
  return promise.catch((err: unknown) => {
    if (isAbortError(err) || signal.aborted) throw err;
    return null;
  });
}

interface ConversationListRow {
  id?: string;
  prospectId?: string;
  updatedAt?: string;
  prospect?: { id?: string; companyName?: string; personName?: string; stage?: string } | null;
}

async function loadDeskDetail(
  conversationId: string,
  signal: AbortSignal,
): Promise<DeskDetail | null> {
  const detail = await optional(
    fetchJson<{
      prospect?: Record<string, unknown> & { memory?: Record<string, unknown> };
      messages?: Array<Record<string, unknown>>;
    }>(`/api/conversations/${conversationId}`, { signal }),
    signal,
  );
  if (!detail) return null;

  // One malformed row must never blank the rest of the conversation.
  const messages = (Array.isArray(detail.messages) ? detail.messages : []).filter(
    (m) => m && typeof m === "object" && str(m.content).trim(),
  );
  const last = messages[messages.length - 1] ?? null;
  const memory = (detail.prospect?.memory ?? {}) as Record<string, unknown>;

  return {
    messageCount: messages.length,
    channels: [...new Set(messages.map((m) => str(m.channel, "chat")))],
    lastMessage: last
      ? {
          role: str(last.role, "assistant"),
          content: str(last.content),
          createdAt: str(last.createdAt ?? last.created_at, new Date().toISOString()),
        }
      : null,
    summary: str(memory.summary),
    stack: strList(memory.currentStack),
    unresolvedQuestions: strList(memory.unresolvedQuestions),
    openObjections: strList(memory.objections),
    nextAction: str(memory.nextAction),
  };
}

export async function loadControlRoom(
  company: CompanyProfile,
  signal: AbortSignal,
): Promise<ControlRoomData> {
  const id = encodeURIComponent(company.id);

  // The conversation list is the spine of this screen. If it fails, the screen
  // fails honestly rather than rendering an empty desk that looks like calm.
  const conversationsRes = await fetchJson<{ conversations?: ConversationListRow[] }>(
    `/api/conversations?companyId=${id}`,
    { signal },
  );
  const conversations = (conversationsRes.conversations ?? []).filter((c) => c?.id);

  const [escalationsRes, bookingsRes, knowledgeRes, mcpRes, signalsRes] = await Promise.all([
    optional(
      fetchJson<{ escalations?: Array<Record<string, unknown>> }>(
        `/api/escalations?companyId=${id}&status=open`,
        { signal },
      ),
      signal,
    ),
    optional(
      fetchJson<{ bookings?: Array<Record<string, unknown>> }>(
        `/api/bookings?slug=${encodeURIComponent(company.slug)}`,
        { signal },
      ),
      signal,
    ),
    optional(
      fetchJson<{ knowledgeSources?: Array<Record<string, unknown>> }>(
        `/api/company?id=${id}`,
        { signal },
      ),
      signal,
    ),
    optional(
      fetchJson<{ servers?: Array<{ tools?: unknown[] }> }>(`/api/mcp?companyId=${id}`, {
        signal,
      }),
      signal,
    ),
    optional(
      fetchJson<{ signals?: Array<Record<string, unknown>> }>(
        `/api/field-signals?companyId=${id}`,
        { signal },
      ),
      signal,
    ),
  ]);

  const ordered = [...conversations].sort(
    (a, b) =>
      new Date(str(b.updatedAt)).getTime() - new Date(str(a.updatedAt)).getTime(),
  );

  const details = await Promise.all(
    ordered
      .slice(0, DESK_LIMIT)
      .map((c) => loadDeskDetail(String(c.id), signal)),
  );

  const desk: DeskEntry[] = ordered.map((c, i) => ({
    conversationId: String(c.id),
    prospectId: str(c.prospect?.id ?? c.prospectId),
    name: str(c.prospect?.companyName, "Unnamed prospect"),
    personName: c.prospect?.personName ? String(c.prospect.personName) : null,
    stage: str(c.prospect?.stage, "new"),
    updatedAt: str(c.updatedAt, new Date().toISOString()),
    detail: i < DESK_LIMIT ? (details[i] ?? null) : null,
  }));

  const prospectNames = new Map(desk.map((d) => [d.prospectId, d.name]));

  const escalations: EscalationRow[] = (escalationsRes?.escalations ?? []).map((e) => ({
    id: str(e.id),
    conversationId: str(e.conversationId ?? e.conversation_id) || null,
    prospectName:
      prospectNames.get(str(e.prospectId ?? e.prospect_id)) ?? "Unnamed prospect",
    question: str(e.question),
    reason: str(e.reason),
    priority: str(e.priority, "medium"),
    createdAt: str(e.createdAt ?? e.created_at, new Date().toISOString()),
  }));

  const now = Date.now();
  const bookings: BookingRow[] = (bookingsRes?.bookings ?? [])
    .map((b) => {
      const join = (b.join ?? {}) as { canJoin?: boolean; message?: string };
      return {
        id: str(b.id),
        startsAt: str(b.startsAt),
        durationMinutes: Number(b.durationMinutes) || 30,
        guestName: str(b.guestName, "Guest"),
        guestCompany: str(b.guestCompany) || null,
        notes: str(b.notes) || null,
        joinUrl: str(b.joinUrl) || null,
        canJoin: Boolean(join.canJoin),
        joinMessage: str(join.message) || null,
        conversationId: str(b.conversationId) || null,
      };
    })
    .filter((b) => b.id && b.startsAt && new Date(b.startsAt).getTime() >= now - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const knowledge: KnowledgeRow[] = (knowledgeRes?.knowledgeSources ?? []).map((s) => ({
    id: str(s.id),
    title: str(s.title, "Untitled source"),
    type: str(s.type, "paste"),
    status: str(s.status, "ready"),
    createdAt: str(s.createdAt ?? s.created_at, new Date().toISOString()),
  }));

  const servers = mcpRes?.servers ?? [];

  const signals: SignalRow[] = (signalsRes?.signals ?? []).map((s, i) => ({
    key: str(s.key ?? s.id, `signal-${i}`),
    type: str(s.type, "signal"),
    title: str(s.title, "Untitled signal"),
    accountCount: Number(s.accountCount) || 0,
    occurrenceCount: Number(s.occurrenceCount) || 0,
    recommendation: str(s.recommendation) || null,
  }));

  const lastWithMessage = desk.find((d) => (d.detail?.messageCount ?? 0) > 0);

  return {
    desk,
    totalConversations: desk.length,
    conversationsTruncated: desk.length >= CONVERSATION_PAGE_LIMIT,
    lastMessageAt: lastWithMessage?.detail?.lastMessage?.createdAt ?? null,
    escalations,
    bookings,
    knowledge,
    toolCount: servers.reduce((n, s) => n + (Array.isArray(s.tools) ? s.tools.length : 0), 0),
    serverCount: servers.length,
    signals,
    degraded: {
      escalations: escalationsRes === null,
      bookings: bookingsRes === null,
      knowledge: knowledgeRes === null,
      tools: mcpRes === null,
      signals: signalsRes === null,
      deskDetail: details.some((d) => d === null),
    },
  };
}
