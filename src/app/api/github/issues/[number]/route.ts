import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getIssue, parseRepositoryName, unwrapGitHub } from "@/lib/server/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ number: string }> };

/** GET /api/github/issues/12?repo=owner/name — the issue and its full thread. */
export async function GET(req: Request, ctx: Params) {
  try {
    const { number } = await ctx.params;
    const issueNumber = Number(number);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
      throw new ApiError("BAD_REQUEST", "Issue number must be a positive integer", {
        status: 400,
      });
    }
    const repository = new URL(req.url).searchParams.get("repo");
    if (!repository) {
      throw new ApiError("BAD_REQUEST", "repo=owner/name is required", { status: 400 });
    }

    const ref = unwrapGitHub(parseRepositoryName(repository));
    const data = unwrapGitHub(await getIssue(ref, issueNumber));
    return jsonOk({ repository: `${ref.owner}/${ref.repo}`, ...data });
  } catch (err) {
    return errorResponse(err);
  }
}
