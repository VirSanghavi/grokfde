import { errorResponse, jsonOk } from "@/lib/server/errors";
import { getImplementationRun } from "@/lib/server/implementation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const run = await getImplementationRun(id);
    return jsonOk(run);
  } catch (err) {
    return errorResponse(err);
  }
}
