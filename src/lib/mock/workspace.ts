import type {
  ArchitectureData,
  ImplementationEvent,
  ImplementationFile,
  ImplementationPlan,
  ImplementationRun,
  ImplementationTest,
  Workspace,
  WorkspaceAnalysis,
  WorkspaceRepository,
} from "@/types/ui";
import { sleep, uid } from "@/lib/utils";
import { loadStore, saveStore, updateStore, type MockStore } from "./store";

const WORKSPACE_KEY = "grok-fde-workspaces-v1";

interface WorkspaceStore {
  workspaces: Record<string, Workspace>;
  runs: Record<string, ImplementationRun>;
  /** Simulated run timelines keyed by runId */
  runTimers: Record<string, number>;
}

function emptyWsStore(): WorkspaceStore {
  return { workspaces: {}, runs: {}, runTimers: {} };
}

function loadWs(): WorkspaceStore {
  if (typeof window === "undefined") return emptyWsStore();
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return emptyWsStore();
    const parsed = JSON.parse(raw) as WorkspaceStore;
    return {
      workspaces: parsed.workspaces ?? {},
      runs: parsed.runs ?? {},
      runTimers: {},
    };
  } catch {
    return emptyWsStore();
  }
}

function saveWs(store: WorkspaceStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    WORKSPACE_KEY,
    JSON.stringify({ workspaces: store.workspaces, runs: store.runs })
  );
}

function updateWs(mutator: (s: WorkspaceStore) => void): WorkspaceStore {
  const s = loadWs();
  mutator(s);
  saveWs(s);
  return s;
}

async function latency(min = 300, max = 800) {
  await sleep(min + Math.floor(Math.random() * (max - min)));
}

function now() {
  return new Date().toISOString();
}

const DEMO_DIFFS: Record<string, string> = {
  "src/lib/grok-fde.ts": `+ import { z } from "zod";
+
+ const FDE_BASE = process.env.GROK_FDE_API_URL ?? "https://api.grok-fde.dev";
+
+ export const fdeMessageSchema = z.object({
+   message: z.string().min(1),
+   prospectId: z.string().optional(),
+ });
+
+ export type FdeMessageInput = z.infer<typeof fdeMessageSchema>;
+
+ /** Thin server-side wrapper for the Grok FDE vendor API. */
+ export async function sendToFde(input: FdeMessageInput) {
+   const apiKey = process.env.GROK_FDE_API_KEY;
+   if (!apiKey) {
+     throw new Error("GROK_FDE_API_KEY is not configured");
+   }
+
+   const res = await fetch(\`\${FDE_BASE}/v1/chat\`, {
+     method: "POST",
+     headers: {
+       Authorization: \`Bearer \${apiKey}\`,
+       "Content-Type": "application/json",
+     },
+     body: JSON.stringify(input),
+   });
+
+   if (!res.ok) {
+     throw new Error(\`Grok FDE request failed: \${res.status}\`);
+   }
+
+   return res.json();
+ }
`,
  "src/app/api/fde/route.ts": `+ import { NextResponse } from "next/server";
+ import { fdeMessageSchema, sendToFde } from "@/lib/grok-fde";
+ import { requireSession } from "@/lib/auth";
+
+ export async function POST(req: Request) {
+   const session = await requireSession(req);
+   if (!session) {
+     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
+   }
+
+   const body = await req.json();
+   const parsed = fdeMessageSchema.safeParse(body);
+   if (!parsed.success) {
+     return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
+   }
+
+   const result = await sendToFde({
+     ...parsed.data,
+     prospectId: session.userId,
+   });
+
+   return NextResponse.json(result);
+ }
`,
  ".env.example": `  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
+ GROK_FDE_API_KEY=
+ GROK_FDE_API_URL=https://api.grok-fde.dev
`,
};

function mockFiles(): ImplementationFile[] {
  return Object.entries(DEMO_DIFFS).map(([path, diff]) => ({
    path,
    operation: path === ".env.example" ? ("modify" as const) : ("create" as const),
    diff,
  }));
}

export async function mockCreateWorkspace(input: {
  prospectId: string;
  conversationId: string;
}): Promise<Workspace> {
  await latency(250, 500);
  const existing = Object.values(loadWs().workspaces).find(
    (w) => w.conversationId === input.conversationId
  );
  if (existing) return existing;

  const workspace: Workspace = {
    id: uid("workspace"),
    prospectId: input.prospectId,
    conversationId: input.conversationId,
    status: "discovery",
    objective: "Integrate Grok FDE into existing customer application.",
    createdAt: now(),
    updatedAt: now(),
  };
  updateWs((s) => {
    s.workspaces[workspace.id] = workspace;
  });
  return workspace;
}

