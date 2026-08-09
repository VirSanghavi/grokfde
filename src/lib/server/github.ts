/**
 * Real GitHub REST client. Plain fetch, no dependency, typed failures.
 *
 * Every call returns a GitHubResult instead of throwing. Failures carry a
 * discriminated `kind` so callers can branch on "the token is dead" versus
 * "we are rate limited" versus "that branch already exists", instead of
 * regex-matching an error string.
 *
 * Two safety rules are enforced here, in code, not in a prompt:
 *   1. Writes never target a repository's default branch. commitFiles and
 *      createPullRequest both refuse it.
 *   2. Path policy (src/lib/server/protected-paths.ts) is applied to every
 *      file in every commit, so a caller cannot forget to check.
 */

import { askGrok, textModel } from "@/lib/ai/grok";
import { ApiError } from "./errors";
import { isProtectedPath, normalizeRepoPath } from "./protected-paths";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

// ─── Result types ───────────────────────────────────────────────────

export type GitHubRateLimit = {
  limit: number | null;
  remaining: number | null;
  /** Unix seconds when the window resets. */
  resetAt: number | null;
};

export type GitHubFailureKind =
  | "no_token"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "validation"
  | "conflict"
  | "protected_path"
  | "unsafe_branch"
  | "network"
  | "server";

export type GitHubFailure = {
  ok: false;
  kind: GitHubFailureKind;
  status: number;
  message: string;
  /** GitHub's own docs link, when it sends one. */
  documentationUrl?: string;
  /** Seconds to wait, when GitHub tells us. */
  retryAfterSeconds?: number;
  rateLimit?: GitHubRateLimit;
};

export type GitHubResult<T> = { ok: true; data: T; rateLimit?: GitHubRateLimit } | GitHubFailure;

/** Route boundary helper: turn a typed failure into the app's ApiError. */
export function unwrapGitHub<T>(result: GitHubResult<T>): T {
  if (result.ok) return result.data;
  const status =
    result.kind === "not_found"
      ? 404
      : result.kind === "unauthorized" || result.kind === "no_token"
        ? 401
        : result.kind === "rate_limited"
          ? 429
          : result.kind === "validation" ||
              result.kind === "protected_path" ||
              result.kind === "unsafe_branch"
            ? 400
            : result.kind === "conflict"
              ? 409
              : 502;
  const code =
    result.kind === "not_found"
      ? "NOT_FOUND"
      : result.kind === "unauthorized" || result.kind === "no_token"
        ? "UNAUTHORIZED"
        : status === 400
          ? "BAD_REQUEST"
          : "MCP_FAILED";
  throw new ApiError(code, result.message, {
    status,
    recoverable: result.kind === "rate_limited" || result.kind === "server",
    details: {
      kind: result.kind,
      githubStatus: result.status,
      ...(result.documentationUrl ? { documentationUrl: result.documentationUrl } : {}),
      ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    },
  });
}

// ─── Token ──────────────────────────────────────────────────────────

/** Server-side only. Set GITHUB_TOKEN in .env.local; never send one from a client. */
function getGitHubToken(): string | null {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  return token.trim() ? token.trim() : null;
}

export function hasGitHubToken(): boolean {
  return getGitHubToken() !== null;
}

// ─── Transport ──────────────────────────────────────────────────────

function readRateLimit(res: Response): GitHubRateLimit {
  const num = (v: string | null) => (v === null || v === "" ? null : Number(v));
  return {
    limit: num(res.headers.get("x-ratelimit-limit")),
    remaining: num(res.headers.get("x-ratelimit-remaining")),
    resetAt: num(res.headers.get("x-ratelimit-reset")),
  };
}

function classify(status: number, rateLimit: GitHubRateLimit, retryAfter: number | null): GitHubFailureKind {
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status === 403) {
    if (rateLimit.remaining === 0 || retryAfter !== null) return "rate_limited";
    return "forbidden";
  }
  if (status >= 500) return "server";
  return "server";
}

type GitHubErrorBody = {
  message?: string;
  documentation_url?: string;
  errors?: Array<{ resource?: string; field?: string; code?: string; message?: string }>;
};

