import { errorResponse, jsonOk } from "@/lib/server/errors";
import { getWorkspace, workspacePublic } from "@/lib/server/workspaces";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const ws = await getWorkspace(id);
    const db = getSupabaseAdmin();

    const { data: repos } = await db
      .from("repository_connections")
      .select(
        "id, provider, repository_name, repository_url, default_branch, status, created_at",
      )
      .eq("workspace_id", id)
      .order("created_at", { ascending: false });

    const { data: plans } = await db
      .from("implementation_plans")
      .select("id, version, summary, status, objective, plan_json, created_at")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: runs } = await db
      .from("implementation_runs")
      .select(
        "id, status, branch_name, plan_id, summary_json, created_at, updated_at, pr_json",
      )
      .eq("workspace_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    return jsonOk({
      workspace: workspacePublic(ws),
      repositories: (repos || []).map((r) => ({
        id: r.id,
        provider: r.provider,
        repositoryName: r.repository_name,
        repositoryUrl: r.repository_url,
        defaultBranch: r.default_branch,
        status: r.status,
        createdAt: r.created_at,
      })),
      plans: (plans || []).map((p) => ({
        id: p.id,
        version: p.version,
        summary: p.summary,
        status: p.status,
        objective: p.objective,
        plan: p.plan_json,
        createdAt: p.created_at,
      })),
      runs: (runs || []).map((r) => ({
        id: r.id,
        status: r.status,
        branchName: r.branch_name,
        planId: r.plan_id,
        summary: r.summary_json,
        pullRequest: r.pr_json,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
