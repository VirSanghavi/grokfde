import { z } from "zod";
import { generateImage } from "@/lib/ai/grok";
import { getCompanyById } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import {
  getConversationBundle,
  getProspectMemory,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { parseKnowledgeSummary } from "@/lib/server/merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({
  conversationId: z.string().uuid(),
  prompt: z.string().optional(),
  style: z.enum(["technical", "executive"]).optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const { conversation, prospect, companyId } = await getConversationBundle(
      body.conversationId,
    );
    const company = await getCompanyById(companyId);
    const memory = getProspectMemory(prospect);
    const knowledge = parseKnowledgeSummary(company.knowledge_summary_json);
    const style = body.style ?? "technical";

    const prompt =
      body.prompt ||
      (style === "executive"
        ? `Clean executive diagram, flat modern design, no text overflow: Current state vs with ${company.name}. Prospect stack: ${memory.currentStack.join(", ") || "enterprise systems"}. Value: ${knowledge.valueProposition || company.description || "AI forward-deployed engineer"}. White background, professional product marketing style.`
        : `Technical architecture diagram, clean lines, labeled boxes: Prospect systems (${memory.currentStack.join(", ") || "existing stack"}) integrating with ${company.name} FDE layer, knowledge collections, MCP tools, chat/email/voice channels. Blueprint style, high contrast, readable labels.`);

    let url: string | undefined;
    let b64: string | undefined;
    let errorDetail: string | undefined;

    try {
      const image = await generateImage(prompt);
      url = image.url;
      b64 = image.b64;
    } catch (err) {
      errorDetail = err instanceof Error ? err.message : "image failed";
    }

    const db = getSupabaseAdmin();
    const { data: asset, error } = await db
      .from("generated_assets")
      .insert({
        conversation_id: conversation.id,
        type: "image",
        content_json: {
          style,
          url,
          b64: b64 ? "[omitted from list]" : undefined,
          hasB64: Boolean(b64),
          errorDetail,
        },
        url: url ?? null,
        prompt,
      })
      .select("id, type, url, prompt, created_at, content_json")
      .single();

    if (error || !asset) {
      throw new ApiError("INTERNAL_ERROR", "Could not save image asset", {
        status: 500,
        details: error?.message,
      });
    }

    if (!url && !b64) {
      // Structured architecture still available via /api/assets/architecture
      return jsonOk({
        id: asset.id,
        type: "image",
        status: "failed",
        prompt,
        message:
          "Image generation failed. Use /api/assets/architecture for structured diagram.",
        events: [{ type: "generating_image", label: "Image generation failed" }],
      });
    }

    return jsonOk({
      id: asset.id,
      type: "image",
      url,
      b64,
      prompt,
      events: [{ type: "generating_image", label: "Generated prospect collateral" }],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid image request", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