async function request<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<GitHubResult<T>> {
  const token = init.token ?? getGitHubToken();
  if (!token) {
    return {
      ok: false,
      kind: "no_token",
      status: 0,
      message: "No GitHub token configured. Set GITHUB_TOKEN in .env.local.",
    };
  }

  const url = path.startsWith("http") ? path : `${API}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", API_VERSION);
  headers.set("User-Agent", "grok-fde-atlas");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, cache: "no-store" });
  } catch (err) {
    return {
      ok: false,
      kind: "network",
      status: 0,
      message: err instanceof Error ? err.message : "Network request to GitHub failed",
    };
  }

  const rateLimit = readRateLimit(res);
  const retryAfterHeader = res.headers.get("retry-after");
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : null;

  if (!res.ok) {
    let body: GitHubErrorBody = {};
    try {
      body = (await res.json()) as GitHubErrorBody;
    } catch {
      /* GitHub sometimes returns empty or HTML on 5xx */
    }
    const kind = classify(res.status, rateLimit, retryAfter);
    const detail = (body.errors || [])
      .map((e) => e.message || `${e.field ?? ""} ${e.code ?? ""}`.trim())
      .filter(Boolean)
      .join("; ");
    const base = body.message || `GitHub request failed (${res.status})`;
    const waitSeconds =
      retryAfter ??
      (kind === "rate_limited" && rateLimit.resetAt
        ? Math.max(0, rateLimit.resetAt - Math.floor(Date.now() / 1000))
        : null);
    return {
      ok: false,
      kind,
      status: res.status,
      message:
        kind === "rate_limited" && waitSeconds !== null
          ? `${base}. Rate limited, retry in ${waitSeconds}s.`
          : detail
            ? `${base}: ${detail}`
            : base,
      documentationUrl: body.documentation_url,
      ...(waitSeconds !== null ? { retryAfterSeconds: waitSeconds } : {}),
      rateLimit,
    };
  }

  if (res.status === 204) {
    return { ok: true, data: undefined as T, rateLimit };
  }

  try {
    return { ok: true, data: (await res.json()) as T, rateLimit };
  } catch (err) {
    return {
      ok: false,
      kind: "server",
      status: res.status,
      message: err instanceof Error ? err.message : "GitHub returned a body we could not parse",
      rateLimit,
    };
  }
}

// ─── Repository identity ────────────────────────────────────────────

export type RepoRef = { owner: string; repo: string };

/** Accepts "owner/name" or any github.com URL pointing at a repository. */
export function parseRepositoryName(input: string): GitHubResult<RepoRef> {
  const raw = (input || "").trim();
  const fromUrl = raw.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  const parts = fromUrl ? [fromUrl[1], fromUrl[2]] : raw.replace(/^\/+|\/+$/g, "").split("/");
  const [owner, repo] = parts;
  if (!owner || !repo || parts.length > 2) {
    return {
      ok: false,
      kind: "validation",
      status: 400,
      message: `Repository must look like owner/name. Received "${input}".`,
    };
  }
  return { ok: true, data: { owner, repo: repo.replace(/\.git$/i, "") } };
}

// ─── Users and repositories ─────────────────────────────────────────

export type GitHubUser = {
  login: string;
  id: number;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
};

export async function getAuthenticatedUser(): Promise<GitHubResult<GitHubUser>> {
  const res = await request<{
    login: string;
    id: number;
    name: string | null;
    avatar_url: string;
    html_url: string;
  }>("/user");
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      login: res.data.login,
      id: res.data.id,
      name: res.data.name,
      avatarUrl: res.data.avatar_url,
      htmlUrl: res.data.html_url,
    },
    rateLimit: res.rateLimit,
  };
}

export type GitHubRepository = {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  pushedAt: string | null;
  openIssues: number;
  canPush: boolean;
};

type RawRepo = {
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  description: string | null;
  html_url: string;
  language: string | null;
  pushed_at: string | null;
  open_issues_count: number;
  permissions?: { push?: boolean; admin?: boolean };
};

function mapRepo(r: RawRepo): GitHubRepository {
  return {
    fullName: r.full_name,
    name: r.name,
    owner: r.owner?.login ?? r.full_name.split("/")[0],
    private: r.private,
    defaultBranch: r.default_branch,
    description: r.description,
    htmlUrl: r.html_url,
    language: r.language,
    pushedAt: r.pushed_at,
    openIssues: r.open_issues_count ?? 0,
    canPush: Boolean(r.permissions?.push || r.permissions?.admin),
  };
}

/** Repositories the token can actually write to, most recently pushed first. */
export async function listRepositoriesForUser(
  options: { perPage?: number; writableOnly?: boolean } = {},
): Promise<GitHubResult<GitHubRepository[]>> {
  const perPage = Math.min(Math.max(options.perPage ?? 50, 1), 100);
  const res = await request<RawRepo[]>(
    `/user/repos?per_page=${perPage}&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member`,
  );
  if (!res.ok) return res;
  const repos = res.data.map(mapRepo);
  return {
    ok: true,
    data: options.writableOnly === false ? repos : repos.filter((r) => r.canPush),
    rateLimit: res.rateLimit,
  };
}

export async function getRepository(ref: RepoRef): Promise<GitHubResult<GitHubRepository>> {
  const res = await request<RawRepo>(`/repos/${ref.owner}/${ref.repo}`);
  if (!res.ok) return res;
  return { ok: true, data: mapRepo(res.data), rateLimit: res.rateLimit };
}

// ─── Tree and file contents ─────────────────────────────────────────

export type RepoTreeEntry = {
  path: string;
  type: "file" | "dir";
  size: number | null;
  sha: string;
};

export async function getRepositoryTree(
  ref: RepoRef,
  branch: string,
): Promise<GitHubResult<{ entries: RepoTreeEntry[]; truncated: boolean; sha: string }>> {
  const head = await getBranchHeadSha(ref, branch);
  if (!head.ok) return head;
  const res = await request<{
    sha: string;
    truncated: boolean;
    tree: Array<{ path: string; type: string; size?: number; sha: string }>;
  }>(`/repos/${ref.owner}/${ref.repo}/git/trees/${head.data}?recursive=1`);
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      sha: res.data.sha,
      truncated: Boolean(res.data.truncated),
      entries: (res.data.tree || [])
        .filter((t) => t.type === "blob" || t.type === "tree")
        .map((t) => ({
          path: t.path,
          type: t.type === "tree" ? ("dir" as const) : ("file" as const),
          size: t.size ?? null,
          sha: t.sha,
        })),
    },
    rateLimit: res.rateLimit,
  };
}

/** UTF-8 text of a file at a ref. Binary and oversized files come back as a failure. */
export async function getFileContents(
  ref: RepoRef,
  filePath: string,
  branch: string,
): Promise<GitHubResult<string>> {
  const clean = normalizeRepoPath(filePath);
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  const res = await request<{ content?: string; encoding?: string; size?: number; type?: string }>(
    `/repos/${ref.owner}/${ref.repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return res;
  if (res.data.type && res.data.type !== "file") {
    return {
      ok: false,
      kind: "validation",
      status: 400,
      message: `${clean} is a ${res.data.type}, not a file.`,
    };
  }
  if (!res.data.content) {
    // Files over 1MB come back with an empty content field.
    return { ok: true, data: "", rateLimit: res.rateLimit };
  }
  const text = Buffer.from(res.data.content, (res.data.encoding as BufferEncoding) || "base64").toString(
    "utf8",
  );
  return { ok: true, data: text, rateLimit: res.rateLimit };
}

// ─── Branches ───────────────────────────────────────────────────────

async function getBranchHeadSha(ref: RepoRef, branch: string): Promise<GitHubResult<string>> {
  const res = await request<{ object: { sha: string } }>(
    `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data.object.sha, rateLimit: res.rateLimit };
}

/**
 * Absolute rule: the agent never writes to the branch a repository deploys from.
 * Every write path calls this, so there is no code path that can skip it.
 */
function assertWritableBranch(branch: string, defaultBranch: string): GitHubFailure | null {
  const b = (branch || "").trim();
  if (!b) {
    return { ok: false, kind: "unsafe_branch", status: 400, message: "Branch name is required." };
  }
  if (b === defaultBranch) {
    return {
      ok: false,
      kind: "unsafe_branch",
      status: 400,
      message: `Refusing to write to the default branch "${defaultBranch}". Grok FDE only ever commits to a new branch and opens a pull request.`,
    };
  }
  if (/^(main|master|production|prod|release|develop)$/i.test(b)) {
    return {
      ok: false,
      kind: "unsafe_branch",
      status: 400,
      message: `Refusing to write to a long-lived branch "${b}".`,
    };
  }
  if (!/^[A-Za-z0-9._\-/]+$/.test(b) || b.includes("..") || b.endsWith("/")) {
    return {
      ok: false,
      kind: "unsafe_branch",
      status: 400,
      message: `Invalid branch name "${b}".`,
    };
  }
  return null;
}

/** Creates `branch` at the head of `fromBranch`. Existing branch is not an error. */
export async function createBranch(args: {
  ref: RepoRef;
  branch: string;
  fromBranch: string;
  defaultBranch: string;
}): Promise<GitHubResult<{ branch: string; sha: string; created: boolean }>> {
  const unsafe = assertWritableBranch(args.branch, args.defaultBranch);
  if (unsafe) return unsafe;

  const existing = await getBranchHeadSha(args.ref, args.branch);
  if (existing.ok) {
    return { ok: true, data: { branch: args.branch, sha: existing.data, created: false } };
  }
  if (existing.kind !== "not_found") return existing;

  const base = await getBranchHeadSha(args.ref, args.fromBranch);
  if (!base.ok) return base;

  const created = await request<{ object: { sha: string } }>(
    `/repos/${args.ref.owner}/${args.ref.repo}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: base.data }),
    },
  );
  if (!created.ok) return created;
  return {
    ok: true,
    data: { branch: args.branch, sha: created.data.object.sha, created: true },
    rateLimit: created.rateLimit,
  };
}

