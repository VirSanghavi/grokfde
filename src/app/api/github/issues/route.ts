import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { listRepositoryIssues } from "@/lib/server/implementation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/github/issues?repo=owner/name&state=open */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const repository = url.searchParams.get("repo");
    if (!repository) {
      throw new ApiError("BAD_REQUEST", "repo=owner/name is required", { status: 400 });
    }
    const stateParam = url.searchParams.get("state");
    const state =
      stateParam === "closed" || stateParam === "all" ? stateParam : ("open" as const);

    const result = await listRepositoryIssues({ repository, state });
    return jsonOk(result);
  } catch (err) {
    return errorResponse(err);
  }
}
