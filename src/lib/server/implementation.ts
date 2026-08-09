import { z } from "zod";
import { askGrokStructured } from "@/lib/ai/grok";
import {
  CODE_GENERATION_SYSTEM,
  codeGenerationUserPrompt,
} from "@/lib/ai/prompts/code-generation";
import {
  CODE_REPAIR_SYSTEM,
  codeRepairUserPrompt,
} from "@/lib/ai/prompts/code-repair";
import {
  IMPLEMENTATION_PLAN_SYSTEM,
  implementationPlanUserPrompt,
} from "@/lib/ai/prompts/implementation-plan";
import {
  REPO_ANALYSIS_SYSTEM,
  REPO_FILE_PICK_SYSTEM,
  repoAnalysisUserPrompt,
  repoFilePickUserPrompt,
} from "@/lib/ai/prompts/repository-analysis";
import { agentDisplayName } from "@/lib/personas";
import { getCompanyById } from "./company-context";
import {
  allValidationsPassed,
  validateGeneratedFiles,
  type GeneratedFile,
  type ValidationResult,
} from "./code-validation";
import { ApiError } from "./errors";
import {
  createIssueComment,
  draftIssueReply,
  getIssue,
  getRepository,
  hasGitHubToken,
  listIssues,
  parseRepositoryName,
  unwrapGitHub,
  type GitHubIssue,
  type IssueComment,
} from "./github";
import { parseKnowledgeSummary, parseProspectMemory } from "./merge";
import { getProspectMemory } from "./prospect-context";
import { filterSafeOperations, normalizeRepoPath } from "./protected-paths";
import {
  createRepositoryAdapter,
  unifiedDiff,
  type RepositoryAdapter,
} from "./repositories";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  getWorkspace,
  pushEvent,
  updateWorkspace,
  type WorkspaceEvent,
  type WorkspaceRow,
} from "./workspaces";
import type { CompanyRow, ProspectRow } from "./types";

const MAX_REPO_ANALYSIS_ROUNDS = Number(process.env.MAX_REPO_ANALYSIS_ROUNDS || 4);
const MAX_REPAIR_ATTEMPTS = Number(process.env.MAX_REPAIR_ATTEMPTS || 3);

const AnalysisSchema = z.object({
  stack: z.array(z.string()).default([]),
  importantFiles: z
    .array(z.object({ path: z.string(), reason: z.string() }))
    .default([]),
  architectureSummary: z.string().default(""),
  integrationPoints: z
    .array(z.object({ location: z.string(), reason: z.string() }))
    .default([]),
  constraints: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  filesToReadNext: z.array(z.string()).default([]),
});

const FilePickSchema = z.object({
  paths: z.array(z.string()).default([]),
});

const PlanSchema = z.object({
  summary: z.string(),
  changes: z
    .array(
      z.object({
        path: z.string(),
        operation: z.enum(["create", "modify"]),
        purpose: z.string(),
      }),
    )
    .default([]),
  tests: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  requiresApproval: z.boolean().default(true),
  branchHint: z.string().optional(),
});

const CodeGenSchema = z.object({
  summary: z.string().default(""),
  files: z
    .array(
      z.object({
        path: z.string(),
        operation: z.enum(["create", "modify"]),
        content: z.string(),
        purpose: z.string().optional(),
      }),
    )
    .default([]),
});

const RepairSchema = z.object({
  rootCause: z.string().default(""),
  summary: z.string().default(""),
  files: z
    .array(
      z.object({
        path: z.string(),
        operation: z.enum(["create", "modify"]),
        content: z.string(),
        purpose: z.string().optional(),
      }),
    )
    .default([]),
});

function vendorSummary(company: CompanyRow): string {
  const k = parseKnowledgeSummary(company.knowledge_summary_json);
  return JSON.stringify(
    {
      name: company.name,
      description: company.description,
      ...k,
    },
    null,
    2,
  );
}

async function loadProspect(prospectId: string): Promise<ProspectRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .maybeSingle();
  if (error || !data) {
    throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
  }
  return data as ProspectRow;
}

async function getPrimaryRepo(workspaceId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("repository_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    throw new ApiError("BAD_REQUEST", "Connect a repository before analyzing", {
      status: 400,
    });
  }
  return data as {
    id: string;
    provider: "demo" | "github";
    repository_name: string;
    default_branch: string;
    installation_or_connection_metadata_json: Record<string, unknown>;
  };
}

/**
 * Resolves the adapter and lets it confirm what it is talking to before any
 * caller reads or writes. For GitHub that means the real default branch is
 * known, which every safety check depends on.
 */
async function adapterForRepo(repo: {
  provider: "demo" | "github";
  repository_name: string;
  default_branch: string;
}): Promise<RepositoryAdapter> {
  const adapter = createRepositoryAdapter({
    provider: repo.provider,
    repositoryName: repo.repository_name,
    defaultBranch: repo.default_branch,
  });
  await adapter.ready();
  return adapter;
}

async function readSelectedFiles(
  adapter: RepositoryAdapter,
  paths: string[],
): Promise<Array<{ path: string; content: string }>> {
  const out: Array<{ path: string; content: string }> = [];
  for (const p of paths.slice(0, 10)) {
    try {
      const content = await adapter.readRepositoryFile(p);
      out.push({ path: normalizeRepoPath(p), content: content.slice(0, 8000) });
    } catch {
      /* skip missing */
    }
  }
  return out;
}

