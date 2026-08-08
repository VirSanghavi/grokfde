import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import {
  getProspectMemory,
  prospectToChatShape,
  updateProspectMemory,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { ProspectRow } from "@/lib/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("prospects").select("*").eq("id", id).maybeSingle();
    if (error || !data) {
      throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
    }
    const prospect = data as ProspectRow;
    const memory = getProspectMemory(prospect);
    return jsonOk({
      prospect: {
        id: prospect.id,
        companyId: prospect.company_id,
        companyName: prospect.company_name,
        personName: prospect.person_name,
        email: prospect.email,
        ...prospectToChatShape(memory),
        memory,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const PatchSchema = z.object({
  companyName: z.string().optional(),
  personName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  stage: z.string().optional(),
  memory: z.record(z.unknown()).optional(),
});

export async function PATCH(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = PatchSchema.parse(await req.json());
    const db = getSupabaseAdmin();

    const updates: Record<string, unknown> = {};
    if (body.companyName !== undefined) updates.company_name = body.companyName;
    if (body.personName !== undefined) updates.person_name = body.personName;
    if (body.email !== undefined) updates.email = body.email || null;
    if (body.stage !== undefined) updates.stage = body.stage;

    if (Object.keys(updates).length) {
      await db.from("prospects").update(updates).eq("id", id);
    }

    if (body.memory) {
      await updateProspectMemory(id, body.memory as never);
    }

    const { data } = await db.from("prospects").select("*").eq("id", id).single();
    const prospect = data as ProspectRow;
    const memory = getProspectMemory(prospect);

    return jsonOk({
      prospect: {
        id: prospect.id,
        companyId: prospect.company_id,
        companyName: prospect.company_name,
        personName: prospect.person_name,
        email: prospect.email,
        ...prospectToChatShape(memory),
        memory,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid prospect update", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
