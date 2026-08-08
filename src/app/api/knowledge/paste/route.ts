import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { ingestTextKnowledge, sourceToPublic } from "@/lib/server/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  companyId: z.string().uuid(),
  title: z.string().min(1),
  content: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const source = await ingestTextKnowledge({
      companyId: body.companyId,
      type: "paste",
      title: body.title,
      content: body.content,
    });
    return jsonOk({ source: sourceToPublic(source) }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid paste payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
