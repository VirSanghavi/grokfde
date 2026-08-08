import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { aggregateFieldSignals, recordFieldSignal } from "@/lib/server/field-signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const companyId = new URL(req.url).searchParams.get("companyId") || undefined;
    const signals = await aggregateFieldSignals(companyId);
    return jsonOk({ signals });
  } catch (err) {
    return errorResponse(err);
  }
}

const Schema = z.object({
  companyId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  type: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  key: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const signal = await recordFieldSignal(body);
    return jsonOk({ signal }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid field signal", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
