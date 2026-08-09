import { errorResponse, jsonOk } from "@/lib/server/errors";
import { getAuthenticatedUser, hasGitHubToken } from "@/lib/server/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is the server actually able to touch GitHub right now? The UI asks this
 * before it offers to connect a real repository, so it never promises a
 * capability the server does not have.
 */
export async function GET() {
  try {
    if (!hasGitHubToken()) {
      return jsonOk({
        connected: false,
        reason: "No GITHUB_TOKEN is configured on the server.",
        user: null,
      });
    }
    const user = await getAuthenticatedUser();
    if (!user.ok) {
      return jsonOk({ connected: false, reason: user.message, user: null });
    }
    return jsonOk({
      connected: true,
      reason: null,
      user: {
        login: user.data.login,
        name: user.data.name,
        avatarUrl: user.data.avatarUrl,
        htmlUrl: user.data.htmlUrl,
      },
      rateLimit: user.rateLimit ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
