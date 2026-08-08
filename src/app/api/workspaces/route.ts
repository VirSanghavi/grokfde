import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { createWorkspace, workspacePublic } from "@/lib/server/workspaces";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  prospectId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const ws = await createWorkspace(body);
    return jsonOk({ workspace: workspacePublic(ws) }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid workspace payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const prospectId = url.searchParams.get("prospectId");
    const companyId = url.searchParams.get("companyId");
    if (!prospectId && !companyId) {
      throw new ApiError("BAD_REQUEST", "prospectId or companyId required", {
        status: 400,
      });
    }
    const db = getSupabaseAdmin();
    let q = db
      .from("customer_workspaces")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (prospectId) q = q.eq("prospect_id", prospectId);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) throw new ApiError("INTERNAL_ERROR", error.message, { status: 500 });
    return jsonOk({
      workspaces: (data || []).map((w) =>
        workspacePublic(w as Parameters<typeof workspacePublic>[0]),
      ),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
