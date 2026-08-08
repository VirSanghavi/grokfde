import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { connectSlackChannel } from "@/lib/server/slack-fde";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  accountId: z.string().uuid(),
  teamId: z.string().optional(),
  workspaceName: z.string().optional(),
  channelId: z.string().min(1),
  channelName: z.string().optional(),
  botUserId: z.string().optional(),
  accessToken: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const connection = await connectSlackChannel(body);
    return jsonOk({ connection }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid Slack connect payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