// ─── Commit (multiple files, one commit, git data API) ──────────────

export type CommitFileChange = {
  path: string;
  operation: "create" | "modify" | "delete";
  /** Required for create and modify. */
  content?: string;
};

export type CommitResult = {
  sha: string;
  htmlUrl: string;
  branch: string;
  files: Array<{ path: string; operation: CommitFileChange["operation"] }>;
};

/**
 * Blobs, then a tree on top of the branch's current tree, then a commit, then
 * one ref update. Every file lands in a single commit, which is what a human
 * reviewer expects to see in a pull request.
 */
export async function commitFiles(args: {
  ref: RepoRef;
  branch: string;
  defaultBranch: string;
  message: string;
  files: CommitFileChange[];
  author?: { name: string; email: string };
}): Promise<GitHubResult<CommitResult>> {
  const unsafe = assertWritableBranch(args.branch, args.defaultBranch);
  if (unsafe) return unsafe;

  if (!args.files.length) {
    return { ok: false, kind: "validation", status: 400, message: "No files to commit." };
  }

  // Path policy is enforced here so no caller can bypass it.
  const blocked = args.files
    .map((f) => normalizeRepoPath(f.path))
    .filter((p) => isProtectedPath(p) && p !== ".env.example");
  if (blocked.length) {
    return {
      ok: false,
      kind: "protected_path",
      status: 400,
      message: `Refusing to commit protected paths: ${blocked.join(", ")}`,
    };
  }
  const deletes = args.files.filter((f) => f.operation === "delete");
  if (deletes.length) {
    return {
      ok: false,
      kind: "protected_path",
      status: 400,
      message: `Deletes are not allowed in a Grok FDE run: ${deletes
        .map((d) => normalizeRepoPath(d.path))
        .join(", ")}`,
    };
  }
  const missing = args.files.filter((f) => typeof f.content !== "string");
  if (missing.length) {
    return {
      ok: false,
      kind: "validation",
      status: 400,
      message: `Missing content for: ${missing.map((f) => f.path).join(", ")}`,
    };
  }

  const headSha = await getBranchHeadSha(args.ref, args.branch);
  if (!headSha.ok) return headSha;

  const headCommit = await request<{ tree: { sha: string } }>(
    `/repos/${args.ref.owner}/${args.ref.repo}/git/commits/${headSha.data}`,
  );
  if (!headCommit.ok) return headCommit;

  // 1. Blobs
  const treeItems: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  for (const file of args.files) {
    const blob = await request<{ sha: string }>(
      `/repos/${args.ref.owner}/${args.ref.repo}/git/blobs`,
      {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(file.content ?? "", "utf8").toString("base64"),
          encoding: "base64",
        }),
      },
    );
    if (!blob.ok) return blob;
    treeItems.push({
      path: normalizeRepoPath(file.path),
      mode: "100644",
      type: "blob",
      sha: blob.data.sha,
    });
  }

  // 2. Tree layered on the branch's existing tree
  const tree = await request<{ sha: string }>(`/repos/${args.ref.owner}/${args.ref.repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: headCommit.data.tree.sha, tree: treeItems }),
  });
  if (!tree.ok) return tree;

  // 3. Commit
  const commit = await request<{ sha: string; html_url: string }>(
    `/repos/${args.ref.owner}/${args.ref.repo}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: args.message,
        tree: tree.data.sha,
        parents: [headSha.data],
        ...(args.author ? { author: args.author } : {}),
      }),
    },
  );
  if (!commit.ok) return commit;

  // 4. Move the branch ref. force stays false so a concurrent push wins.
  const updated = await request<{ object: { sha: string } }>(
    `/repos/${args.ref.owner}/${args.ref.repo}/git/refs/heads/${encodeURIComponent(args.branch)}`,
    { method: "PATCH", body: JSON.stringify({ sha: commit.data.sha, force: false }) },
  );
  if (!updated.ok) return updated;

  return {
    ok: true,
    data: {
      sha: commit.data.sha,
      htmlUrl: commit.data.html_url,
      branch: args.branch,
      files: args.files.map((f) => ({ path: normalizeRepoPath(f.path), operation: f.operation })),
    },
    rateLimit: updated.rateLimit,
  };
}

