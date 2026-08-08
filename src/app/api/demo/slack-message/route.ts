import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { processSlackMessage } from "@/lib/server/slack-fde";
import { getDemoSlackPosts } from "@/lib/server/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Demo/dev-only path that uses the SAME Slack message processor as real events.
 * Enable with NODE_ENV!=production or ALLOW_DEMO_SLACK=true.
 */
const Schema = z.object({
  accountId: z.string().uuid(),
  user: z.string().default("Jordan"),
  text: z.string().min(1),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  teamId: z.string().optional(),
  threadTs: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const allow =
      process.env.ALLOW_DEMO_SLACK === "true" ||
      process.env.NODE_ENV !== "production";
    if (!allow) {
      throw new ApiError("UNAUTHORIZED", "Demo Slack endpoint disabled", {
        status: 403,
      });
    }

    const body = Schema.parse(await req.json());
    const channelId = body.channelId || `C_DEMO_${body.accountId.slice(0, 8)}`;

    const result = await processSlackMessage({
      accountId: body.accountId,
      teamId: body.teamId || "T_DEMO",
      channelId,
      channelName: body.channelName || "globex-grok-fde",
      userName: body.user,
      text: body.text.includes("@Atlas") || body.text.includes("@atlas")
        ? body.text
        : `@Atlas ${body.text}`,
      ts: `${Date.now() / 1000}.000001`,
      threadTs: body.threadTs,
    });

    return jsonOk({
      result,
      demoPosts: getDemoSlackPosts().slice(-5),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid demo slack payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
