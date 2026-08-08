import { z } from "zod";
import { generateVideo } from "@/lib/ai/grok";
import { getCompanyById } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import {
  getConversationBundle,
  getProspectMemory,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({
  conversationId: z.string().uuid(),
  prompt: z.string().optional(),
});

/** Optional P2: short personalized explainer via Grok Imagine Video */
export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const { conversation, prospect, companyId } = await getConversationBundle(
      body.conversationId,
    );
    const company = await getCompanyById(companyId);
    const memory = getProspectMemory(prospect);

    const prompt =
      body.prompt ||
      `10-second product explainer: how ${company.name} works for a company using ${memory.currentStack.join(", ") || "modern cloud infrastructure"}. Clean tech aesthetic, architecture morphing from current stack to integrated FDE layer.`;

    try {
      const video = await generateVideo(prompt);
      const db = getSupabaseAdmin();
      const { data: asset } = await db
        .from("generated_assets")
        .insert({
          conversation_id: conversation.id,
          type: "video",
          content_json: { url: video.url },
          url: video.url ?? null,
          prompt,
        })
        .select("id, type, url, prompt, created_at")
        .single();

      return jsonOk({
        id: asset?.id,
        type: "video",
        url: video.url,
        prompt,
      });
    } catch (err) {
      return jsonOk({
        type: "video",
        status: "unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Video generation unavailable. Core demo does not depend on video.",
        prompt,
      });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid video request", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