export async function mockGetWorkspace(id: string): Promise<Workspace | null> {
  await latency(100, 250);
  return loadWs().workspaces[id] ?? null;
}

export async function mockGetWorkspaceByConversation(
  conversationId: string
): Promise<Workspace | null> {
  await latency(100, 250);
  return (
    Object.values(loadWs().workspaces).find((w) => w.conversationId === conversationId) ?? null
  );
}

export async function mockConnectRepository(
  workspaceId: string,
  input: { provider: "demo" | "github"; repository?: string }
): Promise<WorkspaceRepository> {
  await latency(400, 900);
  if (input.provider === "github") {
    throw new Error("GitHub connection is not available in mock mode. Use the demo repository.");
  }
  const repo: WorkspaceRepository = {
    id: uid("repo"),
    repositoryName: input.repository || "globex/platform",
    defaultBranch: "main",
    status: "connected",
    provider: "demo",
  };
  updateWs((s) => {
    const w = s.workspaces[workspaceId];
    if (!w) throw new Error("Workspace not found");
    w.repository = repo;
    w.status = "connected";
    w.updatedAt = now();
  });
  return repo;
}

export async function mockAnalyzeWorkspace(workspaceId: string): Promise<WorkspaceAnalysis> {
  await latency(1400, 2200);
  const analysis: WorkspaceAnalysis = {
    status: "analyzed",
    stack: ["Next.js", "TypeScript", "Supabase"],
    architectureSummary:
      "App Router Next.js service with Supabase auth helpers and existing server route patterns under src/app/api. Clean place to attach a vendor FDE endpoint without touching client auth.",
    importantFiles: [
      { path: "src/lib/auth.ts", reason: "Existing authentication helper" },
      { path: "src/lib/supabase.ts", reason: "Current database abstraction" },
      { path: "src/app/api/leads/route.ts", reason: "Existing server route pattern" },
    ],
    integrationPoints: [
      "Server API route alongside existing /api/leads pattern",
      "Existing prospect/auth session context via requireSession",
      "Environment-based API key configuration",
    ],
    risks: [
      "Requires server-side API key (GROK_FDE_API_KEY)",
      "Outbound network access to Grok FDE API must be allowed",
    ],
  };
  updateWs((s) => {
    const w = s.workspaces[workspaceId];
    if (!w) throw new Error("Workspace not found");
    w.analysis = analysis;
    w.status = "analyzed";
    w.updatedAt = now();
  });
  return analysis;
}

export async function mockCreatePlan(
  workspaceId: string,
  input: { objective?: string }
): Promise<ImplementationPlan> {
  await latency(700, 1200);
  const plan: ImplementationPlan = {
    planId: uid("plan"),
    objective: input.objective || "Integrate Grok FDE into this application.",
    summary:
      "Add Grok FDE through the customer's existing server-side API pattern without modifying authentication.",
    changes: [
      {
        path: "src/lib/grok-fde.ts",
        operation: "create",
        purpose: "Vendor API wrapper with typed request validation",
      },
      {
        path: "src/app/api/fde/route.ts",
        operation: "create",
        purpose: "Technical prospect interaction endpoint",
      },
      {
        path: ".env.example",
        operation: "modify",
        purpose: "Document GROK_FDE_API_KEY and API URL",
      },
    ],
    tests: [
      "API response schema validates",
      "Unauthorized requests rejected",
      "Existing auth remains unchanged",
    ],
    risks: ["Server-side API key required", "Depends on outbound HTTPS to Grok FDE"],
    requiresApproval: true,
  };
  updateWs((s) => {
    const w = s.workspaces[workspaceId];
    if (!w) throw new Error("Workspace not found");
    w.plan = plan;
    w.status = "planned";
    w.objective = plan.objective || w.objective;
    w.updatedAt = now();
  });
  return plan;
}

function pushEvent(run: ImplementationRun, type: string, label: string) {
  run.events.push({ type, label, at: now() });
  run.updatedAt = now();
}