function treeString(entries: Array<{ path: string; type: string }>): string {
  return entries
    .filter((e) => e.type === "file")
    .map((e) => e.path)
    .slice(0, 200)
    .join("\n");
}

type RepoAnalysis = z.infer<typeof AnalysisSchema>;

function fallbackAnalysis(tree: string): RepoAnalysis {
  const stack: string[] = [];
  if (/next/i.test(tree)) stack.push("Next.js");
  if (/\.tsx?$/m.test(tree) || /typescript/i.test(tree)) stack.push("TypeScript");
  if (/supabase/i.test(tree)) stack.push("Supabase");
  if (/package\.json/.test(tree)) stack.push("Node.js");
  return {
    stack: stack.length ? stack : ["TypeScript"],
    importantFiles: [
      { path: "src/lib/auth.ts", reason: "Existing authentication helper" },
      { path: "src/lib/supabase.ts", reason: "Existing data access layer" },
      { path: "src/app/api/leads/route.ts", reason: "Existing API route pattern" },
      { path: ".env.example", reason: "Environment variable conventions" },
      { path: "package.json", reason: "Project dependencies and scripts" },
    ].filter((f) => tree.includes(f.path)),
    architectureSummary:
      "Next.js App Router service with Supabase data access and bearer-token auth helpers. API routes live under src/app/api.",
    integrationPoints: [
      {
        location: "src/app/api",
        reason: "Matches existing route conventions for a new FDE endpoint",
      },
      {
        location: "src/lib",
        reason: "Place vendor client beside supabase/auth helpers",
      },
    ],
    constraints: ["Reuse existing auth", "Server-side secrets only"],
    risks: ["Requires vendor API key in server env"],
    questions: [],
    filesToReadNext: [],
  };
}

function fallbackPlan(objective: string) {
  return {
    summary:
      "Add a server-side Grok FDE client and authenticated prospect chat endpoint using existing Supabase auth patterns.",
    changes: [
      {
        path: "src/lib/grok-fde.ts",
        operation: "create" as const,
        purpose: "Vendor API wrapper for Grok FDE",
      },
      {
        path: "src/app/api/fde/route.ts",
        operation: "create" as const,
        purpose: "Prospect interaction endpoint",
      },
      {
        path: ".env.example",
        operation: "modify" as const,
        purpose: "Document GROK_FDE_API_KEY / XAI_API_KEY",
      },
    ],
    tests: [
      "FDE route exports POST handler",
      "Unauthorized request is rejected",
      "Client wrapper references env API key",
    ],
    risks: ["Requires server-side vendor API key"],
    requiresApproval: true,
    branchHint: "grok-fde-integration",
    objective,
  };
}

function fallbackCodegen(envExample: string): z.infer<typeof CodeGenSchema> {
  const env = envExample.includes("GROK_FDE_API_KEY")
    ? envExample
    : `${envExample.trim()}\n\n# Grok FDE (server-side only)\nGROK_FDE_API_KEY=\nXAI_API_KEY=\n`;

  return {
    summary:
      "Added Grok FDE client and /api/fde route following existing auth + Response.json patterns.",
    files: [
      {
        path: "src/lib/grok-fde.ts",
        operation: "create",
        purpose: "Vendor API wrapper",
        content: `/**
 * Grok FDE server client — call the vendor FDE API from Globex backend routes.
 * Keep the API key server-side only.
 */

export type FdeMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type FdeChatResult = {
  content: string;
  raw?: unknown;
};

function apiBase() {
  return process.env.GROK_FDE_BASE_URL || "https://api.x.ai/v1";
}

function apiKey() {
  const key = process.env.GROK_FDE_API_KEY || process.env.XAI_API_KEY;
  if (!key) {
    throw new Error("Missing GROK_FDE_API_KEY or XAI_API_KEY");
  }
  return key;
}

/**
 * Send a technical prospect message to Grok FDE / Grok chat completions.
 */
export async function chatWithFde(args: {
  system?: string;
  messages: FdeMessage[];
  model?: string;
}): Promise<FdeChatResult> {
  const model = args.model || process.env.GROK_FDE_MODEL || "grok-4.5";
  const messages = [
    ...(args.system
      ? [{ role: "system" as const, content: args.system }]
      : []),
    ...args.messages,
  ];

  const res = await fetch(\`\${apiBase()}/chat/completions\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${apiKey()}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(\`Grok FDE request failed: \${res.status} \${text.slice(0, 300)}\`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return { content, raw: data };
}
`,
      },
      {
        path: "src/app/api/fde/route.ts",
        operation: "create",
        purpose: "Prospect FDE chat endpoint",
        content: `import { z } from "zod";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { chatWithFde } from "@/lib/grok-fde";

const BodySchema = z.object({
  message: z.string().min(1),
  context: z.string().optional(),
});

/**
 * Authenticated endpoint: technical prospects chat with Grok FDE.
 * Reuses existing bearer-token session auth.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req.headers.get("authorization"));
  if (!user) return unauthorized();

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const system = [
    "You are Grok FDE, an AI Forward-Deployed Engineer helping this customer integrate.",
    "Be concrete, technical, and honest about uncertainty.",
    body.context ? \`Customer context: \${body.context}\` : "",
  ]
    .filter(Boolean)
    .join("\\n");

  try {
    const result = await chatWithFde({
      system,
      messages: [{ role: "user", content: body.message }],
    });
    return Response.json({
      message: {
        role: "assistant",
        content: result.content,
      },
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "FDE request failed",
      },
      { status: 502 },
    );
  }
}
`,
      },
      {
        path: ".env.example",
        operation: "modify",
        purpose: "Document FDE env vars",
        content: env,
      },
    ],
  };
}

