import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");
    const status = url.searchParams.get("status") || "open";

    if (!companyId) {
      throw new ApiError("BAD_REQUEST", "companyId is required", { status: 400 });
    }

    const db = getSupabaseAdmin();
    let query = db
      .from("escalations")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw new ApiError("INTERNAL_ERROR", error.message, { status: 500 });

    return jsonOk({
      escalations: (data ?? []).map((e) => {
        const row = e as Record<string, unknown>;
        return {
          id: row.id,
          companyId: row.company_id,
          prospectId: row.prospect_id,
          conversationId: row.conversation_id,
          question: row.question,
          reason: row.reason,
          priority: row.priority,
          status: row.status,
          suggestedResponse: row.suggested_response,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const PatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "resolved", "dismissed"]),
});

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("escalations")
      .update({
        status: body.status,
        resolved_at: body.status === "open" ? null : new Date().toISOString(),
      })
      .eq("id", body.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new ApiError("NOT_FOUND", "Escalation not found", { status: 404 });
    }

    return jsonOk({ escalation: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid escalation update", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
