import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";

export const runtime = "nodejs";
// Cached at the edge. The underlying pull request changes about never, and the
// marketing page must not spend a GitHub rate-limit slot per visitor.
export const revalidate = 300;

/**
 * The most recent pull request the engineer actually opened, for the marketing
 * page. Read only, one hardcoded repository, and no caller-supplied identifiers:
 * this endpoint cannot be turned into a proxy for reading arbitrary private
 * repositories with our token, which is the failure mode a "pass me an owner and
 * repo" version would have.
 *
 * The token never leaves the server. What the browser receives is a title, a
 * file list, and line counts.
 */

const OWNER = "VirSanghavi";
const REPO = "grok-fde-sandbox";
const NUMBER = 1;

type ShowcaseFile = { path: string; additions: number; deletions: number };

export async function GET() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new ApiError("SERVICE_UNAVAILABLE", "The repository is not connected.", {
        status: 503,
      });
    }

    const headers = {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    };
    const base = `https://api.github.com/repos/${OWNER}/${REPO}/pulls/${NUMBER}`;

    const [prRes, filesRes] = await Promise.all([
      fetch(base, { headers, next: { revalidate } }),
      fetch(`${base}/files?per_page=100`, { headers, next: { revalidate } }),
    ]);

    if (!prRes.ok) {
      throw new ApiError("NOT_FOUND", "That pull request could not be read.", {
        status: 502,
        details: `github ${prRes.status}`,
      });
    }

    const pr = await prRes.json();
    const rawFiles: unknown[] = filesRes.ok ? await filesRes.json() : [];
    const files: ShowcaseFile[] = rawFiles
      .map((file) => {
        const f = file as { filename?: string; additions?: number; deletions?: number };
        return {
          path: String(f.filename ?? ""),
          additions: Number(f.additions ?? 0),
          deletions: Number(f.deletions ?? 0),
        };
      })
      .filter((file) => file.path.length > 0);

    return jsonOk({
      repo: `${OWNER}/${REPO}`,
      number: NUMBER,
      title: String(pr.title ?? ""),
      state: pr.merged ? "merged" : String(pr.state ?? "open"),
      branch: String(pr.head?.ref ?? ""),
      additions: Number(pr.additions ?? 0),
      deletions: Number(pr.deletions ?? 0),
      changedFiles: Number(pr.changed_files ?? files.length),
      createdAt: String(pr.created_at ?? ""),
      url: String(pr.html_url ?? ""),
      files,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
