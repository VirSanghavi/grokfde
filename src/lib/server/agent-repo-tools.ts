import { ApiError } from "@/lib/server/errors";
import {
  commitFiles,
  createBranch,
  createPullRequest,
  getFileContents,
  getRepository,
  getRepositoryTree,
  hasGitHubToken,
  listIssues,
  parseRepositoryName,
  unwrapGitHub,
} from "@/lib/server/github";
import { isProtectedPath } from "@/lib/server/protected-paths";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * The repository tools the agent can run DURING a live call.
 *
 * This is the part of the product that is hard to fake, so it is also the part
 * that has to be locked down properly. Three rules shape everything below.
 *
 * 1. THE REPOSITORY IS NEVER SUPPLIED BY THE CALLER. It is resolved from the
 *    conversation to the company to that company's one connected repository. A
 *    visitor cannot name a repository, so this cannot be turned into a reader
 *    for any private repository our token happens to reach.
 *
 * 2. TOOL RESULTS PASS THROUGH THE VISITOR'S BROWSER. The browser owns the
 *    realtime socket, so a tool it invokes returns its output to the browser
 *    before going back to the model. That means file contents and issue text
 *    from a PRIVATE repository become visible to whoever is on the call. There
 *    is no way around that short of relaying the socket server side. So these
 *    tools are OFF unless the company explicitly turns them on, and the control
 *    that turns them on says exactly this.
 *
 * 3. A CALL GETS A BUDGET. Reads are capped and a call may open at most one
 *    pull request, so an anonymous visitor cannot sit on a public link and mine
 *    a repository file by file or fill it with branches.
 */

/** Per conversation, per process. A budget, not a security boundary on its own. */
const BUDGETS = new Map<string, { reads: number; pulls: number; at: number }>();
const BUDGET_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_READS = 30;
const MAX_PULLS = 1;

/** A single file is capped so one read cannot drain a repository into a transcript. */
const MAX_FILE_BYTES = 12_000;
const MAX_TREE_ENTRIES = 400;
const MAX_ISSUES = 10;
const MAX_COMMIT_FILES = 8;

function budgetFor(conversationId: string) {
  const now = Date.now();
  for (const [key, value] of BUDGETS) {
    if (now - value.at > BUDGET_TTL_MS) BUDGETS.delete(key);
  }
  let entry = BUDGETS.get(conversationId);
  if (!entry) {
    entry = { reads: 0, pulls: 0, at: now };
    BUDGETS.set(conversationId, entry);
  }
  return entry;
}

export type RepoToolName =
  | "list_repository_issues"
  | "read_repository_map"
  | "read_repository_file"
  | "open_pull_request";

export const REPO_TOOL_NAMES: RepoToolName[] = [
  "list_repository_issues",
  "read_repository_map",
  "read_repository_file",
  "open_pull_request",
];

export type RepoConnection = {
  companyId: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  /** Explicitly enabled for live calls by the company. */
  liveCallTools: boolean;
};

/**
 * The company's connected repository, read from the `url` knowledge source that
 * carries `metadata_json.kind = "github_repository"`.
 */
export async function getRepoConnection(companyId: string): Promise<RepoConnection | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("knowledge_sources")
    .select("title,metadata_json")
    .eq("company_id", companyId)
    .eq("type", "url")
    .order("created_at", { ascending: false });
  if (error) return null;

  for (const row of (data ?? []) as Array<{
    title: string;
    metadata_json: Record<string, unknown> | null;
  }>) {
    const meta = row.metadata_json ?? {};
    if (meta.kind !== "github_repository") continue;
    return {
      companyId,
      fullName: String(meta.fullName ?? row.title),
      defaultBranch: String(meta.defaultBranch ?? "main"),
      private: Boolean(meta.private),
      liveCallTools: meta.liveCallTools === true,
    };
  }
  return null;
}

