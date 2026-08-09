import { promises as fs } from "fs";
import path from "path";
import { ApiError } from "./errors";
import {
  commitFiles,
  compareBranches,
  createBranch as ghCreateBranch,
  createPullRequest as ghCreatePullRequest,
  getFileContents,
  getRepository,
  getRepositoryTree,
  hasGitHubToken,
  parseRepositoryName,
  unwrapGitHub,
  type RepoRef,
} from "./github";
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

/**
 * "real" writes to an actual GitHub repository. "offline-fixture" runs against
 * the bundled sample codebase and opens nothing. The UI labels the difference
 * so nobody mistakes a fixture run for a real one.
 */
export type RepositoryMode = "real" | "offline-fixture";

export interface RepositoryAdapter {
  provider: "demo" | "github";
  mode: RepositoryMode;
  repositoryName: string;
  defaultBranch: string;
  /** Resolves branch and metadata that only the provider knows. No-op offline. */
  ready(): Promise<void>;
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
  mode: RepositoryMode = "offline-fixture";
  repositoryName: string;
  defaultBranch = "main";
  private fixtureRoot: string;

  constructor(repositoryName = "globex/platform") {
    this.repositoryName = repositoryName;
    this.fixtureRoot = path.join(process.cwd(), "src/lib/fixtures/demo-repo");
  }

  async ready(): Promise<void> {
    await this.ensureBase();
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
    // The fixture has no remote, so there is nothing real to open. Callers
    // surface this as "offline fixture", never as a pull request that exists.
    return {
      status: "simulated",
      pullRequestUrl: `https://github.com/${this.repositoryName}/pull/demo-${Date.now().toString(36)}`,
      branchName: args.branchName,
      title: args.title,
      number: Math.floor(Math.random() * 900) + 100,
    };
  }
}

// ─── GitHub adapter (real repository, used whenever a token is present) ──

/**
 * Every read and write goes through src/lib/server/github.ts, so the two
 * safety rules (never the default branch, never a protected path) are enforced
 * by the client itself and cannot be skipped by a caller.
 *
 * writeFilesToBranch buffers nothing: it sends every file in a single commit
 * via the git data API, because a reviewer should see one coherent commit and
 * not one commit per file.
 */
export class GitHubRepositoryAdapter implements RepositoryAdapter {
  provider: "github" = "github";
  mode: RepositoryMode = "real";
  repositoryName: string;
  defaultBranch: string;
  htmlUrl: string | null = null;
  private ref: RepoRef;
  private resolved = false;

  constructor(args: { repositoryName: string; defaultBranch?: string }) {
    const parsed = parseRepositoryName(args.repositoryName);
    if (!parsed.ok) {
      throw new ApiError("BAD_REQUEST", parsed.message, { status: 400 });
    }
    this.ref = parsed.data;
    this.repositoryName = `${parsed.data.owner}/${parsed.data.repo}`;
    this.defaultBranch = args.defaultBranch || "main";
  }

  /**
   * The stored default branch can be stale or simply wrong ("main" on a repo
   * that still uses "master"). Ask GitHub once, then trust the answer, because
   * every safety check compares against it.
   */
  async ready(): Promise<void> {
    if (this.resolved) return;
    const repo = unwrapGitHub(await getRepository(this.ref));
    this.defaultBranch = repo.defaultBranch;
    this.htmlUrl = repo.htmlUrl;
    this.resolved = true;
  }

  async listRepositoryFiles(prefix = ""): Promise<RepoFileEntry[]> {
    await this.ready();
    const tree = unwrapGitHub(await getRepositoryTree(this.ref, this.defaultBranch));
    const p = normalizeRepoPath(prefix);
    return tree.entries
      .filter((e) => !p || e.path === p || e.path.startsWith(`${p}/`))
      .map((e) => ({ path: e.path, type: e.type }));
  }

  async readRepositoryFile(filePath: string, branch?: string): Promise<string> {
    await this.ready();
    return unwrapGitHub(
      await getFileContents(this.ref, filePath, branch || this.defaultBranch),
    );
  }