// ─── Connect repository ────────────────────────────────────────────

/**
 * Connecting a real repository verifies it before storing anything: the repo
 * has to exist, the token has to be able to push to it, and GitHub tells us the
 * true default branch. A connection that cannot produce a pull request later is
 * a connection that should fail now, loudly.
 *
 * No token is ever accepted from, or stored for, a client. The server token in
 * GITHUB_TOKEN is the only credential.
 */
export async function connectRepository(args: {
  workspaceId: string;
  provider: "demo" | "github";
  repository?: string;
  repositoryUrl?: string;
  defaultBranch?: string;
}) {
  const ws = await getWorkspace(args.workspaceId);
  const db = getSupabaseAdmin();

  let repositoryName =
    args.repository || (args.provider === "demo" ? "globex/platform" : args.repositoryUrl || "");
  let repositoryUrl = args.repositoryUrl ?? null;
  let defaultBranch = args.defaultBranch || "main";
  let metadata: Record<string, unknown> = { mode: "offline-fixture" };

  if (args.provider === "github") {
    if (!hasGitHubToken()) {
      throw new ApiError(
        "UNAUTHORIZED",
        "The server has no GITHUB_TOKEN, so it cannot connect a real repository. Add GITHUB_TOKEN to .env.local.",
        { status: 401, recoverable: false },
      );
    }
    const ref = unwrapGitHub(parseRepositoryName(repositoryName));
    const repo = unwrapGitHub(await getRepository(ref));
    if (!repo.canPush) {
      throw new ApiError(
        "UNAUTHORIZED",
        `The connected token cannot push to ${repo.fullName}, so Grok FDE could never open a pull request there.`,
        { status: 403, recoverable: false },
      );
    }
    repositoryName = repo.fullName;
    repositoryUrl = repo.htmlUrl;
    defaultBranch = repo.defaultBranch;
    metadata = {
      mode: "real",
      private: repo.private,
      htmlUrl: repo.htmlUrl,
      language: repo.language,
      openIssues: repo.openIssues,
      connectedAt: new Date().toISOString(),
    };
  }

  const { data, error } = await db
    .from("repository_connections")
    .insert({
      workspace_id: ws.id,
      provider: args.provider,
      repository_name: repositoryName,
      repository_url: repositoryUrl,
      default_branch: defaultBranch,
      status: "connected",
      installation_or_connection_metadata_json: metadata,
    })
    .select("id, workspace_id, provider, repository_name, repository_url, default_branch, status, created_at")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not connect repository", {
      status: 500,
      details: error?.message,
    });
  }

  const events = pushEvent(
    ws.events_json,
    "repository_connected",
    args.provider === "github"
      ? `Connected ${repositoryName} on GitHub, default branch ${defaultBranch}`
      : `Connected the offline sample repository ${repositoryName}`,
  );
  await updateWorkspace(ws.id, { status: "connected", events_json: events });

  return {
    id: data.id as string,
    repositoryName: data.repository_name as string,
    repositoryUrl: data.repository_url as string | null,
    defaultBranch: data.default_branch as string,
    provider: data.provider as "demo" | "github",
    status: data.status as string,
    mode: (metadata.mode as "real" | "offline-fixture") ?? "offline-fixture",
  };
}

// ─── Analyze ───────────────────────────────────────────────────────