/** The company that owns a conversation. Resolved server side, never trusted from a caller. */
export async function companyIdForConversation(conversationId: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from("conversations")
    .select("company_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    throw new ApiError("DATABASE_ERROR", "Could not read the conversation", { status: 503 });
  }
  if (!data?.company_id) {
    throw new ApiError("NOT_FOUND", "No such conversation", { status: 404 });
  }
  return String(data.company_id);
}

function branchName(conversationId: string): string {
  // Deterministic per call, so a retry after a network blip reuses the branch
  // instead of littering the repository with near-identical ones.
  return `grok-fde/call-${conversationId.slice(0, 8)}`;
}

export type RepoToolResult = Record<string, unknown>;

export async function runRepoTool(args: {
  conversationId: string;
  tool: string;
  input: Record<string, unknown>;
}): Promise<RepoToolResult> {
  if (!REPO_TOOL_NAMES.includes(args.tool as RepoToolName)) {
    throw new ApiError("BAD_REQUEST", `Unknown tool ${args.tool}`, { status: 400 });
  }
  if (!hasGitHubToken()) {
    return { error: "No repository is reachable from this deployment." };
  }

  const companyId = await companyIdForConversation(args.conversationId);
  const connection = await getRepoConnection(companyId);
  if (!connection) {
    return { error: "This company has not connected a repository yet." };
  }
  if (!connection.liveCallTools) {
    // Refused, and the model is told why, so it can say something true out loud
    // rather than inventing a reason it failed.
    return {
      error:
        "Repository access during live calls is switched off for this company. Say so plainly and offer to follow up after the call.",
    };
  }

  const budget = budgetFor(args.conversationId);
  const ref = unwrapGitHub(parseRepositoryName(connection.fullName));

  switch (args.tool) {
    case "list_repository_issues": {
      if (++budget.reads > MAX_READS) return { error: "Too many repository lookups on this call." };
      const issues = unwrapGitHub(await listIssues(ref, { state: "open" }));
      return {
        repository: connection.fullName,
        issues: issues.slice(0, MAX_ISSUES).map((issue) => ({
          number: issue.number,
          title: issue.title,
          // Enough for the agent to reason about, not the entire thread.
          excerpt: (issue.body ?? "").slice(0, 600),
        })),
      };
    }

    case "read_repository_map": {
      if (++budget.reads > MAX_READS) return { error: "Too many repository lookups on this call." };
      const tree = unwrapGitHub(await getRepositoryTree(ref, connection.defaultBranch));
      const files = tree.entries
        .filter((entry) => entry.type === "file")
        .slice(0, MAX_TREE_ENTRIES)
        .map((entry) => entry.path);
      return {
        repository: connection.fullName,
        defaultBranch: connection.defaultBranch,
        fileCount: files.length,
        truncated: tree.truncated || files.length >= MAX_TREE_ENTRIES,
        files,
      };
    }

    case "read_repository_file": {
      if (++budget.reads > MAX_READS) return { error: "Too many repository lookups on this call." };
      const path = String(args.input.path ?? "").trim();
      if (!path) return { error: "A file path is required." };
      const read = await getFileContents(ref, path, connection.defaultBranch);
      if (!read.ok) {
        // A path that is not there is an ordinary thing for the model to hit and
        // recover from by looking at the map again. Throwing turns it into a
        // failed HTTP call, which reads as "the tool is broken" rather than
        // "that file does not exist".
        return {
          error:
            read.kind === "not_found"
              ? `There is no file at ${path} on ${connection.defaultBranch}. Call read_repository_map and use a path from it.`
              : `Could not read ${path}.`,
        };
      }
      const contents = read.data;
      return {
        path,
        truncated: contents.length > MAX_FILE_BYTES,
        contents: contents.slice(0, MAX_FILE_BYTES),
      };
    }

    case "open_pull_request": {
      if (budget.pulls >= MAX_PULLS) {
        return { error: "A pull request has already been opened on this call." };
      }

      const title = String(args.input.title ?? "").trim();
      const body = String(args.input.body ?? "").trim();
      const rawFiles = Array.isArray(args.input.files) ? args.input.files : [];
      if (!title) return { error: "A pull request needs a title." };
      if (rawFiles.length === 0) return { error: "No file changes were supplied." };
      if (rawFiles.length > MAX_COMMIT_FILES) {
        return { error: `At most ${MAX_COMMIT_FILES} files can change in one call.` };
      }

      const files = rawFiles.map((entry) => {
        const file = entry as { path?: unknown; contents?: unknown };
        return {
          path: String(file.path ?? "").trim(),
          contents: String(file.contents ?? ""),
        };
      });
      if (files.some((file) => !file.path)) return { error: "Every change needs a file path." };

      // The same guard the offline pipeline uses. Lockfiles, CI config, and
      // anything else on the protected list are not touchable by something a
      // stranger asked for out loud.
      const blocked = files.map((file) => file.path).filter((path) => isProtectedPath(path));
      if (blocked.length > 0) {
        return { error: `These paths are protected and were not changed: ${blocked.join(", ")}` };
      }

      const branch = branchName(args.conversationId);
      // createBranch refuses the default branch by construction, and commitFiles
      // asserts it again before writing. Nothing here can reach main.
      unwrapGitHub(
        await createBranch({
          ref,
          branch,
          fromBranch: connection.defaultBranch,
          defaultBranch: connection.defaultBranch,
        }),
      );
      const commit = unwrapGitHub(
        await commitFiles({
          ref,
          branch,
          defaultBranch: connection.defaultBranch,
          message: title,
          // "modify" is correct even for a file that does not exist yet: the
          // commit builder writes whatever blob it is given against the tree.
          files: files.map((file) => ({
            path: file.path,
            operation: "modify" as const,
            content: file.contents,
          })),
        }),
      );
      const pull = unwrapGitHub(
        await createPullRequest({
          ref,
          head: branch,
          base: connection.defaultBranch,
          defaultBranch: connection.defaultBranch,
          title,
          body:
            `${body}\n\n---\nOpened during a live call with the forward-deployed engineer. ` +
            `Every change is on \`${branch}\`; nothing was pushed to \`${connection.defaultBranch}\`.`,
        }),
      );

      budget.pulls += 1;
      return {
        opened: true,
        number: pull.number,
        url: pull.htmlUrl,
        branch,
        commit: commit.sha,
        files: files.map((file) => file.path),
      };
    }

    default:
      return { error: `Unknown tool ${args.tool}` };
  }
}

