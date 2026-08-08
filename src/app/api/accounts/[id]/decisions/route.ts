import { z } from "zod";
import { createDecision } from "@/lib/server/blockers";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("account_decisions")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false });
    return jsonOk({ decisions: data || [] });
  } catch (err) {
    return errorResponse(err);
  }
}

const Schema = z.object({
  title: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().optional(),
  source: z.string().optional(),
});

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json());
    const decision = await createDecision({
      accountId: id,
      ...body,
    });
    return jsonOk({ decision }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid decision", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