export async function analyzeWorkspace(workspaceId: string) {
  let ws = await getWorkspace(workspaceId);
  const company = await getCompanyById(ws.company_id);
  const prospect = await loadProspect(ws.prospect_id);
  const memory = getProspectMemory(prospect);
  const repo = await getPrimaryRepo(workspaceId);
  const adapter = await adapterForRepo(repo);

  let events = pushEvent(ws.events_json, "repository_analyzing", "Inspecting repository structure");
  ws = await updateWorkspace(ws.id, { status: "analyzing", events_json: events });

  const treeEntries = await adapter.listRepositoryFiles();
  const tree = treeString(treeEntries);
  const objective =
    "Integrate Grok FDE so technical prospects can start an AI engineering conversation from the app.";

  let paths: string[] = [];
  try {
    if (process.env.XAI_API_KEY) {
      const pick = await askGrokStructured({
        schema: FilePickSchema,
        schemaName: "FilePick",
        messages: [
          { role: "system", content: REPO_FILE_PICK_SYSTEM },
          {
            role: "user",
            content: repoFilePickUserPrompt({ objective, fileTree: tree }),
          },
        ],
      });
      paths = pick.paths ?? [];
    }
  } catch {
    paths = [];
  }

  if (!paths.length) {
    paths = [
      "package.json",
      "README.md",
      "src/lib/auth.ts",
      "src/lib/supabase.ts",
      "src/app/api/leads/route.ts",
      "src/types.ts",
      ".env.example",
    ].filter((p) => tree.split("\n").includes(p));
  }

  const rounds = Math.min(MAX_REPO_ANALYSIS_ROUNDS, 3);
  let analysis = fallbackAnalysis(tree);
  let read = await readSelectedFiles(adapter, paths);

  for (let i = 0; i < rounds; i++) {
    const fileContents = read
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join("\n\n");
    try {
      if (!process.env.XAI_API_KEY) break;
      const nextAnalysis = await askGrokStructured({
        schema: AnalysisSchema,
        schemaName: "RepoAnalysis",
        messages: [
          { role: "system", content: REPO_ANALYSIS_SYSTEM },
          {
            role: "user",
            content: repoAnalysisUserPrompt({
              vendorSummary: vendorSummary(company),
              prospectMemory: JSON.stringify(memory),
              objective,
              fileTree: tree,
              fileContents,
            }),
          },
        ],
      });
      analysis = {
        stack: nextAnalysis.stack ?? [],
        importantFiles: nextAnalysis.importantFiles ?? [],
        architectureSummary: nextAnalysis.architectureSummary ?? "",
        integrationPoints: nextAnalysis.integrationPoints ?? [],
        constraints: nextAnalysis.constraints ?? [],
        risks: nextAnalysis.risks ?? [],
        questions: nextAnalysis.questions ?? [],
        filesToReadNext: nextAnalysis.filesToReadNext ?? [],
      };
      if (analysis.filesToReadNext?.length && i < rounds - 1) {
        const more = await readSelectedFiles(adapter, analysis.filesToReadNext);
        const seen = new Set(read.map((r) => r.path));
        for (const m of more) {
          if (!seen.has(m.path)) read.push(m);
        }
      } else {
        break;
      }
    } catch {
      analysis = fallbackAnalysis(tree);
      break;
    }
  }

  // Merge architecture: prospect memory + repo (don't erase manual facts)
  const prevArch = (ws.architecture_json || {}) as {
    stack?: string[];
    services?: string[];
    datastores?: string[];
    auth?: string[];
    deployment?: string[];
    integrations?: string[];
    constraints?: string[];
  };
  const stack = Array.from(
    new Set([...(prevArch.stack || []), ...memory.currentStack, ...analysis.stack]),
  );
  const architecture = {
    stack,
    services: prevArch.services || [],
    datastores: Array.from(
      new Set([
        ...(prevArch.datastores || []),
        ...stack.filter((s) => /supabase|postgres/i.test(s)),
      ]),
    ),
    auth: Array.from(
      new Set([
        ...(prevArch.auth || []),
        ...(tree.includes("src/lib/auth.ts") ? ["bearer-session"] : []),
      ]),
    ),
    deployment: prevArch.deployment || [],
    integrations: prevArch.integrations || [],
    constraints: Array.from(
      new Set([...(prevArch.constraints || []), ...analysis.constraints]),
    ),
  };

  events = pushEvent(
    events,
    "repository_analyzed",
    `Detected ${analysis.stack.join(", ") || "stack"}`,
  );

  ws = await updateWorkspace(ws.id, {
    status: "connected",
    analysis_json: analysis,
    architecture_json: architecture,
    events_json: events,
  });

  return {
    status: "analyzed" as const,
    stack: analysis.stack,
    architectureSummary: analysis.architectureSummary,
    importantFiles: analysis.importantFiles,
    integrationPoints: analysis.integrationPoints,
    risks: analysis.risks,
    constraints: analysis.constraints,
    questions: analysis.questions,
    architecture,
    events: ws.events_json,
  };
}

// ─── Plan ──────────────────────────────────────────────────────────

export async function createImplementationPlan(args: {
  workspaceId: string;
  objective?: string;
}) {
  const ws = await getWorkspace(args.workspaceId);
  const company = await getCompanyById(ws.company_id);
  const prospect = await loadProspect(ws.prospect_id);
  const memory = getProspectMemory(prospect);
  const repo = await getPrimaryRepo(args.workspaceId);
  const adapter = await adapterForRepo(repo);
  const objective =
    args.objective ||
    "Integrate Grok FDE into this customer's app so technical prospects can chat with an AI FDE.";

  let events = pushEvent(
    ws.events_json,
    "implementation_planning",
    "Drafting implementation plan",
  );
  await updateWorkspace(ws.id, { events_json: events });

  const analysis = ws.analysis_json || {};
  const important =
    (analysis as { importantFiles?: Array<{ path: string }> }).importantFiles ||
    [];
  const paths = important.map((f) => f.path).slice(0, 8);
  const files = await readSelectedFiles(adapter, paths.length ? paths : [
    "src/lib/auth.ts",
    "src/app/api/leads/route.ts",
    ".env.example",
  ]);
  const snippets = files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

  let plan = fallbackPlan(objective);
  try {
    if (process.env.XAI_API_KEY) {
      plan = {
        ...fallbackPlan(objective),
        ...(await askGrokStructured({
          schema: PlanSchema,
          schemaName: "ImplementationPlan",
          messages: [
            { role: "system", content: IMPLEMENTATION_PLAN_SYSTEM },
            {
              role: "user",
              content: implementationPlanUserPrompt({
                vendorSummary: vendorSummary(company),
                prospectMemory: JSON.stringify(memory),
                analysisJson: JSON.stringify(analysis),
                objective,
                importantFileSnippets: snippets,
              }),
            },
          ],
        })),
      };
    }
  } catch {
    plan = fallbackPlan(objective);
  }

  // Enforce no deletes / safe paths in plan
  const { accepted } = filterSafeOperations(
    plan.changes.map((c) => ({ ...c, operation: c.operation })),
  );
  plan.changes = accepted.map((c) => ({
    path: c.path,
    operation: c.operation as "create" | "modify",
    purpose:
      plan.changes.find((x) => normalizeRepoPath(x.path) === c.path)?.purpose ||
      "integration",
  }));

  const db = getSupabaseAdmin();
  // supersede prior drafts
  await db
    .from("implementation_plans")
    .update({ status: "superseded" })
    .eq("workspace_id", ws.id)
    .in("status", ["draft", "ready"]);

  const { data: prior } = await db
    .from("implementation_plans")
    .select("version")
    .eq("workspace_id", ws.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = ((prior?.version as number) || 0) + 1;
  const { data, error } = await db
    .from("implementation_plans")
    .insert({
      workspace_id: ws.id,
      version,
      objective,
      summary: plan.summary,
      plan_json: plan,
      status: "ready",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not save plan", {
      status: 500,
      details: error?.message,
    });
  }

  events = pushEvent(events, "implementation_plan_ready", "Implementation plan ready for approval");
  await updateWorkspace(ws.id, { status: "planned", events_json: events });

  return {
    planId: data.id as string,
    summary: plan.summary,
    changes: plan.changes,
    tests: plan.tests,
    risks: plan.risks,
    requiresApproval: true,
    version,
  };
}

