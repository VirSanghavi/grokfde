import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getAccount } from "@/lib/server/accounts";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const account = await getAccount(id);
    const db = getSupabaseAdmin();

    const { data: timeline } = await db
      .from("account_timeline_events")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    const events: Array<Record<string, unknown>> = (timeline || []).map((e) => ({
      id: e.id,
      type: e.type,
      timestamp: e.created_at,
      summary: e.summary,
      metadata: e.metadata_json,
    }));

    // Merge conversation messages if present
    if (account.conversation_id) {
      const { data: messages } = await db
        .from("messages")
        .select("*")
        .eq("conversation_id", account.conversation_id)
        .order("created_at", { ascending: false })
        .limit(50);
      for (const m of messages || []) {
        events.push({
          id: m.id,
          type: m.channel,
          timestamp: m.created_at,
          summary: `${m.role}: ${String(m.content).slice(0, 200)}`,
          metadata: m.metadata_json,
        });
      }
    }

    // Implementation runs
    if (account.workspace_id) {
      const { data: runs } = await db
        .from("implementation_runs")
        .select("id, status, branch_name, created_at, updated_at, summary_json")
        .eq("workspace_id", account.workspace_id)
        .order("updated_at", { ascending: false })
        .limit(10);
      for (const r of runs || []) {
        events.push({
          id: r.id,
          type: "implementation",
          timestamp: r.updated_at || r.created_at,
          summary: `Implementation ${r.status}${r.branch_name ? ` on ${r.branch_name}` : ""}`,
          metadata: r.summary_json,
        });
      }
    }

    events.sort(
      (a, b) =>
        new Date(String(b.timestamp)).getTime() -
        new Date(String(a.timestamp)).getTime(),
    );

    return jsonOk({ events: events.slice(0, 100) });
  } catch (err) {
    return errorResponse(err);
  }
}
