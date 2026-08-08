import { z } from "zod";
import { getDeployment, upsertDeployment } from "@/lib/server/deployments";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { notifySlackDeployment } from "@/lib/server/slack-fde";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const deployment = await getDeployment(id);
    return jsonOk({ deployment });
  } catch (err) {
    return errorResponse(err);
  }
}

const Schema = z.object({
  environment: z.string().optional(),
  status: z.string(),
  version: z.string().optional(),
  checks: z.array(z.unknown()).optional(),
  metrics: z.record(z.unknown()).optional(),
  notifySlack: z.boolean().optional(),
});

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json());
    const deployment = await upsertDeployment({
      accountId: id,
      environment: body.environment,
      status: body.status,
      version: body.version,
      checks: body.checks,
      metrics: body.metrics,
    });

    let slack = null;
    if (body.notifySlack !== false && (body.status === "production" || body.status === "ready_for_production")) {
      slack = await notifySlackDeployment({
        accountId: id,
        status: body.status,
        environment: body.environment,
      });
    }

    return jsonOk({ deployment, slack });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid deployment payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
