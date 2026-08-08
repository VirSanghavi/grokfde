import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import {
  createConversation,
  createProspect,
  getProspectMemory,
  prospectToChatShape,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string().optional(),
  personName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  createConversation: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const prospect = await createProspect({
      companyId: body.companyId,
      companyName: body.companyName,
      personName: body.personName,
      email: body.email || undefined,
    });

    let conversation = null;
    if (body.createConversation !== false) {
      conversation = await createConversation({
        companyId: body.companyId,
        prospectId: prospect.id,
      });
    }

    const memory = getProspectMemory(prospect);
    return jsonOk(
      {
        prospect: {
          id: prospect.id,
          companyName: prospect.company_name,
          personName: prospect.person_name,
          email: prospect.email,
          ...prospectToChatShape(memory),
          memory,
        },
        conversation: conversation
          ? {
              id: conversation.id,
              companyId: conversation.company_id,
              prospectId: conversation.prospect_id,
            }
          : null,
      },
      201,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid prospect payload", {
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
    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!companyId) {
      throw new ApiError("BAD_REQUEST", "companyId is required", { status: 400 });
    }
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("prospects")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new ApiError("INTERNAL_ERROR", error.message, { status: 500 });
    return jsonOk({
      prospects: (data ?? []).map((p) => {
        const row = p as Parameters<typeof getProspectMemory>[0];
        const memory = getProspectMemory(row);
        return {
          id: row.id,
          companyName: row.company_name,
          personName: row.person_name,
          email: row.email,
          ...prospectToChatShape(memory),
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