// ─── Build ─────────────────────────────────────────────────────────

export async function startBuild(args: {
  workspaceId: string;
  planId: string;
}) {
  const ws = await getWorkspace(args.workspaceId);
  const db = getSupabaseAdmin();
  const { data: planRow, error: planErr } = await db
    .from("implementation_plans")
    .select("*")
    .eq("id", args.planId)
    .eq("workspace_id", ws.id)
    .maybeSingle();

  if (planErr || !planRow) {
    throw new ApiError("NOT_FOUND", "Plan not found", { status: 404 });
  }

  const company = await getCompanyById(ws.company_id);
  const prospect = await loadProspect(ws.prospect_id);
  const repo = await getPrimaryRepo(args.workspaceId);
  const adapter = await adapterForRepo(repo);
  const planJson = planRow.plan_json as z.infer<typeof PlanSchema> & {
    objective?: string;
  };
  const objective = (planRow.objective as string) || "Integrate Grok FDE";

  const short =
    (prospect.company_name || "customer")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "customer";
  // The plan suffix keeps one branch per approved plan: rebuilding the same
  // plan updates its branch, while a new plan gets a branch of its own.
  const branchName = `grok-fde/${short}-${String(planRow.id).slice(0, 8)}`;

  let runEvents: WorkspaceEvent[] = [
    {
      type: "implementation_started",
      label:
        adapter.mode === "real"
          ? `Build started on ${adapter.repositoryName}, branching from ${adapter.defaultBranch}`
          : "Build started against the offline sample repository",
      at: new Date().toISOString(),
    },
  ];

  const { data: run, error: runErr } = await db
    .from("implementation_runs")
    .insert({
      workspace_id: ws.id,
      plan_id: planRow.id,
      status: "building",
      branch_name: branchName,
      events_json: runEvents,
      summary_json: {
        objective,
        mode: adapter.mode,
        repository: adapter.repositoryName,
        defaultBranch: adapter.defaultBranch,
      },
    })
    .select("*")
    .single();

  if (runErr || !run) {
    throw new ApiError("INTERNAL_ERROR", "Could not create implementation run", {
      status: 500,
      details: runErr?.message,
    });
  }

  await db
    .from("implementation_plans")
    .update({ status: "accepted" })
    .eq("id", planRow.id);

  await updateWorkspace(ws.id, {
    status: "building",
    events_json: pushEvent(ws.events_json, "implementation_started", "Building integration"),
  });

  // Branch from the provider's real default branch, never from a stored guess.
  await adapter.createBranch(branchName, adapter.defaultBranch);

  // Context files from plan
  const planPaths = (planJson.changes || []).map((c) => c.path);
  const contextPaths = Array.from(
    new Set([
      ...planPaths,
      "src/lib/auth.ts",
      "src/lib/supabase.ts",
      "src/app/api/leads/route.ts",
      ".env.example",
      "package.json",
    ]),
  );
  const contextFiles = await readSelectedFiles(adapter, contextPaths);
  const contextBlob = contextFiles
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  let generated = fallbackCodegen(
    contextFiles.find((f) => f.path === ".env.example")?.content ||
      "NEXT_PUBLIC_SUPABASE_URL=\n",
  );

  try {
    if (process.env.XAI_API_KEY) {
      const gen = await askGrokStructured({
        schema: CodeGenSchema,
        schemaName: "CodeGeneration",
        messages: [
          { role: "system", content: CODE_GENERATION_SYSTEM },
          {
            role: "user",
            content: codeGenerationUserPrompt({
              vendorSummary: vendorSummary(company),
              planJson: JSON.stringify(planJson),
              analysisJson: JSON.stringify(ws.analysis_json || {}),
              contextFiles: contextBlob,
              objective,
            }),
          },
        ],
      });
      generated = {
        summary: gen.summary ?? "",
        files: gen.files ?? [],
      };
      // Ensure critical files exist even if model omits them
      if (!generated.files.some((f) => /grok-fde\.ts$/i.test(f.path))) {
        const fb = fallbackCodegen(
          contextFiles.find((f) => f.path === ".env.example")?.content || "",
        );
        generated.files.push(...fb.files);
      }
    }
  } catch (err) {
    console.warn("[implementation] codegen failed, using fallback", err);
    generated = fallbackCodegen(
      contextFiles.find((f) => f.path === ".env.example")?.content || "",
    );
  }

  // Safety filter
  const { accepted, rejected } = filterSafeOperations(
    generated.files.map((f) => ({
      path: f.path,
      operation: f.operation,
      content: f.content,
      purpose: f.purpose,
    })),
  );

  if (rejected.length) {
    runEvents = pushEvent(
      runEvents,
      "file_modified",
      `Rejected ${rejected.length} unsafe path(s)`,
    );
  }

  // Load originals for modify
  const fileRows: GeneratedFile[] = [];
  for (const op of accepted) {
    let original: string | null = null;
    if (op.operation === "modify") {
      try {
        original = await adapter.readRepositoryFile(op.path);
      } catch {
        original = null;
      }
    }
    // If modifying .env.example and model gave partial content, merge
    let content = op.content || "";
    if (op.path === ".env.example" && original && !/GROK_FDE|XAI_API_KEY/i.test(content)) {
      content = `${original.trim()}\n\n# Grok FDE\nGROK_FDE_API_KEY=\nXAI_API_KEY=\n`;
    }
    if (op.path === ".env.example" && original && content && !content.includes("NEXT_PUBLIC")) {
      content = `${original.trim()}\n\n${content.trim()}\n`;
    }
    fileRows.push({
      path: normalizeRepoPath(op.path),
      operation: op.operation as "create" | "modify",
      content,
      originalContent: original,
    });
    runEvents = pushEvent(
      runEvents,
      "file_modified",
      `${op.operation} ${normalizeRepoPath(op.path)}`,
    );
  }

  // Write to branch
  await adapter.writeFilesToBranch(
    branchName,
    fileRows.map((f) => ({
      path: f.path,
      operation: f.operation,
      content: f.content,
    })),
  );

  // Persist files
  for (const f of fileRows) {
    const diff = unifiedDiff(f.path, f.originalContent || "", f.content || "");
    await db.from("implementation_files").insert({
      run_id: run.id,
      path: f.path,
      operation: f.operation,
      original_content: f.originalContent,
      new_content: f.content,
      diff,
    });
  }

  // Validate / test
  await db
    .from("implementation_runs")
    .update({ status: "testing", events_json: runEvents })
    .eq("id", run.id);
  await updateWorkspace(ws.id, { status: "testing" });
  runEvents = pushEvent(runEvents, "test_started", "Running static validation and smoke checks");

  const tree = await adapter.listRepositoryFiles();
  let validations = validateGeneratedFiles({
    files: fileRows,
    planPaths,
    existingPaths: tree.filter((t) => t.type === "file").map((t) => t.path),
  });

  // Optional intentional soft-fail + repair demo if first validation has env issue
  let repairAttempts = 0;
  while (!allValidationsPassed(validations) && repairAttempts < MAX_REPAIR_ATTEMPTS) {
    repairAttempts += 1;
    runEvents = pushEvent(
      runEvents,
      "repair_started",
      `Repair attempt ${repairAttempts}`,
    );
    await db
      .from("implementation_runs")
      .update({
        status: "repairing",
        repair_attempts: repairAttempts,
        events_json: runEvents,
      })
      .eq("id", run.id);

    const failures = validations
      .filter((v) => v.status === "failed")
      .map((v) => `${v.name}: ${v.output}`)
      .join("\n");

    let repair = {
      rootCause: "validation failure",
      summary: "repair",
      files: [] as Array<{
        path: string;
        operation: "create" | "modify";
        content: string;
      }>,
    };

    try {
      if (process.env.XAI_API_KEY) {
        const repaired = await askGrokStructured({
          schema: RepairSchema,
          schemaName: "CodeRepair",
          messages: [
            { role: "system", content: CODE_REPAIR_SYSTEM },
            {
              role: "user",
              content: codeRepairUserPrompt({
                planJson: JSON.stringify(planJson),
                currentFiles: fileRows
                  .map((f) => `--- ${f.path} ---\n${f.content}`)
                  .join("\n\n"),
                failures,
                contextFiles: contextBlob,
              }),
            },
          ],
        });
        repair = {
          rootCause: repaired.rootCause ?? "validation failure",
          summary: repaired.summary ?? "repair",
          files: repaired.files ?? [],
        };
      } else {
        // Deterministic repair: ensure env + route auth
        repair = {
          rootCause: "Missing env keys or incomplete FDE files",
          summary: "Re-applied canonical FDE integration files",
          files: fallbackCodegen(
            contextFiles.find((f) => f.path === ".env.example")?.content || "",
          ).files,
        };
      }
    } catch {
      repair = {
        rootCause: "repair model failed",
        summary: "fallback repair",
        files: fallbackCodegen(
          contextFiles.find((f) => f.path === ".env.example")?.content || "",
        ).files,
      };
    }

    const { accepted: repairAccepted } = filterSafeOperations(
      repair.files.map((f) => ({
        path: f.path,
        operation: f.operation,
        content: f.content,
      })),
    );

    for (const op of repairAccepted) {
      const idx = fileRows.findIndex(
        (f) => f.path === normalizeRepoPath(op.path),
      );
      const original =
        idx >= 0
          ? fileRows[idx].originalContent
          : await adapter.readRepositoryFile(op.path).catch(() => null);
      const next: GeneratedFile = {
        path: normalizeRepoPath(op.path),
        operation: op.operation as "create" | "modify",
        content: op.content,
        originalContent: original,
      };
      if (idx >= 0) fileRows[idx] = next;
      else fileRows.push(next);
    }

    await adapter.writeFilesToBranch(
      branchName,
      fileRows.map((f) => ({
        path: f.path,
        operation: f.operation,
        content: f.content,
      })),
    );

    // Replace file rows in DB for this run
    await db.from("implementation_files").delete().eq("run_id", run.id);
    for (const f of fileRows) {
      await db.from("implementation_files").insert({
        run_id: run.id,
        path: f.path,
        operation: f.operation,
        original_content: f.originalContent,
        new_content: f.content,
        diff: unifiedDiff(f.path, f.originalContent || "", f.content || ""),
      });
    }

    validations = validateGeneratedFiles({
      files: fileRows,
      planPaths,
      existingPaths: tree.filter((t) => t.type === "file").map((t) => t.path),
    });

    runEvents = pushEvent(
      runEvents,
      "repair_completed",
      repair.summary || `Repair attempt ${repairAttempts} finished`,
    );
  }

  // Save tests
  await db.from("implementation_tests").delete().eq("run_id", run.id);
  for (const v of validations) {
    await db.from("implementation_tests").insert({
      run_id: run.id,
      name: v.name,
      status: v.status === "validated" ? "validated" : v.status,
      command: v.command ?? null,
      output: v.output,
      kind: v.kind,
    });
  }

  const passed = allValidationsPassed(validations);
  for (const v of validations) {
    runEvents = pushEvent(
      runEvents,
      v.status === "failed" ? "test_failed" : "test_passed",
      v.name,
    );
  }

  const diffs = await adapter.getDiff(branchName);

  // On a real repository, GitHub's own patch is the truth about what landed on
  // the branch. Replace the locally computed diff with it so the reviewer reads
  // the same hunks the pull request will show.
  if (adapter.mode === "real") {
    for (const d of diffs) {
      if (!d.diff) continue;
      await db
        .from("implementation_files")
        .update({ diff: d.diff })
        .eq("run_id", run.id)
        .eq("path", d.path);
    }
  }

  const status = passed ? "ready_for_review" : "failed";

  await db
    .from("implementation_runs")
    .update({
      status,
      repair_attempts: repairAttempts,
      events_json: runEvents,
      summary_json: {
        objective,
        summary: generated.summary,
        rejectedPaths: rejected,
        validation: passed ? "passed" : "failed",
        mode: adapter.mode,
        repository: adapter.repositoryName,
        defaultBranch: adapter.defaultBranch,
        note: passed
          ? "Static validation and smoke checks passed (VALIDATED). Full runtime TESTED requires a sandbox runner."
          : "Validation failed after repair attempts",
      },
      diff_summary_json: { files: diffs.length, paths: diffs.map((d) => d.path) },
      error_message: passed ? null : "Validation failed",
    })
    .eq("id", run.id);

  await updateWorkspace(ws.id, {
    status: passed ? "ready_for_review" : "failed",
    events_json: pushEvent(
      ws.events_json,
      passed ? "pr_ready" : "implementation_failed",
      passed ? "Implementation ready for human review" : "Implementation failed validation",
    ),
  });

  return {
    runId: run.id as string,
    status,
    branchName,
  };
}

