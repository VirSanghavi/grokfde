import { promises as fs } from "fs";
import path from "path";
import { ApiError } from "./errors";
import { isProtectedPath, normalizeRepoPath } from "./protected-paths";

export type RepoFileEntry = {
  path: string;
  type: "file" | "dir";
};

export type RepoWriteOp = {
  path: string;
  operation: "create" | "modify" | "delete";
  content?: string;
};

export type PullRequestResult = {
  status: "ready" | "simulated";
  pullRequestUrl: string;
  branchName: string;
  title: string;
  number?: number;
};

export interface RepositoryAdapter {
  provider: "demo" | "github";
  repositoryName: string;
  defaultBranch: string;
  listRepositoryFiles(prefix?: string): Promise<RepoFileEntry[]>;
  readRepositoryFile(filePath: string): Promise<string>;
  searchRepository(query: string): Promise<Array<{ path: string; line: number; preview: string }>>;
  createBranch(branchName: string, fromBranch?: string): Promise<{ branchName: string }>;
  writeFilesToBranch(branchName: string, ops: RepoWriteOp[]): Promise<void>;
  getDiff(branchName: string): Promise<Array<{ path: string; operation: string; diff: string }>>;
  createPullRequest(args: {
    branchName: string;
    title: string;
    body: string;
  }): Promise<PullRequestResult>;
}

// ─── Demo adapter (in-memory branches over fixture files) ───────────

type DemoBranchState = {
  files: Map<string, string>;
  baseBranch: string;
};

const demoBranchStore = new Map<string, DemoBranchState>();

function demoStoreKey(repoName: string, branch: string) {
  return `${repoName}::${branch}`;
}

async function loadFixtureTree(root: string, rel = ""): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const abs = path.join(root, rel);
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const nested = await loadFixtureTree(root, childRel);
      for (const [k, v] of nested) out.set(k, v);
    } else if (entry.isFile()) {
      const content = await fs.readFile(path.join(root, childRel), "utf8");
      out.set(childRel.replace(/\\/g, "/"), content);
    }
  }
  return out;
}

export class DemoRepositoryAdapter implements RepositoryAdapter {
  provider: "demo" = "demo";
  repositoryName: string;
  defaultBranch = "main";
  private fixtureRoot: string;

  constructor(repositoryName = "globex/platform") {
    this.repositoryName = repositoryName;
    this.fixtureRoot = path.join(process.cwd(), "src/lib/fixtures/demo-repo");
  }

  private async ensureBase(): Promise<DemoBranchState> {
    const key = demoStoreKey(this.repositoryName, this.defaultBranch);
    let state = demoBranchStore.get(key);
    if (!state) {
      const files = await loadFixtureTree(this.fixtureRoot);
      state = { files, baseBranch: this.defaultBranch };
      demoBranchStore.set(key, state);
    }
    return state;
  }

  private getBranch(branchName: string): DemoBranchState {
    const key = demoStoreKey(this.repositoryName, branchName);
    const state = demoBranchStore.get(key);
    if (!state) {
      throw new ApiError("NOT_FOUND", `Branch not found: ${branchName}`, { status: 404 });
    }
    return state;
  }