// ─── Compare (real diff) ────────────────────────────────────────────

export type ComparedFile = {
  path: string;
  operation: "create" | "modify" | "delete" | "rename";
  additions: number;
  deletions: number;
  patch: string;
};

export async function compareBranches(
  ref: RepoRef,
  base: string,
  head: string,
): Promise<GitHubResult<{ files: ComparedFile[]; aheadBy: number; htmlUrl: string }>> {
  const res = await request<{
    ahead_by: number;
    html_url: string;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;
  }>(
    `/repos/${ref.owner}/${ref.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  );
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      aheadBy: res.data.ahead_by,
      htmlUrl: res.data.html_url,
      files: (res.data.files || []).map((f) => ({
        path: f.filename,
        operation:
          f.status === "added"
            ? ("create" as const)
            : f.status === "removed"
              ? ("delete" as const)
              : f.status === "renamed"
                ? ("rename" as const)
                : ("modify" as const),
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        patch: f.patch ?? "",
      })),
    },
    rateLimit: res.rateLimit,
  };
}

// ─── Pull requests ──────────────────────────────────────────────────

export type PullRequest = {
  number: number;
  htmlUrl: string;
  title: string;
  state: string;
  draft: boolean;
  head: string;
  base: string;
  createdAt: string;
};

export async function createPullRequest(args: {
  ref: RepoRef;
  head: string;
  base: string;
  defaultBranch: string;
  title: string;
  body: string;
  draft?: boolean;
}): Promise<GitHubResult<PullRequest>> {
  const unsafe = assertWritableBranch(args.head, args.defaultBranch);
  if (unsafe) return unsafe;
  if (args.head === args.base) {
    return {
      ok: false,
      kind: "unsafe_branch",
      status: 400,
      message: "A pull request cannot have the same head and base branch.",
    };
  }

  const res = await request<{
    number: number;
    html_url: string;
    title: string;
    state: string;
    draft: boolean;
    created_at: string;
  }>(`/repos/${args.ref.owner}/${args.ref.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: args.title,
      head: args.head,
      base: args.base,
      body: args.body,
      draft: Boolean(args.draft),
      maintainer_can_modify: true,
    }),
  });

  if (!res.ok) {
    // An open PR for this branch already exists: return it instead of failing.
    if (res.kind === "validation") {
      const open = await listPullRequestsForBranch(args.ref, args.head);
      if (open.ok && open.data.length) {
        return { ok: true, data: open.data[0] };
      }
    }
    return res;
  }

  return {
    ok: true,
    data: {
      number: res.data.number,
      htmlUrl: res.data.html_url,
      title: res.data.title,
      state: res.data.state,
      draft: res.data.draft,
      head: args.head,
      base: args.base,
      createdAt: res.data.created_at,
    },
    rateLimit: res.rateLimit,
  };
}

