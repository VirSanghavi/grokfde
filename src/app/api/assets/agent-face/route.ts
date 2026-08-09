import { z } from "zod";
import {
  FACE_PROMPT_VERSION,
  facePortraitPrompt,
  faceVideoPrompt,
  personaForVoice,
} from "@/lib/agent-persona";
import { generateImage, getVideo, submitVideo } from "@/lib/ai/grok";
import { getCompanyById } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { CompanyRow } from "@/lib/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Query = z.object({
  companyId: z.string().uuid(),
  /** Discard cached media and generate again. */
  refresh: z.coerce.boolean().optional(),
});

type FaceUpdate = Partial<
  Pick<
    CompanyRow,
    | "agent_face_image_url"
    | "agent_face_video_url"
    | "agent_face_video_request_id"
    | "agent_face_voice"
    | "agent_face_prompt_version"
    | "agent_face_generated_at"
  >
>;

async function persist(companyId: string, patch: FaceUpdate) {
  try {
    await getSupabaseAdmin().from("companies").update(patch).eq("id", companyId);
  } catch (err) {
    // Serve what we generated even if caching failed.
    console.warn("[agent-face] could not cache generated media", err);
  }
}

/**
 * The agent's face for calls, generated from the configured voice so the two
 * can never disagree. See lib/agent-persona.ts.
 *
 * Timing matters here. Image generation is synchronous and fast, so the
 * portrait is produced inline. Video generation is a job that can take several
 * minutes, so it is submitted and polled across subsequent requests — a call
 * must never wait on it. The portrait is used as the image-to-video input so
 * the clip is unmistakably the same person as the still.
 *
 * Always degrades rather than failing: a call still connects with no face.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { companyId, refresh } = Query.parse({
      companyId: url.searchParams.get("companyId"),
      refresh: url.searchParams.get("refresh") ?? undefined,
    });

    const company = await getCompanyById(companyId);
    const persona = personaForVoice(company.agent_voice);
    const agentName = company.agent_name || "Atlas";
    // Either a different voice or newer framing means the cached media is wrong.
    const stale =
      refresh ||
      company.agent_face_voice !== persona.voice ||
      (company.agent_face_prompt_version ?? 0) !== FACE_PROMPT_VERSION;

    let faceImageUrl = stale ? undefined : company.agent_face_image_url ?? undefined;
    let faceVideoUrl = stale ? undefined : company.agent_face_video_url ?? undefined;
    let videoRequestId = stale ? undefined : company.agent_face_video_request_id ?? undefined;
    let videoStatus: "none" | "pending" | "ready" | "failed" = faceVideoUrl ? "ready" : "none";

    // 1. Portrait — inline, fast.
    if (!faceImageUrl) {
      try {
        const image = await generateImage(facePortraitPrompt(persona, agentName), {
          // Match the 16:9 call stage so the head is never cropped to fit.
          aspectRatio: "16:9",
          resolution: "720p",
        });
        faceImageUrl =
          image.url ?? (image.b64 ? `data:image/png;base64,${image.b64}` : undefined);
      } catch (err) {
        console.warn("[agent-face] portrait generation failed", err);
      }

      if (!faceImageUrl) {
        return jsonOk({
          available: false,
          voice: persona.voice,
          presentation: persona.presentation,
          message:
            "Face generation unavailable — the call falls back to the initials avatar.",
        });
      }

      await persist(companyId, {
        agent_face_image_url: faceImageUrl,
        agent_face_video_url: null,
        agent_face_video_request_id: null,
        agent_face_voice: persona.voice,
        agent_face_prompt_version: FACE_PROMPT_VERSION,
        agent_face_generated_at: new Date().toISOString(),
      });
      videoRequestId = undefined;
      videoStatus = "none";
    }

    // 2. Talking clip — submitted once, collected on a later request.
    if (!faceVideoUrl) {
      if (videoRequestId) {
        try {
          const job = await getVideo(videoRequestId);
          if (job.status === "done" && job.url) {
            faceVideoUrl = job.url;
            videoStatus = "ready";
            await persist(companyId, {
              agent_face_video_url: job.url,
              agent_face_video_request_id: null,
            });
          } else if (job.status === "failed" || job.status === "expired") {
            videoStatus = "failed";
            await persist(companyId, { agent_face_video_request_id: null });
          } else {
            videoStatus = "pending";
          }
        } catch (err) {
          console.warn("[agent-face] video poll failed", err);
          videoStatus = "pending";
        }
      } else {
        try {
          const id = await submitVideo(faceVideoPrompt(persona, agentName), {
            // Animate the portrait we just made, so the clip is the same face.
            image: faceImageUrl,
            duration: 6,
            aspectRatio: "16:9",
            resolution: "720p",
          });
          videoRequestId = id;
          videoStatus = "pending";
          await persist(companyId, { agent_face_video_request_id: id });
        } catch (err) {
          console.warn("[agent-face] could not submit talking clip", err);
          videoStatus = "failed";
        }
      }
    }

    return jsonOk({
      available: true,
      voice: persona.voice,
      presentation: persona.presentation,
      faceImageUrl,
      faceVideoUrl,
      // "pending" means the still is live and the clip will appear on a later call.
      videoStatus,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "companyId is required", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
