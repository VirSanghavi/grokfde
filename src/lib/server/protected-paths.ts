/** Paths the implementation agent must never touch. Enforced in code, not just prompts. */

const DENY_PREFIXES = [
  ".git/",
  ".github/workflows/",
  "infra/production/",
  "terraform/production/",
  "secrets/",
  "credentials/",
];

const DENY_EXACT = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "credentials.json",
  "service-account.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

const DENY_SUFFIXES = [".pem", ".key", ".p12", ".pfx"];

const MAX_CHANGED_FILES = Number(process.env.MAX_CHANGED_FILES || 8);

export function getMaxChangedFiles(): number {
  return Number.isFinite(MAX_CHANGED_FILES) && MAX_CHANGED_FILES > 0
    ? MAX_CHANGED_FILES
    : 8;
}

export function normalizeRepoPath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

export function isPathTraversal(path: string): boolean {
  const n = normalizeRepoPath(path);
  return n.includes("..") || n.startsWith("/") || n.includes("\0");
}

export function isProtectedPath(path: string): boolean {
  const n = normalizeRepoPath(path);
  if (!n || isPathTraversal(n)) return true;
  if (DENY_EXACT.has(n)) return true;
  if (DENY_PREFIXES.some((p) => n === p.slice(0, -1) || n.startsWith(p))) return true;
  if (DENY_SUFFIXES.some((s) => n.endsWith(s))) return true;
  // Block modifying .env* except .env.example (allowed for adding public keys)
  if (n.startsWith(".env") && n !== ".env.example") return true;
  return false;
}

export function assertSafeFileOperation(path: string, operation: string): void {
  const n = normalizeRepoPath(path);
  if (isPathTraversal(n)) {
    throw new Error(`Unsafe path rejected: ${path}`);
  }
  if (isProtectedPath(n)) {
    throw new Error(`Protected path rejected: ${path}`);
  }
  if (operation === "delete") {
    throw new Error(`Deletes are not allowed in FDE implementation runs: ${path}`);
  }
}

export function filterSafeOperations<T extends { path: string; operation: string }>(
  ops: T[],
): { accepted: T[]; rejected: Array<{ path: string; reason: string }> } {
  const accepted: T[] = [];
  const rejected: Array<{ path: string; reason: string }> = [];
  for (const op of ops) {
    try {
      assertSafeFileOperation(op.path, op.operation);
      accepted.push({ ...op, path: normalizeRepoPath(op.path) });
    } catch (err) {
      rejected.push({
        path: op.path,
        reason: err instanceof Error ? err.message : "rejected",
      });
    }
  }
  if (accepted.length > getMaxChangedFiles()) {
    const overflow = accepted.splice(getMaxChangedFiles());
    for (const o of overflow) {
      rejected.push({ path: o.path, reason: `Exceeds MAX_CHANGED_FILES=${getMaxChangedFiles()}` });
    }
  }
  return { accepted, rejected };
}
