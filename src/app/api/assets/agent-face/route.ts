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

/**
 * Fallback cache for when the database cannot store the media — most likely
 * because supabase/migrations for the agent_face_* columns have not been
 * applied. Without this, every call regenerates a portrait and submits a fresh
 * video job, which is slow and bills on each attempt. Per-instance and lossy on
 * restart, but it bounds the damage.
 */
const memoryCache = new Map<string, FaceUpdate>();

/** Returns false when the write did not land, so callers can fall back. */
async function persist(companyId: string, patch: FaceUpdate): Promise<boolean> {
  memoryCache.set(companyId, { ...memoryCache.get(companyId), ...patch });
  try {
    // supabase-js resolves with { error } rather than throwing — an unchecked
    // update here would fail completely silently.
    const { error } = await getSupabaseAdmin()
      .from("companies")
      .update(patch)
      .eq("id", companyId);
    if (!error) return true;

    // Postgres rejects the whole statement on one unknown column. Retry without
    // the newest field so a partially-migrated database still caches the rest.
    if ("agent_face_prompt_version" in patch) {
      const { agent_face_prompt_version: _drop, ...rest } = patch;
      const retry = await getSupabaseAdmin()
        .from("companies")
        .update(rest)
        .eq("id", companyId);
      if (!retry.error) {
        console.warn(
          "[agent-face] cached without agent_face_prompt_version — apply " +
            "supabase/migrations/20260808260000_agent_face_prompt_version.sql.",
        );
        return true;
      }
    }

    console.warn(
      `[agent-face] could not cache generated media (${error.message}). ` +
        "If this mentions a missing column, apply supabase/migrations — " +
        "otherwise the face regenerates on every call.",
    );
    return false;
  } catch (err) {
    console.warn("[agent-face] could not cache generated media", err);
    return false;
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

    const row = await getCompanyById(companyId);
    const persona = personaForVoice(row.agent_voice);
    const agentName = row.agent_name || "Atlas";

    // Layer the in-process cache over the row, so a database that cannot store
    // this yet still avoids regenerating on every request.
    const cached = { ...row, ...memoryCache.get(companyId) };

    // A column that does not exist reads as undefined; one that exists but was
    // never written reads as null. Only the latter is a real version mismatch —
    // treating "column absent" as stale would regenerate forever.
    const versionKnown = cached.agent_face_prompt_version !== undefined;
    if (!versionKnown) {
      console.warn(
        "[agent-face] agent_face_prompt_version column missing — apply " +
          "supabase/migrations so framing changes can invalidate cached media.",
      );
    }

    const stale =
      refresh ||
      cached.agent_face_voice !== persona.voice ||
      (versionKnown && (cached.agent_face_prompt_version ?? 0) !== FACE_PROMPT_VERSION);

    let faceImageUrl = stale ? undefined : cached.agent_face_image_url ?? undefined;
    let faceVideoUrl = stale ? undefined : cached.agent_face_video_url ?? undefined;
    let videoRequestId = stale ? undefined : cached.agent_face_video_request_id ?? undefined;
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