/** Advance a mock run through build → fail one test → repair → ready */
function advanceRunSimulation(runId: string) {
  const steps: Array<{
    delay: number;
    apply: (run: ImplementationRun) => void;
  }> = [
    {
      delay: 600,
      apply: (run) => {
        run.status = "building";
        pushEvent(run, "implementation_started", "Implementation started on branch");
        pushEvent(run, "file_modified", "Prepared branch grok-fde/globex-integration");
      },
    },
    {
      delay: 900,
      apply: (run) => {
        run.files = [mockFiles()[0]];
        pushEvent(run, "file_modified", "Created src/lib/grok-fde.ts");
      },
    },
    {
      delay: 800,
      apply: (run) => {
        run.files = mockFiles().slice(0, 2);
        pushEvent(run, "file_modified", "Created src/app/api/fde/route.ts");
      },
    },
    {
      delay: 700,
      apply: (run) => {
        run.files = mockFiles();
        pushEvent(run, "file_modified", "Updated .env.example");
      },
    },
    {
      delay: 900,
      apply: (run) => {
        run.status = "testing";
        run.tests = [
          { name: "API response schema", status: "running" },
          { name: "Unauthorized requests rejected", status: "pending" },
          { name: "Existing auth remains unchanged", status: "pending" },
        ];
        pushEvent(run, "test_started", "Running validation suite");
      },
    },
    {
      delay: 1000,
      apply: (run) => {
        run.tests = [
          { name: "API response schema", status: "passed", output: "Schema OK" },
          {
            name: "Unauthorized requests rejected",
            status: "failed",
            output: "Expected 401, received 500 — missing auth guard on edge case",
          },
          { name: "Existing auth remains unchanged", status: "pending" },
        ];
        pushEvent(run, "test_failed", "Unauthorized requests rejected failed");
      },
    },
    {
      delay: 800,
      apply: (run) => {
        run.status = "repairing";
        pushEvent(run, "repair_started", "Repairing auth guard on FDE route");
      },
    },
    {
      delay: 1200,
      apply: (run) => {
        pushEvent(run, "file_modified", "Patched src/app/api/fde/route.ts auth check");
        pushEvent(run, "repair_completed", "Repair completed");
        run.status = "testing";
        run.tests = [
          { name: "API response schema", status: "running" },
          { name: "Unauthorized requests rejected", status: "pending" },
          { name: "Existing auth remains unchanged", status: "pending" },
        ];
        pushEvent(run, "test_started", "Re-running validation suite");
      },
    },
    {
      delay: 1100,
      apply: (run) => {
        run.tests = [
          { name: "API response schema", status: "passed", output: "3 assertions passed" },
          {
            name: "Unauthorized requests rejected",
            status: "passed",
            output: "Returns 401 without session",
          },
          {
            name: "Existing auth remains unchanged",
            status: "passed",
            output: "requireSession behavior unchanged",
          },
        ];
        run.status = "ready_for_review";
        run.summary =
          "Added Grok FDE integration using existing server patterns. One auth edge case was repaired automatically.";
        pushEvent(run, "test_passed", "All checks passed");
        updateWs((s) => {
          const w = s.workspaces[run.workspaceId];
          if (w) {
            w.status = "ready_for_review";
            w.updatedAt = now();
          }
        });
        // Notify conversation
        notifyConversation(run.workspaceId, "ready_for_review");
      },
    },
  ];

  let cumulative = 0;
  for (const step of steps) {
    cumulative += step.delay;
    setTimeout(() => {
      updateWs((s) => {
        const run = s.runs[runId];
        if (!run) return;
        if (run.status === "pr_ready") return;
        step.apply(run);
        s.runs[runId] = run;
      });
    }, cumulative);
  }
}

function notifyConversation(workspaceId: string, kind: "building" | "ready_for_review" | "pr_ready") {
  const ws = loadWs().workspaces[workspaceId];
  if (!ws) return;
  const store = loadStore();
  const msgs = store.messages[ws.conversationId] ?? [];
  const content =
    kind === "building"
      ? "Implementation started on branch grok-fde/globex-integration. Building against the approved plan."
      : kind === "ready_for_review"
        ? "Implementation is ready for review. All checks passed after one automatic repair. Open the workspace to inspect the diff."
        : "Pull request prepared: grok-fde/globex-integration → main. Awaiting human approval.";

  msgs.push({
    id: uid("msg"),
    conversationId: ws.conversationId,
    channel: "system",
    role: "system",
    content,
    metadata: { workspaceId, implementationStatus: kind },
    createdAt: now(),
  });
  updateStore((s) => {
    s.messages[ws.conversationId] = msgs;
    const c = s.conversations.find((x) => x.id === ws.conversationId);
    if (c) {
      c.lastChannel = "system";
      c.lastMessagePreview = content.slice(0, 140);
      c.updatedAt = now();
    }
    const p = s.prospects.find((x) => x.id === ws.prospectId);
    if (p) {
      p.memory = {
        ...p.memory,
        stage: kind === "pr_ready" ? "architecture-review" : "implementation",
        nextAction:
          kind === "pr_ready"
            ? "Review pull request"
            : kind === "ready_for_review"
              ? "Review implementation diff"
              : "Monitor implementation run",
      };
      // allow custom stage string
      p.memory.stage = kind === "building" ? "implementation" : p.memory.stage;
      p.updatedAt = now();
    }
  });
  void store;
}