// ─── Get run ───────────────────────────────────────────────────────

export async function getImplementationRun(runId: string) {
  const db = getSupabaseAdmin();
  const { data: run, error } = await db
    .from("implementation_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error || !run) {
    throw new ApiError("NOT_FOUND", "Implementation run not found", { status: 404 });
  }

  const { data: files } = await db
    .from("implementation_files")
    .select("*")
    .eq("run_id", runId)
    .order("path");

  const { data: tests } = await db
    .from("implementation_tests")
    .select("*")
    .eq("run_id", runId)
    .order("created_at");

  const summary = (run.summary_json || {}) as Record<string, unknown>;
  const pr = (run.pr_json || {}) as Record<string, unknown>;

  return {
    id: run.id,
    workspaceId: run.workspace_id,
    planId: run.plan_id,
    status: run.status,
    branchName: run.branch_name,
    summary:
      (summary.summary as string) ||
      (summary.objective as string) ||
      "Implementation run",
    summaryJson: summary,
    files: (files || []).map((f) => ({
      id: f.id,
      path: f.path,
      operation: f.operation,
      diff: f.diff,
      // content available for UI if needed
      content: f.new_content,
    })),
    tests: (tests || []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      command: t.command,
      output: t.output,
      kind: t.kind,
    })),
    events: run.events_json || [],
    pullRequest: Object.keys(pr).length ? pr : null,
    repairAttempts: run.repair_attempts,
    errorMessage: run.error_message,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

