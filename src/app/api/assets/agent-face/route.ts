import { z } from "zod";
import {
  FACE_PROMPT_VERSION,
  faceIdleVideoPrompt,
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
    | "agent_face_idle_video_url"
    | "agent_face_idle_request_id"
    | "agent_face_voice"
    | "agent_face_prompt_version"
    | "agent_face_generated_at"
  >
>;

/**
 * Fallback cache for when the database cannot store the media — most likely
 * because supabase/migrations for the agent_face_* columns have not been
 * applied. Without this, every call regenerates and re-submits jobs, which is
 * slow and bills on each attempt. Per-instance and lossy on restart, but it
 * bounds the damage.
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

    // Postgres rejects the whole statement on one unknown column. Retry with
    // only the original columns so a partially-migrated database still caches.
    const {
      agent_face_prompt_version: _v,
      agent_face_idle_video_url: _i,
      agent_face_idle_request_id: _r,
      ...rest
    } = patch;
    if (Object.keys(rest).length !== Object.keys(patch).length) {
      const retry = await getSupabaseAdmin()
        .from("companies")
        .update(rest)
        .eq("id", companyId);
      if (!retry.error) {
        console.warn(
          "[agent-face] cached without the newer columns — apply " +
            "supabase/migrations so the idle loop and versioning persist.",
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
 * Self-hosted media wins over anything generated: drop files in /public (or
 * point at any URL) and no image or video is ever generated or billed.
 */
function envOverride() {
  const faceImageUrl = process.env.AGENT_FACE_IMAGE_URL?.trim();
  const faceVideoUrl = process.env.AGENT_FACE_VIDEO_URL?.trim();
  const idleVideoUrl = process.env.AGENT_FACE_IDLE_VIDEO_URL?.trim();
  if (!faceImageUrl && !faceVideoUrl && !idleVideoUrl) return null;
  return { faceImageUrl, faceVideoUrl, idleVideoUrl };
}

/** Collect a finished clip, or report that it is still rendering. */
async function collect(requestId: string): Promise<
  { done: true; url: string } | { done: false; dead: boolean }
> {
  const job = await getVideo(requestId);
  if (job.status === "done" && job.url) return { done: true, url: job.url };
  return { done: false, dead: job.status === "failed" || job.status === "expired" };
}

/**
 * The agent's face for calls, generated from the configured voice so the two
 * can never disagree. See lib/agent-persona.ts.
 *
 * Timing matters. Image generation is synchronous and fast, so the portrait is
 * produced inline. Video generation is a job that can take several minutes, so
 * the two loops (talking + listening) are submitted and polled across
 * subsequent requests — a call must never wait on them. Both use the portrait
 * as the image-to-video input so every asset is the same person.
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

    const override = envOverride();
    if (override) {
      return jsonOk({ available: true, source: "env", videoStatus: "ready", ...override });
    }

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
    let idleVideoUrl = stale ? undefined : cached.agent_face_idle_video_url ?? undefined;
    let talkJob = stale ? undefined : cached.agent_face_video_request_id ?? undefined;
    let idleJob = stale ? undefined : cached.agent_face_idle_request_id ?? undefined;

    // 1. Portrait — inline, fast, and the seed for both clips.
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
        agent_face_idle_video_url: null,
        agent_face_idle_request_id: null,
        agent_face_voice: persona.voice,
        agent_face_prompt_version: FACE_PROMPT_VERSION,
        agent_face_generated_at: new Date().toISOString(),
      });
      faceVideoUrl = undefined;
      idleVideoUrl = undefined;
      talkJob = undefined;
      idleJob = undefined;
    }

    // 2. The two loops — submitted once, collected on a later request.
    const clips = [
      {
        key: "talk" as const,
        url: faceVideoUrl,
        job: talkJob,
        prompt: faceVideoPrompt(persona, agentName),
        urlCol: "agent_face_video_url" as const,
        jobCol: "agent_face_video_request_id" as const,
      },
      {
        key: "idle" as const,
        url: idleVideoUrl,
        job: idleJob,
        prompt: faceIdleVideoPrompt(persona, agentName),
        urlCol: "agent_face_idle_video_url" as const,
        jobCol: "agent_face_idle_request_id" as const,
      },
    ];

    let pending = false;
    for (const clip of clips) {
      if (clip.url) continue;
      try {
        if (clip.job) {
          const result = await collect(clip.job);
          if (result.done) {
            if (clip.key === "talk") faceVideoUrl = result.url;
            else idleVideoUrl = result.url;
            await persist(companyId, { [clip.urlCol]: result.url, [clip.jobCol]: null });
          } else if (result.dead) {
            await persist(companyId, { [clip.jobCol]: null });
          } else {
            pending = true;
          }
        } else {
          const id = await submitVideo(clip.prompt, {
            // Animate the portrait, so both loops are unmistakably the same face.
            image: faceImageUrl,
            duration: 6,
            aspectRatio: "16:9",
            resolution: "720p",
          });
          pending = true;
          await persist(companyId, { [clip.jobCol]: id });
        }
      } catch (err) {
        console.warn(`[agent-face] ${clip.key} loop unavailable`, err);
      }
    }

    return jsonOk({
      available: true,
      source: "generated",
      voice: persona.voice,
      presentation: persona.presentation,
      faceImageUrl,
      faceVideoUrl,
      idleVideoUrl,
      // "pending" means the still is live and the loops land on a later call.
      videoStatus: faceVideoUrl && idleVideoUrl ? "ready" : pending ? "pending" : "none",
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
