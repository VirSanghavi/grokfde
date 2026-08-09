import { z } from "zod";
import { getCompanyById, getCompanyBySlug } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import {
  getProspectMemory,
  openSession,
  prospectToChatShape,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OpenSchema = z.object({
  companyId: z.string().uuid().optional(),
  companySlug: z.string().optional(),
  prospectId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  companyName: z.string().optional(),
  personName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  /**
   * Start a deliberately new thread for an existing prospect. Without this,
   * openSession resumes their latest conversation, which is what we want on a
   * page refresh and what makes memory feel continuous. This is the explicit
   * "new conversation" action.
   */
  forceNew: z.boolean().optional(),
});

/** Create or resume a prospect conversation session */
export async function POST(req: Request) {
  try {
    const body = OpenSchema.parse(await req.json());

    let companyId = body.companyId;
    if (!companyId && body.companySlug) {
      companyId = (await getCompanyBySlug(body.companySlug)).id;
    }
    if (!companyId) {
      throw new ApiError("BAD_REQUEST", "companyId or companySlug is required", {
        status: 400,
      });
    }

    await getCompanyById(companyId);

    const session = await openSession({
      companyId,
      prospectId: body.prospectId,
      conversationId: body.conversationId,
      companyName: body.companyName,
      personName: body.personName,
      email: body.email || undefined,
      forceNew: body.forceNew,
    });

    const memory = getProspectMemory(session.prospect);

    return jsonOk(
      {
        conversation: {
          id: session.conversation.id,
          companyId: session.conversation.company_id,
          prospectId: session.conversation.prospect_id,
          createdAt: session.conversation.created_at,
          updatedAt: session.conversation.updated_at,
        },
        prospect: {
          id: session.prospect.id,
          companyName: session.prospect.company_name,
          personName: session.prospect.person_name,
          email: session.prospect.email,
          ...prospectToChatShape(memory),
          memory,
        },
      },
      201,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid conversation payload", {
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
    if (!companyId) {
      throw new ApiError("BAD_REQUEST", "companyId is required", { status: 400 });
    }

    const db = getSupabaseAdmin();
    let query = db
      .from("conversations")
      .select("*, prospects(*)")
      .eq("company_id", companyId);

    // The public prospect page calls this to list a visitor's own threads. Scoping
    // to one prospect is what makes that safe: without it the response carries every
    // other visitor's company name, person name, and stage.
    if (prospectId) query = query.eq("prospect_id", prospectId);

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new ApiError("INTERNAL_ERROR", error.message, { status: 500 });
    }

    const rows = data ?? [];

    // A thread list needs a human label. Derive it from each thread's first real
    // question in one batched query rather than N follow-up requests.
    const summaries = new Map<string, string>();
    if (rows.length > 0) {
      const ids = rows.map((r) => String((r as Record<string, unknown>).id));
      const { data: msgs } = await db
        .from("messages")
        .select("conversation_id, content, role, created_at")
        .in("conversation_id", ids)
        .eq("role", "user")
        .order("created_at", { ascending: true });
      for (const m of msgs ?? []) {
        const row = m as Record<string, unknown>;
        const key = String(row.conversation_id);
        if (summaries.has(key)) continue;
        const text = String(row.content ?? "").replace(/\s+/g, " ").trim();
        if (text) summaries.set(key, text.slice(0, 120));
      }
    }

    return jsonOk({
      conversations: rows.map((row) => {
        const r = row as Record<string, unknown>;
        const prospect = r.prospects as Record<string, unknown> | null;
        return {
          id: r.id,
          companyId: r.company_id,
          prospectId: r.prospect_id,
          updatedAt: r.updated_at,
          createdAt: r.created_at,
          // Empty when the visitor opened a thread but never sent anything. The
          // client shows an honest "no messages yet" rather than inventing a title.
          summary: summaries.get(String(r.id)) ?? "",
          prospect: prospect
            ? {
                id: prospect.id,
                companyName: prospect.company_name,
                personName: prospect.person_name,
                stage: prospect.stage,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
