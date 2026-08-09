import { errorResponse, jsonOk } from "@/lib/server/errors";
import { listRepositoriesForUser, unwrapGitHub } from "@/lib/server/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Repositories the server token can push to. Read-only access is filtered out,
 * because a repository the agent cannot branch is one it cannot help with.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    const repos = unwrapGitHub(await listRepositoriesForUser({ perPage: 100 }));
    const filtered = query
      ? repos.filter(
          (r) =>
            r.fullName.toLowerCase().includes(query) ||
            (r.description || "").toLowerCase().includes(query),
        )
      : repos;
    return jsonOk({ repositories: filtered, total: filtered.length });
  } catch (err) {
    return errorResponse(err);
  }
}
