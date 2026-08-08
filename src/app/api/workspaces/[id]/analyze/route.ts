import { errorResponse, jsonOk } from "@/lib/server/errors";
import { analyzeWorkspace } from "@/lib/server/implementation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const result = await analyzeWorkspace(id);
    return jsonOk(result);
  } catch (err) {
    return errorResponse(err);
  }
}
