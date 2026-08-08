import { getSupabaseAdmin } from "./supabase-admin";
import { addTimelineEvent, normalizeKey } from "./accounts";

export async function createBlocker(args: {
  accountId: string;
  title: string;
  description?: string;
  ownerType?: "customer" | "vendor" | "fde" | "unknown";
  ownerName?: string;
  source?: string;
  impact?: string;
}) {
  const db = getSupabaseAdmin();
  const key = normalizeKey(args.title);
  const { data: existing } = await db
    .from("account_blockers")
    .select("*")
    .eq("account_id", args.accountId)
    .eq("status", "open")
    .eq("normalized_key", key)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await db
    .from("account_blockers")
    .insert({
      account_id: args.accountId,
      title: args.title,
      description: args.description ?? null,
      owner_type: args.ownerType || "unknown",
      owner_name: args.ownerName ?? null,
      source: args.source ?? "slack",
      impact: args.impact ?? null,
      normalized_key: key,
      status: "open",
    })
    .select("*")
    .single();
  if (error) throw error;
  await addTimelineEvent(args.accountId, "blocker", `Blocker opened: ${args.title}`, {
    blockerId: data.id,
  });
  return data;
}

export async function resolveBlocker(args: {
  accountId: string;
  blockerId?: string;
  title?: string;
}) {
  const db = getSupabaseAdmin();
  let q = db
    .from("account_blockers")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("account_id", args.accountId)
    .eq("status", "open");
  if (args.blockerId) q = q.eq("id", args.blockerId);
  else if (args.title) q = q.eq("normalized_key", normalizeKey(args.title));
  const { data } = await q.select("*");
  if (data?.[0]) {
    await addTimelineEvent(args.accountId, "blocker", `Blocker resolved: ${data[0].title}`, {
      blockerId: data[0].id,
    });
  }
  return data || [];
}

export async function listOpenBlockers(accountId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("account_blockers")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  return data || [];
}

export async function createDecision(args: {
  accountId: string;
  title: string;
  decision: string;
  rationale?: string;
  source?: string;
  sourceReference?: string;
}) {
  const db = getSupabaseAdmin();
  const key = normalizeKey(args.title + " " + args.decision);
  const { data: existing } = await db
    .from("account_decisions")
    .select("*")
    .eq("account_id", args.accountId)
    .eq("normalized_key", key)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await db
    .from("account_decisions")
    .insert({
      account_id: args.accountId,
      title: args.title,
      decision: args.decision,
      rationale: args.rationale ?? null,
      source: args.source ?? "slack",
      source_reference: args.sourceReference ?? null,
      normalized_key: key,
    })
    .select("*")
    .single();
  if (error) throw error;
  await addTimelineEvent(args.accountId, "decision", `Decision: ${args.title} — ${args.decision}`);
  return data;
}

export async function createCommitment(args: {
  accountId: string;
  owner: string;
  description: string;
  source?: string;
}) {
  const db = getSupabaseAdmin();
  const key = normalizeKey(args.owner + " " + args.description);
  const { data: existing } = await db
    .from("account_commitments")
    .select("*")
    .eq("account_id", args.accountId)
    .eq("status", "open")
    .eq("normalized_key", key)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await db
    .from("account_commitments")
    .insert({
      account_id: args.accountId,
      owner: args.owner,
      description: args.description,
      source: args.source ?? "slack",
      normalized_key: key,
      status: "open",
    })
    .select("*")
    .single();
  if (error) throw error;
  await addTimelineEvent(
    args.accountId,
    "commitment",
    `Commitment (${args.owner}): ${args.description}`,
  );
  return data;
}

export async function completeCommitmentsMatching(
  accountId: string,
  pattern: RegExp,
) {
  const db = getSupabaseAdmin();
  const { data: open } = await db
    .from("account_commitments")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "open");
  const matches = (open || []).filter((c) => pattern.test(String(c.description)));
  for (const c of matches) {
    await db
      .from("account_commitments")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", c.id);
  }
  return matches;
}
