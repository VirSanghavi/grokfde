import { z } from "zod";
import { addTimelineEvent } from "@/lib/server/accounts";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { createImplementationPlan } from "@/lib/server/implementation";
import { getAccount } from "@/lib/server/accounts";
import { startBuild } from "@/lib/server/implementation";
import { notifySlackImplementationReady } from "@/lib/server/slack-fde";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("production_issues")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false });
    return jsonOk({ issues: data || [] });
  } catch (err) {
    return errorResponse(err);
  }
}

const PostSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  createPlan: z.boolean().optional(),
});

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = PostSchema.parse(await req.json());
    const account = await getAccount(id);
    const db = getSupabaseAdmin();
    const { data: issue, error } = await db
      .from("production_issues")
      .insert({
        account_id: id,
        title: body.title,
        description: body.description ?? null,
        severity: body.severity || "medium",
        source: "api",
        status: "open",
      })
      .select("*")
      .single();
    if (error || !issue) {
      throw new ApiError("INTERNAL_ERROR", "Could not create issue", {
        status: 500,
        details: error?.message,
      });
    }
    await addTimelineEvent(id, "issue", `Issue opened: ${body.title}`);

    let plan = null;
    if (body.createPlan && account.workspace_id) {
      plan = await createImplementationPlan({
        workspaceId: account.workspace_id,
        objective: `Resolve issue: ${body.title}. ${body.description || ""}`,
      });
      await db
        .from("production_issues")
        .update({ plan_id: plan.planId, status: "investigating" })
        .eq("id", issue.id);
    }

    return jsonOk({ issue, plan }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid issue", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}

const PatchSchema = z.object({
  issueId: z.string().uuid(),
  status: z.enum(["open", "investigating", "fix_ready", "resolved", "wontfix"]).optional(),
  rootCause: z.string().optional(),
  resolution: z.string().optional(),
  buildPlan: z.boolean().optional(),
  notifySlack: z.boolean().optional(),
});

/** Resolve issue and optionally build approved plan */
export async function PATCH(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = PatchSchema.parse(await req.json());
    const account = await getAccount(id);
    const db = getSupabaseAdmin();

    const { data: issue } = await db
      .from("production_issues")
      .select("*")
      .eq("id", body.issueId)
      .eq("account_id", id)
      .maybeSingle();
    if (!issue) throw new ApiError("NOT_FOUND", "Issue not found", { status: 404 });

    let run = null;
    if (body.buildPlan && issue.plan_id && account.workspace_id) {
      run = await startBuild({
        workspaceId: account.workspace_id,
        planId: issue.plan_id,
      });
      await db
        .from("production_issues")
        .update({
          status: "fix_ready",
          implementation_run_id: run.runId,
          root_cause:
            body.rootCause ||
            issue.root_cause ||
            "Auth header mismatch after recent change",
          resolution:
            body.resolution ||
            `Fix ready for review on ${run.branchName}`,
        })
        .eq("id", issue.id);

      if (body.notifySlack !== false) {
        // create simulated PR URL for slack update
        await notifySlackImplementationReady({
          accountId: id,
          runId: run.runId,
          branchName: run.branchName,
          prUrl: `https://github.com/globex/platform/pull/demo-${run.runId.slice(0, 6)}`,
        });
      }
    } else {
      await db
        .from("production_issues")
        .update({
          status: body.status || issue.status,
          root_cause: body.rootCause ?? issue.root_cause,
          resolution: body.resolution ?? issue.resolution,
          resolved_at:
            body.status === "resolved" ? new Date().toISOString() : issue.resolved_at,
        })
        .eq("id", issue.id);
    }

    const { data: updated } = await db
      .from("production_issues")
      .select("*")
      .eq("id", body.issueId)
      .single();

    return jsonOk({ issue: updated, run });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid issue update", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