  async listRepositoryFiles(prefix = ""): Promise<RepoFileEntry[]> {
    const base = await this.ensureBase();
    const p = normalizeRepoPath(prefix);
    const files: RepoFileEntry[] = [];
    const dirs = new Set<string>();
    for (const filePath of base.files.keys()) {
      if (p && !filePath.startsWith(p)) continue;
      files.push({ path: filePath, type: "file" });
      const parts = filePath.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
    }
    for (const d of dirs) {
      if (p && !d.startsWith(p) && d !== p) continue;
      files.push({ path: d, type: "dir" });
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async readRepositoryFile(filePath: string): Promise<string> {
    const base = await this.ensureBase();
    const n = normalizeRepoPath(filePath);
    const content = base.files.get(n);
    if (content === undefined) {
      throw new ApiError("NOT_FOUND", `File not found: ${filePath}`, { status: 404 });
    }
    return content;
  }

  async searchRepository(
    query: string,
  ): Promise<Array<{ path: string; line: number; preview: string }>> {
    const base = await this.ensureBase();
    const q = query.toLowerCase();
    const hits: Array<{ path: string; line: number; preview: string }> = [];
    for (const [filePath, content] of base.files) {
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(q) && hits.length < 40) {
          hits.push({ path: filePath, line: idx + 1, preview: line.trim().slice(0, 200) });
        }
      });
    }
    return hits;
  }

  async createBranch(branchName: string, fromBranch = "main"): Promise<{ branchName: string }> {
    await this.ensureBase();
    const from =
      fromBranch === this.defaultBranch
        ? await this.ensureBase()
        : this.getBranch(fromBranch);
    const clone = new Map(from.files);
    demoBranchStore.set(demoStoreKey(this.repositoryName, branchName), {
      files: clone,
      baseBranch: fromBranch,
    });
    return { branchName };
  }

  async writeFilesToBranch(branchName: string, ops: RepoWriteOp[]): Promise<void> {
    const branch = this.getBranch(branchName);
    for (const op of ops) {
      const n = normalizeRepoPath(op.path);
      if (isProtectedPath(n) && n !== ".env.example") {
        throw new ApiError("BAD_REQUEST", `Protected path: ${n}`, { status: 400 });
      }
      if (op.operation === "delete") {
        branch.files.delete(n);
      } else {
        if (op.content === undefined) {
          throw new ApiError("BAD_REQUEST", `Missing content for ${n}`, { status: 400 });
        }
        branch.files.set(n, op.content);
      }
    }
  }

  async getDiff(
    branchName: string,
  ): Promise<Array<{ path: string; operation: string; diff: string }>> {
    const base = await this.ensureBase();
    const branch = this.getBranch(branchName);
    const paths = new Set([...base.files.keys(), ...branch.files.keys()]);
    const diffs: Array<{ path: string; operation: string; diff: string }> = [];

    for (const p of paths) {
      const before = base.files.get(p);
      const after = branch.files.get(p);
      if (before === after) continue;
      if (before === undefined && after !== undefined) {
        diffs.push({
          path: p,
          operation: "create",
          diff: unifiedDiff(p, "", after),
        });
      } else if (before !== undefined && after === undefined) {
        diffs.push({
          path: p,
          operation: "delete",
          diff: unifiedDiff(p, before, ""),
        });
      } else if (before !== undefined && after !== undefined) {
        diffs.push({
          path: p,
          operation: "modify",
          diff: unifiedDiff(p, before, after),
        });
      }
    }
    return diffs;
  }

  async createPullRequest(args: {
    branchName: string;
    title: string;
    body: string;
  }): Promise<PullRequestResult> {
    // Simulated PR for demo adapter
    const slug = this.repositoryName.replace("/", "-");
    return {
      status: "simulated",
      pullRequestUrl: `https://github.com/${this.repositoryName}/pull/demo-${Date.now().toString(36)}`,
      branchName: args.branchName,
      title: args.title,
      number: Math.floor(Math.random() * 900) + 100,
    };
  }
}

// ─── GitHub adapter (optional, read/write when token present) ───────

export class GitHubRepositoryAdapter implements RepositoryAdapter {
  provider: "github" = "github";
  repositoryName: string;
  defaultBranch: string;
  private token: string;
  private owner: string;
  private repo: string;

  constructor(args: {
    repositoryName: string;
    token: string;
    defaultBranch?: string;
  }) {
    this.repositoryName = args.repositoryName;
    this.token = args.token;
    this.defaultBranch = args.defaultBranch || "main";
    const [owner, repo] = args.repositoryName.split("/");
    if (!owner || !repo) {
      throw new ApiError("BAD_REQUEST", "repository must be owner/name", { status: 400 });
    }
    this.owner = owner;
    this.repo = repo;
  }

  private async gh(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    return res;
  }

  async listRepositoryFiles(prefix = ""): Promise<RepoFileEntry[]> {
    // Recursive tree of default branch
    const refRes = await this.gh(
      `/repos/${this.owner}/${this.repo}/git/ref/heads/${this.defaultBranch}`,
    );
    if (!refRes.ok) {
      throw new ApiError("MCP_FAILED", "Could not read GitHub ref", {
        status: 502,
        details: await refRes.text(),
      });
    }
    const ref = (await refRes.json()) as { object: { sha: string } };
    const treeRes = await this.gh(
      `/repos/${this.owner}/${this.repo}/git/trees/${ref.object.sha}?recursive=1`,
    );
    if (!treeRes.ok) {
      throw new ApiError("MCP_FAILED", "Could not list GitHub tree", { status: 502 });
    }
    const tree = (await treeRes.json()) as {
      tree: Array<{ path: string; type: string }>;
    };
    const p = normalizeRepoPath(prefix);
    return (tree.tree || [])
      .filter((t) => !p || t.path.startsWith(p))
      .map((t) => ({
        path: t.path,
        type: t.type === "tree" ? ("dir" as const) : ("file" as const),
      }));
  }

  async readRepositoryFile(filePath: string): Promise<string> {
    const n = normalizeRepoPath(filePath);
    const res = await this.gh(
      `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(n).replace(/%2F/g, "/")}?ref=${this.defaultBranch}`,
    );
    if (!res.ok) {
      throw new ApiError("NOT_FOUND", `GitHub file not found: ${n}`, { status: 404 });
    }
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (!data.content) return "";
    return Buffer.from(data.content, "base64").toString("utf8");
  }

