import { z } from "zod";
import {
  buildAccountSnapshot,
  createOrGetAccount,
} from "@/lib/server/accounts";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  prospectId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  stage: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const account = await createOrGetAccount(body);
    const snapshot = await buildAccountSnapshot(account.id);
    return jsonOk({ account: snapshot }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid account payload", {
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
    const companyId = url.searchParams.get("companyId");
    const prospectId = url.searchParams.get("prospectId");
    const db = getSupabaseAdmin();
    let q = db.from("accounts").select("id, stage, prospect_id, company_id, updated_at").order("updated_at", { ascending: false }).limit(50);
    if (companyId) q = q.eq("company_id", companyId);
    if (prospectId) q = q.eq("prospect_id", prospectId);
    const { data, error } = await q;
    if (error) throw new ApiError("INTERNAL_ERROR", error.message, { status: 500 });
    return jsonOk({ accounts: data || [] });
  } catch (err) {
    return errorResponse(err);
  }
}