/**
 * The tool definitions handed to the model. No credential appears here, because
 * this object is delivered to the browser with the ephemeral voice token.
 */
export function repoToolDefinitions(connection: RepoConnection) {
  const repo = connection.fullName;
  return [
    {
      type: "function" as const,
      name: "list_repository_issues",
      description: `List the open GitHub issues on ${repo}. Use this when the caller asks what is outstanding, or before offering to fix something, so you name real issues rather than inventing them.`,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function" as const,
      name: "read_repository_map",
      description: `List the file paths in ${repo}. Call this before reading a file, so you ask for a path that exists.`,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function" as const,
      name: "read_repository_file",
      description: `Read one file from ${repo}. Use it to quote real code back to the caller instead of describing code generally.`,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repository-relative path, for example src/app/page.tsx" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      type: "function" as const,
      name: "open_pull_request",
      description: `Open a real pull request on ${repo}, on a new branch, for a human to review. Read the relevant files first so the change fits the code that is actually there. Say out loud what you are about to change and get agreement before calling this. It may be called once per call.`,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Pull request title, written as a change, not a question." },
          body: { type: "string", description: "What changed and why, in the caller's own terms." },
          files: {
            type: "array",
            description: "The complete new contents of each file being changed. Never a diff or a fragment.",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                contents: { type: "string" },
              },
              required: ["path", "contents"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "body", "files"],
        additionalProperties: false,
      },
    },
  ];
}
