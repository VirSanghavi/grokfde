import {
  buildDeterministicStatus,
  formatStatusNatural,
} from "@/lib/server/accounts";
import { errorResponse, jsonOk } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const status = await buildDeterministicStatus(id);
    return jsonOk({
      status,
      text: formatStatusNatural(status),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
