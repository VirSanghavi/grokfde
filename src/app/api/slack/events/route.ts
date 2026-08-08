import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { processSlackMessage } from "@/lib/server/slack-fde";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Slack Events API endpoint.
 * Handles url_verification challenge and event_callback message events.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    // URL verification handshake
    if (body.type === "url_verification") {
      return jsonOk({ challenge: body.challenge });
    }

    if (body.type === "event_callback") {
      const event = (body.event || {}) as Record<string, unknown>;
      const teamId = String(body.team_id || "T_DEMO");

      // Ignore bot messages / message_changed noise
      if (event.bot_id || event.subtype === "bot_message") {
        return jsonOk({ ok: true, ignored: true });
      }

      if (event.type === "app_mention" || event.type === "message") {
        const text = String(event.text || "");
        // Only process mentions for channel messages
        if (event.type === "message" && !/@atlas|<@/i.test(text)) {
          return jsonOk({ ok: true, ignored: true, reason: "not_addressed" });
        }

        const result = await processSlackMessage({
          teamId,
          channelId: String(event.channel || ""),
          userId: event.user ? String(event.user) : undefined,
          text,
          ts: event.ts ? String(event.ts) : undefined,
          threadTs: event.thread_ts
            ? String(event.thread_ts)
            : event.ts
              ? String(event.ts)
              : undefined,
        });

        return jsonOk({ ok: true, result });
      }
    }

    return jsonOk({ ok: true });
  } catch (err) {
    // Slack retries on non-2xx; log and return 200 for unmapped channels
    console.error("[slack/events]", err);
    if (err instanceof ApiError && err.code === "NOT_FOUND") {
      return jsonOk({ ok: true, ignored: true, reason: "no_account_mapping" });
    }
    return errorResponse(err);
  }
}
