import { z } from "zod";
import { handleChatMessage } from "@/lib/server/chat-agent";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({
  message: z.string().min(1),
  channel: z.enum(["chat", "email"]).optional(),
  confirmedWriteTools: z.array(z.string()).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json());
    const response = await handleChatMessage({
      conversationId: id,
      message: body.message,
      channel: body.channel,
      confirmedWriteTools: body.confirmedWriteTools,
    });
    return jsonOk(response);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid message payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
