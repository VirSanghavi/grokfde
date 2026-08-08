import { errorResponse, jsonOk } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { getAccount } from "@/lib/server/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    await getAccount(id);
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("slack_connections")
      .select(
        "id, team_id, workspace_name, channel_id, channel_name, status, bot_user_id, created_at, updated_at",
      )
      .eq("account_id", id)
      .order("created_at", { ascending: false });
    return jsonOk({
      connections: (data || []).map((c) => ({
        id: c.id,
        teamId: c.team_id,
        workspaceName: c.workspace_name,
        channelId: c.channel_id,
        channelName: c.channel_name,
        status: c.status,
        botUserId: c.bot_user_id,
        createdAt: c.created_at,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
