import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { answerRepositoryIssue } from "@/lib/server/implementation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * post: false drafts a reply and returns it. post: true publishes it as a real
 * comment on the issue. Defaulting to false matters: a public comment is
 * permanent, so it has to be an explicit choice, never a side effect.
 */
const Schema = z.object({
  repository: z.string().min(3),
  companyId: z.string().uuid(),
  post: z.boolean().default(false),
  /** A human-edited body, posted verbatim instead of asking Grok again. */
  body: z.string().optional(),
});

type Params = { params: Promise<{ number: string }> };

export async function POST(req: Request, ctx: Params) {
  try {
    const { number } = await ctx.params;
    const issueNumber = Number(number);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
      throw new ApiError("BAD_REQUEST", "Issue number must be a positive integer", {
        status: 400,
      });
    }

    const body = Schema.parse(await req.json().catch(() => ({})));
    const result = await answerRepositoryIssue({
      companyId: body.companyId,
      repository: body.repository,
      issueNumber,
      post: body.post,
      body: body.body,
    });

    return jsonOk(result, result.posted ? 201 : 200);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "repository and companyId are required", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
