import { getSupabaseAdmin } from "./supabase-admin";
import { normalizeKey } from "./accounts";

export async function recordFieldSignal(args: {
  companyId: string;
  accountId?: string;
  type: string;
  title: string;
  summary?: string;
  key?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getSupabaseAdmin();
  const key = args.key || normalizeKey(args.title);
  const { data, error } = await db
    .from("field_signals")
    .insert({
      company_id: args.companyId,
      account_id: args.accountId ?? null,
      type: args.type,
      normalized_key: key,
      title: args.title,
      summary: args.summary ?? null,
      metadata_json: args.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function aggregateFieldSignals(companyId?: string) {
  const db = getSupabaseAdmin();
  let q = db.from("field_signals").select("*").order("created_at", { ascending: false }).limit(500);
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await q;
  const groups = new Map<
    string,
    {
      key: string;
      type: string;
      title: string;
      accountIds: Set<string>;
      count: number;
      summaries: string[];
    }
  >();

  for (const row of data || []) {
    const key = String(row.normalized_key);
    const g = groups.get(key) || {
      key,
      type: String(row.type),
      title: String(row.title),
      accountIds: new Set<string>(),
      count: 0,
      summaries: [] as string[],
    };
    g.count += 1;
    if (row.account_id) g.accountIds.add(String(row.account_id));
    if (row.summary) g.summaries.push(String(row.summary));
    groups.set(key, g);
  }

  return Array.from(groups.values())
    .map((g) => ({
      key: g.key,
      type: g.type,
      title: g.title,
      accountCount: g.accountIds.size || g.count,
      occurrenceCount: g.count,
      recommendation:
        g.count >= 2
          ? `Recurring across accounts — consider productizing: ${g.title}`
          : `Monitor: ${g.title}`,
      sampleSummary: g.summaries[0] || null,
    }))
    .sort((a, b) => b.accountCount - a.accountCount);
}
