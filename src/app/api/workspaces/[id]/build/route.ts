import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { startBuild } from "@/lib/server/implementation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({
  planId: z.string().uuid(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json());
    const result = await startBuild({
      workspaceId: id,
      planId: body.planId,
    });
    return jsonOk({
      runId: result.runId,
      status: result.status,
      branchName: result.branchName,
      events: [
        {
          type: "implementation_started",
          label: "Build completed pipeline",
        },
      ],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "planId is required", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
