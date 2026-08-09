import { ApiError } from "./errors";
import {
  mergeProspectMemory,
  parseProspectMemory,
  prospectToChatShape,
} from "./merge";
import { getSupabaseAdmin } from "./supabase-admin";
import type { ConversationRow, MessageRow, ProspectMemory, ProspectRow } from "./types";
import { emptyProspectMemory } from "./types";

export async function createProspect(args: {
  companyId: string;
  companyName?: string;
  personName?: string;
  email?: string;
  stage?: string;
}): Promise<ProspectRow> {
  const db = getSupabaseAdmin();
  const memory = emptyProspectMemory();
  if (args.stage) memory.stage = args.stage;

  const { data, error } = await db
    .from("prospects")
    .insert({
      company_id: args.companyId,
      company_name: args.companyName ?? null,
      person_name: args.personName ?? null,
      email: args.email ?? null,
      stage: args.stage ?? "new",
      memory_json: memory,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not create prospect", {
      status: 500,
      details: error?.message,
    });
  }
  return data as ProspectRow;
}

export async function createConversation(args: {
  companyId: string;
  prospectId: string;
}): Promise<ConversationRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("conversations")
    .insert({
      company_id: args.companyId,
      prospect_id: args.prospectId,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not create conversation", {
      status: 500,
      details: error?.message,
    });
  }
  return data as ConversationRow;
}

/** Lazy-create prospect + conversation for public FDE pages */
export async function openSession(args: {
  companyId: string;
  prospectId?: string;
  conversationId?: string;
  companyName?: string;
  personName?: string;
  email?: string;
  /** Explicit "start a new thread" action; skips resuming the latest one. */
  forceNew?: boolean;
}): Promise<{ prospect: ProspectRow; conversation: ConversationRow }> {
  const db = getSupabaseAdmin();

  if (args.conversationId) {
    const { data: conversation } = await db
      .from("conversations")
      .select("*")
      .eq("id", args.conversationId)
      .maybeSingle();
    if (!conversation) {
      throw new ApiError("NOT_FOUND", "Conversation not found", { status: 404 });
    }
    const { data: prospect } = await db
      .from("prospects")
      .select("*")
      .eq("id", conversation.prospect_id)
      .single();
    if (!prospect) {
      throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
    }
    return {
      prospect: prospect as ProspectRow,
      conversation: conversation as ConversationRow,
    };
  }

  let prospect: ProspectRow;
  if (args.prospectId) {
    const { data } = await db
      .from("prospects")
      .select("*")
      .eq("id", args.prospectId)
      .maybeSingle();
    if (!data) throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
    prospect = data as ProspectRow;
  } else {
    prospect = await createProspect({
      companyId: args.companyId,
      companyName: args.companyName,
      personName: args.personName,
      email: args.email,
    });
  }

  // A returning prospect keeps their thread. Creating a fresh conversation on every
  // page load would silently discard their history and orphan the memory built on it.
  // forceNew is the deliberate exception: the visitor asked for a new thread.
  if (!args.forceNew) {
    const { data: existing } = await db
      .from("conversations")
      .select("*")
      .eq("prospect_id", prospect.id)
      .eq("company_id", args.companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { prospect, conversation: existing as ConversationRow };
    }
  }

  const conversation = await createConversation({
    companyId: args.companyId,
    prospectId: prospect.id,
  });

  return { prospect, conversation };
}

export async function getConversationBundle(conversationId: string): Promise<{
  conversation: ConversationRow;
  prospect: ProspectRow;
  companyId: string;
}> {
  const db = getSupabaseAdmin();
  const { data: conversation, error } = await db
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !conversation) {
    throw new ApiError("NOT_FOUND", "Conversation not found", { status: 404 });
  }

  const { data: prospect } = await db
    .from("prospects")
    .select("*")
    .eq("id", conversation.prospect_id)
    .single();

  if (!prospect) {
    throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
  }

  return {
    conversation: conversation as ConversationRow,
    prospect: prospect as ProspectRow,
    companyId: conversation.company_id,
  };
}

export async function getRecentMessages(
  conversationId: string,
  limit = 20,
): Promise<MessageRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Could not load messages", {
      status: 500,
      details: error.message,
    });
  }
  return ((data ?? []) as MessageRow[]).reverse();
}

export async function insertMessage(args: {
  conversationId: string;
  channel: MessageRow["channel"];
  role: MessageRow["role"];
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<MessageRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: args.conversationId,
      channel: args.channel,
      role: args.role,
      content: args.content,
      metadata_json: args.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not save message", {
      status: 500,
      details: error?.message,
    });
  }

  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.conversationId);

  return data as MessageRow;
}

export async function updateProspectMemory(
  prospectId: string,
  incoming: Partial<ProspectMemory> | ProspectMemory,
): Promise<ProspectRow> {
  const db = getSupabaseAdmin();
  const { data: current } = await db
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .single();

  if (!current) {
    throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
  }

  const merged = mergeProspectMemory(current.memory_json, incoming);
  const { data, error } = await db
    .from("prospects")
    .update({
      memory_json: merged,
      stage: merged.stage || current.stage,
    })
    .eq("id", prospectId)
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not update prospect memory", {
      status: 500,
      details: error?.message,
    });
  }
  return data as ProspectRow;
}

export function getProspectMemory(prospect: ProspectRow): ProspectMemory {
  return parseProspectMemory(prospect.memory_json);
}

export { prospectToChatShape };