async function listPullRequestsForBranch(
  ref: RepoRef,
  head: string,
): Promise<GitHubResult<PullRequest[]>> {
  const res = await request<
    Array<{
      number: number;
      html_url: string;
      title: string;
      state: string;
      draft: boolean;
      created_at: string;
      head: { ref: string };
      base: { ref: string };
    }>
  >(`/repos/${ref.owner}/${ref.repo}/pulls?state=open&head=${ref.owner}:${encodeURIComponent(head)}`);
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.map((p) => ({
      number: p.number,
      htmlUrl: p.html_url,
      title: p.title,
      state: p.state,
      draft: p.draft,
      head: p.head.ref,
      base: p.base.ref,
      createdAt: p.created_at,
    })),
    rateLimit: res.rateLimit,
  };
}

// ─── Issues ─────────────────────────────────────────────────────────

export type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  htmlUrl: string;
  author: string;
  authorAvatarUrl: string;
  labels: string[];
  comments: number;
  createdAt: string;
  updatedAt: string;
};

type RawIssue = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  user: { login: string; avatar_url: string } | null;
  labels: Array<string | { name?: string }>;
  comments: number;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
};

function mapIssue(i: RawIssue): GitHubIssue {
  return {
    number: i.number,
    title: i.title,
    body: i.body ?? "",
    state: i.state === "closed" ? "closed" : "open",
    htmlUrl: i.html_url,
    author: i.user?.login ?? "unknown",
    authorAvatarUrl: i.user?.avatar_url ?? "",
    labels: (i.labels || [])
      .map((l) => (typeof l === "string" ? l : l?.name))
      .filter((l): l is string => Boolean(l)),
    comments: i.comments ?? 0,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

/** Issues only. GitHub returns pull requests from this endpoint too; they are filtered out. */
export async function listIssues(
  ref: RepoRef,
  options: { state?: "open" | "closed" | "all"; perPage?: number } = {},
): Promise<GitHubResult<GitHubIssue[]>> {
  const state = options.state ?? "open";
  const perPage = Math.min(Math.max(options.perPage ?? 30, 1), 100);
  const res = await request<RawIssue[]>(
    `/repos/${ref.owner}/${ref.repo}/issues?state=${state}&per_page=${perPage}&sort=updated&direction=desc`,
  );
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.filter((i) => !i.pull_request).map(mapIssue),
    rateLimit: res.rateLimit,
  };
}

export type IssueComment = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  htmlUrl: string;
};