  /**
   * GitHub's code search index lags behind pushes and misses private repos on
   * some plans, so this reads the tree and greps the files it can fetch. Slower,
   * but it never silently returns nothing for a repo we just connected.
   */
  async searchRepository(
    query: string,
  ): Promise<Array<{ path: string; line: number; preview: string }>> {
    await this.ready();
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const tree = unwrapGitHub(await getRepositoryTree(this.ref, this.defaultBranch));
    const candidates = tree.entries
      .filter((e) => e.type === "file" && (e.size ?? 0) < 200_000)
      .filter((e) => /\.(ts|tsx|js|jsx|json|md|yml|yaml|py|go|rb|java|sql|env\.example)$/i.test(e.path))
      .slice(0, 60);

    const hits: Array<{ path: string; line: number; preview: string }> = [];
    for (const entry of candidates) {
      if (hits.length >= 40) break;
      const file = await getFileContents(this.ref, entry.path, this.defaultBranch);
      if (!file.ok) continue;
      file.data.split("\n").forEach((line, idx) => {
        if (hits.length < 40 && line.toLowerCase().includes(q)) {
          hits.push({ path: entry.path, line: idx + 1, preview: line.trim().slice(0, 200) });
        }
      });
    }
    return hits;
  }

  async createBranch(branchName: string, fromBranch?: string): Promise<{ branchName: string }> {
    await this.ready();
    const result = unwrapGitHub(
      await ghCreateBranch({
        ref: this.ref,
        branch: branchName,
        fromBranch: fromBranch || this.defaultBranch,
        defaultBranch: this.defaultBranch,
      }),
    );
    return { branchName: result.branch };
  }

  async writeFilesToBranch(branchName: string, ops: RepoWriteOp[]): Promise<void> {
    await this.ready();
    if (!ops.length) return;
    unwrapGitHub(
      await commitFiles({
        ref: this.ref,
        branch: branchName,
        defaultBranch: this.defaultBranch,
        message: commitMessageFor(ops),
        files: ops.map((op) => ({
          path: op.path,
          operation: op.operation,
          content: op.content,
        })),
      }),
    );
  }

  async getDiff(
    branchName: string,
  ): Promise<Array<{ path: string; operation: string; diff: string }>> {
    await this.ready();
    const compared = unwrapGitHub(
      await compareBranches(this.ref, this.defaultBranch, branchName),
    );
    return compared.files.map((f) => ({
      path: f.path,
      operation: f.operation,
      diff: f.patch,
    }));
  }

  async createPullRequest(args: {
    branchName: string;
    title: string;
    body: string;
  }): Promise<PullRequestResult> {
    await this.ready();
    const pr = unwrapGitHub(
      await ghCreatePullRequest({
        ref: this.ref,
        head: args.branchName,
        base: this.defaultBranch,
        defaultBranch: this.defaultBranch,
        title: args.title,
        body: args.body,
      }),
    );
    return {
      status: "ready",
      pullRequestUrl: pr.htmlUrl,
      branchName: pr.head,
      title: pr.title,
      number: pr.number,
    };
  }
}

/** One commit, so the message has to describe the whole change set. */
function commitMessageFor(ops: RepoWriteOp[]): string {
  const created = ops.filter((o) => o.operation === "create").length;
  const modified = ops.filter((o) => o.operation === "modify").length;
  const parts = [
    created ? `${created} new file${created === 1 ? "" : "s"}` : "",
    modified ? `${modified} updated file${modified === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const subject = `Integrate Grok FDE (${parts.join(", ") || `${ops.length} files`})`;
  const bodyLines = ops
    .slice(0, 20)
    .map((o) => `${o.operation === "create" ? "add" : "update"} ${normalizeRepoPath(o.path)}`);
  return [
    subject,
    "",
    ...bodyLines,
    "",
    "Prepared by the Grok FDE agent. Human review required before merge.",
  ].join("\n");
}

/**
 * A GitHub connection with no server token is a configuration error, not a
 * reason to quietly swap in the fixture. Silently degrading is how a demo ends
 * up claiming it opened a pull request it never opened.
 */
export function createRepositoryAdapter(args: {
  provider: "demo" | "github";
  repositoryName: string;
  defaultBranch?: string;
}): RepositoryAdapter {
  if (args.provider === "github") {
    if (!hasGitHubToken()) {
      throw new ApiError(
        "UNAUTHORIZED",
        "This workspace is connected to a real GitHub repository but the server has no GITHUB_TOKEN. Add it to .env.local, or connect the offline sample repository instead.",
        { status: 401, recoverable: false },
      );
    }
    return new GitHubRepositoryAdapter({
      repositoryName: args.repositoryName,
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
