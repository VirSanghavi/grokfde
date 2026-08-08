import { errorResponse, jsonOk } from "@/lib/server/errors";
import { createPullRequestForRun } from "@/lib/server/implementation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const pr = await createPullRequestForRun(id);
    return jsonOk({
      ...pr,
      events: [
        {
          type: "pr_ready",
          label: `PR ready: ${pr.pullRequestUrl}`,
        },
      ],
    });
  } catch (err) {
    return errorResponse(err);
  }
}