  async searchRepository(
    query: string,
  ): Promise<Array<{ path: string; line: number; preview: string }>> {
    const q = encodeURIComponent(`${query} repo:${this.owner}/${this.repo}`);
    const res = await this.gh(`/search/code?q=${q}`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{ path: string; text_matches?: Array<{ fragment: string }> }>;
    };
    return (data.items || []).slice(0, 20).map((item) => ({
      path: item.path,
      line: 1,
      preview: item.text_matches?.[0]?.fragment?.slice(0, 200) || "",
    }));
  }

  async createBranch(branchName: string, fromBranch = "main"): Promise<{ branchName: string }> {
    const refRes = await this.gh(
      `/repos/${this.owner}/${this.repo}/git/ref/heads/${fromBranch || this.defaultBranch}`,
    );
    if (!refRes.ok) {
      throw new ApiError("MCP_FAILED", "Could not resolve base branch", { status: 502 });
    }
    const ref = (await refRes.json()) as { object: { sha: string } };
    const create = await this.gh(`/repos/${this.owner}/${this.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha,
      }),
    });
    if (!create.ok && create.status !== 422) {
      // 422 often means branch exists
      throw new ApiError("MCP_FAILED", "Could not create branch", {
        status: 502,
        details: await create.text(),
      });
    }
    return { branchName };
  }

  async writeFilesToBranch(branchName: string, ops: RepoWriteOp[]): Promise<void> {
    for (const op of ops) {
      const n = normalizeRepoPath(op.path);
      if (op.operation === "delete") {
        // Get sha then delete
        const existing = await this.gh(
          `/repos/${this.owner}/${this.repo}/contents/${n}?ref=${branchName}`,
        );
        if (!existing.ok) continue;
        const meta = (await existing.json()) as { sha: string };
        await this.gh(`/repos/${this.owner}/${this.repo}/contents/${n}`, {
          method: "DELETE",
          body: JSON.stringify({
            message: `chore: remove ${n} via Grok FDE`,
            sha: meta.sha,
            branch: branchName,
          }),
        });
        continue;
      }
      let sha: string | undefined;
      const existing = await this.gh(
        `/repos/${this.owner}/${this.repo}/contents/${n}?ref=${branchName}`,
      );
      if (existing.ok) {
        sha = ((await existing.json()) as { sha: string }).sha;
      }
      const put = await this.gh(`/repos/${this.owner}/${this.repo}/contents/${n}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `feat: ${op.operation} ${n} via Grok FDE`,
          content: Buffer.from(op.content || "", "utf8").toString("base64"),
          branch: branchName,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!put.ok) {
        throw new ApiError("MCP_FAILED", `Failed to write ${n}`, {
          status: 502,
          details: await put.text(),
        });
      }
    }
  }

  async getDiff(
    branchName: string,
  ): Promise<Array<{ path: string; operation: string; diff: string }>> {
    const res = await this.gh(
      `/repos/${this.owner}/${this.repo}/compare/${this.defaultBranch}...${branchName}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      files?: Array<{
        filename: string;
        status: string;
        patch?: string;
      }>;
    };
    return (data.files || []).map((f) => ({
      path: f.filename,
      operation:
        f.status === "added" ? "create" : f.status === "removed" ? "delete" : "modify",
      diff: f.patch || "",
    }));
  }

  async createPullRequest(args: {
    branchName: string;
    title: string;
    body: string;
  }): Promise<PullRequestResult> {
    const res = await this.gh(`/repos/${this.owner}/${this.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: args.title,
        head: args.branchName,
        base: this.defaultBranch,
        body: args.body,
      }),
    });
    if (!res.ok) {
      throw new ApiError("MCP_FAILED", "Could not create pull request", {
        status: 502,
        details: await res.text(),
      });
    }
    const data = (await res.json()) as { html_url: string; number: number };
    return {
      status: "ready",
      pullRequestUrl: data.html_url,
      branchName: args.branchName,
      title: args.title,
      number: data.number,
    };
  }
}

export function createRepositoryAdapter(args: {
  provider: "demo" | "github";
  repositoryName: string;
  defaultBranch?: string;
  githubToken?: string | null;
}): RepositoryAdapter {
  if (args.provider === "github") {
    const token = args.githubToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      // Fall back to demo rather than hard-failing the product
      console.warn("[repositories] No GITHUB_TOKEN; using demo adapter");
      return new DemoRepositoryAdapter(args.repositoryName || "globex/platform");
    }
    return new GitHubRepositoryAdapter({
      repositoryName: args.repositoryName,
      token,
      defaultBranch: args.defaultBranch,
    });
  }
  return new DemoRepositoryAdapter(args.repositoryName || "globex/platform");
}

export function unifiedDiff(filePath: string, before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const lines: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${a.length || 0} +1,${b.length || 0} @@`,
  ];
  // Simple line-oriented diff (good enough for review UI)
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      if (left !== undefined) lines.push(` ${left}`);
    } else {
      if (left !== undefined) lines.push(`-${left}`);
      if (right !== undefined) lines.push(`+${right}`);
    }
  }
  return lines.join("\n");
}
