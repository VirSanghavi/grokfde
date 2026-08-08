import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { createImplementationPlan } from "@/lib/server/implementation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({
  objective: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json().catch(() => ({})));
    const plan = await createImplementationPlan({
      workspaceId: id,
      objective: body.objective,
    });
    return jsonOk({
      ...plan,
      events: [
        {
          type: "implementation_plan_ready",
          label: "Implementation plan ready for approval",
        },
      ],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid plan payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