export async function mockStartBuild(
  workspaceId: string,
  input: { planId: string }
): Promise<{ runId: string; status: string }> {
  await latency(400, 700);
  const wsStore = loadWs();
  const w = wsStore.workspaces[workspaceId];
  if (!w) throw new Error("Workspace not found");
  if (!w.plan || w.plan.planId !== input.planId) throw new Error("Plan not found");

  const run: ImplementationRun = {
    id: uid("run"),
    workspaceId,
    status: "queued",
    branchName: "grok-fde/globex-integration",
    files: [],
    tests: [],
    events: [
      { type: "repository_analyzed", label: "Detected Next.js, TypeScript, and Supabase", at: now() },
      { type: "implementation_plan_ready", label: "Implementation plan approved", at: now() },
    ],
    createdAt: now(),
    updatedAt: now(),
  };

  updateWs((s) => {
    s.runs[run.id] = run;
    const ww = s.workspaces[workspaceId];
    if (ww) {
      ww.activeRunId = run.id;
      ww.status = "building";
      ww.updatedAt = now();
    }
  });

  notifyConversation(workspaceId, "building");
  advanceRunSimulation(run.id);

  return { runId: run.id, status: "building" };
}

export async function mockGetRun(runId: string): Promise<ImplementationRun | null> {
  await latency(80, 180);
  return loadWs().runs[runId] ?? null;
}

export async function mockPreparePr(runId: string): Promise<ImplementationRun> {
  await latency(600, 1100);
  const before = loadWs().runs[runId];
  if (!before) throw new Error("Run not found");
  if (before.status !== "ready_for_review" && before.status !== "pr_ready") {
    throw new Error("Run is not ready for PR");
  }

  updateWs((s) => {
    const run = s.runs[runId];
    if (!run) return;
    run.status = "pr_ready";
    run.pr = {
      number: 42,
      title: "feat: integrate Grok FDE via existing API patterns",
      url: "https://github.com/globex/platform/pull/42",
      branchName: run.branchName,
      status: "ready",
    };
    pushEvent(run, "pr_ready", "Pull request ready for human review");
    run.summary =
      run.summary ||
      "Added Grok FDE integration using existing server patterns. Ready for human review.";
    s.runs[runId] = run;
    const w = s.workspaces[run.workspaceId];
    if (w) {
      w.status = "ready_for_review";
      w.updatedAt = now();
    }
  });

  const result = loadWs().runs[runId];
  if (!result) throw new Error("Run not found");
  notifyConversation(result.workspaceId, "pr_ready");
  return result;
}

export function mockFitArchitecture(prospectName: string, companyName: string): {
  current: ArchitectureData;
  withFde: ArchitectureData;
} {
  return {
    current: {
      title: `${prospectName} today`,
      nodes: [
        { id: "next", label: "Next.js", kind: "stack" },
        { id: "supabase", label: "Supabase", kind: "data" },
        { id: "app", label: "Existing app", kind: "edge" },
      ],
      edges: [
        { from: "next", to: "supabase" },
        { from: "supabase", to: "app" },
      ],
      notes: ["Auth and data already centralized", "Server routes under /api"],
    },
    withFde: {
      title: `${prospectName} + ${companyName}`,
      nodes: [
        { id: "next", label: "Next.js", kind: "stack" },
        { id: "api", label: "Existing API layer", kind: "edge" },
        { id: "fde", label: companyName, kind: "core" },
        { id: "knowledge", label: "Company knowledge", kind: "data" },
        { id: "mcp", label: "MCP tools", kind: "tool" },
      ],
      edges: [
        { from: "next", to: "api" },
        { from: "api", to: "fde" },
        { from: "fde", to: "knowledge" },
        { from: "fde", to: "mcp" },
      ],
      notes: [
        "No auth rewrite",
        "FDE attaches as one server route + wrapper",
        "Customer reviews PR before merge",
      ],
    },
  };
}

export function resetWorkspaces() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WORKSPACE_KEY);
}