export async function getIssue(
  ref: RepoRef,
  issueNumber: number,
): Promise<GitHubResult<{ issue: GitHubIssue; comments: IssueComment[] }>> {
  const issue = await request<RawIssue>(`/repos/${ref.owner}/${ref.repo}/issues/${issueNumber}`);
  if (!issue.ok) return issue;
  if (issue.data.pull_request) {
    return {
      ok: false,
      kind: "validation",
      status: 400,
      message: `#${issueNumber} is a pull request, not an issue.`,
    };
  }

  const comments = await request<
    Array<{ id: number; body: string | null; created_at: string; html_url: string; user: { login: string } | null }>
  >(`/repos/${ref.owner}/${ref.repo}/issues/${issueNumber}/comments?per_page=100`);
  if (!comments.ok) return comments;

  return {
    ok: true,
    data: {
      issue: mapIssue(issue.data),
      comments: comments.data.map((c) => ({
        id: c.id,
        author: c.user?.login ?? "unknown",
        body: c.body ?? "",
        createdAt: c.created_at,
        htmlUrl: c.html_url,
      })),
    },
    rateLimit: comments.rateLimit,
  };
}

export async function createIssueComment(
  ref: RepoRef,
  issueNumber: number,
  body: string,
): Promise<GitHubResult<IssueComment>> {
  if (!body.trim()) {
    return { ok: false, kind: "validation", status: 400, message: "Comment body is empty." };
  }
  const res = await request<{
    id: number;
    body: string | null;
    created_at: string;
    html_url: string;
    user: { login: string } | null;
  }>(`/repos/${ref.owner}/${ref.repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      id: res.data.id,
      author: res.data.user?.login ?? "unknown",
      body: res.data.body ?? "",
      createdAt: res.data.created_at,
      htmlUrl: res.data.html_url,
    },
    rateLimit: res.rateLimit,
  };
}

// ─── Drafting a technical reply to an issue ─────────────────────────

function issueReplySystem(agentName: string): string {
  return `You are ${agentName}, a forward-deployed engineer employed by the vendor named below.
You are replying in public on a customer's GitHub issue. Your reply is read by
engineers, so it must be technically substantive.

Rules:
- Answer the actual question. Reference the specific files, symbols, or error
  text the reporter mentioned.
- Use only the vendor knowledge provided. If the knowledge does not cover
  something, say plainly what you do not know and what you would need to check.
  Never invent an API, a version number, a price, or a config key.
- Give the concrete next step: the code change, the command, or the question
  that unblocks them.
- Markdown. Short paragraphs. Fenced code blocks for code. No headings above
  level 3, no emoji, no marketing language, no em dashes.
- Sign off as a single line: "${agentName}, forward-deployed engineer".
- 120 to 300 words unless the question genuinely needs more.`;
}

/**
 * The house style bans em dashes, and a model will still reach for one now and
 * then. Fix it on the way out rather than hoping the prompt held, since this
 * text gets posted in public under the vendor's name. Code fences are left
 * alone so a real em dash inside a snippet survives.
 */
function stripEmDashes(text: string): string {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((chunk) =>
      chunk.startsWith("```") ? chunk : chunk.replace(/\s*[—–]\s*/g, ", ").replace(/\s+--\s+/g, ", "),
    )
    .join("");
}

