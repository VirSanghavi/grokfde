import { buildAccountSnapshot } from "@/lib/server/accounts";
import { errorResponse, jsonOk } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const account = await buildAccountSnapshot(id);
    return jsonOk({ account });
  } catch (err) {
    return errorResponse(err);
  }
}