// ─── PR ────────────────────────────────────────────────────────────

export async function createPullRequestForRun(runId: string) {
  const db = getSupabaseAdmin();
  const runView = await getImplementationRun(runId);
  if (runView.status !== "ready_for_review") {
    throw new ApiError(
      "BAD_REQUEST",
      "Pull request requires status ready_for_review",
      { status: 400 },
    );
  }

  const { data: run } = await db
    .from("implementation_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (!run) throw new ApiError("NOT_FOUND", "Run not found", { status: 404 });

  const repo = await getPrimaryRepo(run.workspace_id as string);
  const adapter = await adapterForRepo(repo);
  const branchName = run.branch_name as string;

  const title = "Integrate Grok FDE";
  const body = [
    "## Summary",
    runView.summary,
    "",
    "## Files changed",
    ...runView.files.map((f) => `- \`${f.operation}\` ${f.path}`),
    "",
    "## Validation",
    ...runView.tests.map((t) => `- ${t.status}: ${t.name}`),
    "",
    `Branch \`${branchName}\` targets \`${adapter.defaultBranch}\`. Prepared by the Grok FDE agent.`,
    "Nothing here merges without a human review.",
  ].join("\n");

  const pr = await adapter.createPullRequest({ branchName, title, body });
  const real = pr.status === "ready";

  const events = pushEvent(
    run.events_json,
    "pr_ready",
    real
      ? `Pull request #${pr.number} opened: ${pr.pullRequestUrl}`
      : "Offline sample repository, so no pull request was opened",
  );

  // The runs table's status check constraint has no "pr_ready" value, and this
  // code cannot run DDL. Writing one silently voided the whole update, which
  // dropped pr_json on the floor and left the UI offering to open a pull
  // request that already existed. The run stays ready_for_review; the presence
  // of pr_json is what says a pull request is open.
  const { error: prErr } = await db
    .from("implementation_runs")
    .update({
      pr_json: { ...pr, mode: adapter.mode, base: adapter.defaultBranch },
      events_json: events,
    })
    .eq("id", runId);

  if (prErr) {
    throw new ApiError(
      "INTERNAL_ERROR",
      `Pull request ${pr.pullRequestUrl} was opened but could not be recorded: ${prErr.message}`,
      { status: 500 },
    );
  }

  return {
    status: real ? ("ready" as const) : ("simulated" as const),
    pullRequestUrl: pr.pullRequestUrl,
    branchName: pr.branchName,
    base: adapter.defaultBranch,
    title: pr.title,
    number: pr.number,
    mode: adapter.mode,
    simulated: !real,
  };
}

// ─── Issue support: read, draft with Grok, post ─────────────────────

/**
 * Support tickets, but they are GitHub issues on the customer's own repository.
 * Drafting and posting are deliberately separate calls: a draft is free and
 * reviewable, a post is public and permanent.
 */
export type IssueReplyResult = {
  repository: string;
  issue: GitHubIssue;
  comments: IssueComment[];
  draft: string;
  model: string;
  posted: boolean;
  commentUrl: string | null;
};

function requireGitHub(): void {
  if (!hasGitHubToken()) {
    throw new ApiError(
      "UNAUTHORIZED",
      "The server has no GITHUB_TOKEN, so it cannot read or answer GitHub issues.",
      { status: 401, recoverable: false },
    );
  }
}

export async function listRepositoryIssues(args: {
  repository: string;
  state?: "open" | "closed" | "all";
}) {
  requireGitHub();
  const ref = unwrapGitHub(parseRepositoryName(args.repository));
  const repo = unwrapGitHub(await getRepository(ref));
  const issues = unwrapGitHub(await listIssues(ref, { state: args.state ?? "open" }));
  return {
    repository: repo.fullName,
    repositoryUrl: repo.htmlUrl,
    defaultBranch: repo.defaultBranch,
    issues,
  };
}

export async function answerRepositoryIssue(args: {
  companyId: string;
  repository: string;
  issueNumber: number;
  /** false drafts only. true posts the comment to GitHub. */
  post: boolean;
  /** Optional human-edited body. When present it is posted verbatim. */
  body?: string;
}): Promise<IssueReplyResult> {
  requireGitHub();
  const company = await getCompanyById(args.companyId);
  const ref = unwrapGitHub(parseRepositoryName(args.repository));
  const repo = unwrapGitHub(await getRepository(ref));
  const { issue, comments } = unwrapGitHub(await getIssue(ref, args.issueNumber));

  let draft = (args.body || "").trim();
  let model = "human";

  if (!draft) {
    // Give the agent the shape of the customer's codebase, so the reply can name
    // real files instead of generic advice.
    let repoContext = "";
    try {
      const adapter = createRepositoryAdapter({
        provider: "github",
        repositoryName: repo.fullName,
        defaultBranch: repo.defaultBranch,
      });
      await adapter.ready();
      const tree = await adapter.listRepositoryFiles();
      repoContext = treeString(tree);
    } catch {
      /* the reply is still useful without the tree */
    }

    const drafted = unwrapGitHub(
      await draftIssueReply({
        repository: repo.fullName,
        issue,
        comments,
        agentName: agentDisplayName(company),
        vendorName: company.name,
        vendorKnowledge: vendorSummary(company),
        repoContext,
      }),
    );
    draft = drafted.body;
    model = drafted.model;
  }

  if (!args.post) {
    return {
      repository: repo.fullName,
      issue,
      comments,
      draft,
      model,
      posted: false,
      commentUrl: null,
    };
  }

  const posted = unwrapGitHub(await createIssueComment(ref, issue.number, draft));
  return {
    repository: repo.fullName,
    issue,
    comments: [...comments, posted],
    draft,
    model,
    posted: true,
    commentUrl: posted.htmlUrl,
  };
}