export type IssueReplyDraft = {
  body: string;
  model: string;
  issueNumber: number;
  repository: string;
};

/**
 * Drafts a reply using the real Grok text model and the company's own knowledge.
 * Drafting never posts. Posting is a separate, explicit call.
 */
export async function draftIssueReply(args: {
  repository: string;
  issue: GitHubIssue;
  comments: IssueComment[];
  /** The company's own agent name. Never a hardcoded persona. */
  agentName: string;
  vendorName: string;
  vendorKnowledge: string;
  repoContext?: string;
}): Promise<GitHubResult<IssueReplyDraft>> {
  const thread = args.comments
    .slice(-8)
    .map((c) => `@${c.author} wrote:\n${c.body.slice(0, 2000)}`)
    .join("\n\n---\n\n");

  const userPrompt = [
    `Vendor: ${args.vendorName}`,
    "",
    "Vendor knowledge (the only source of truth about the vendor's product):",
    args.vendorKnowledge.slice(0, 12000),
    "",
    args.repoContext ? `Customer repository context:\n${args.repoContext.slice(0, 6000)}\n` : "",
    `Repository: ${args.repository}`,
    `Issue #${args.issue.number}: ${args.issue.title}`,
    args.issue.labels.length ? `Labels: ${args.issue.labels.join(", ")}` : "",
    "",
    `Opened by @${args.issue.author}:`,
    args.issue.body.slice(0, 6000) || "(no description)",
    thread ? `\n\nThread so far:\n${thread}` : "",
    "",
    "Write the reply body only. No preamble, no quoting of these instructions.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await askGrok({
      messages: [
        { role: "system", content: issueReplySystem(args.agentName) },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      reasoningEffort: "low",
      maxOutputTokens: 1400,
    });
    const body = stripEmDashes(result.content.trim());
    if (!body) {
      return {
        ok: false,
        kind: "server",
        status: 502,
        message: "Grok returned an empty reply. Nothing was posted.",
      };
    }
    return {
      ok: true,
      data: {
        body,
        model: textModel(),
        issueNumber: args.issue.number,
        repository: args.repository,
      },
    };
  } catch (err) {
    return {
      ok: false,
      kind: "server",
      status: 502,
      message: err instanceof Error ? err.message : "Could not draft a reply with Grok.",
    };
  }
}
