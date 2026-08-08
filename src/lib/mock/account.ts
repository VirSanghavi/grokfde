import type {
  AccountRoom,
  AccountStage,
  FieldSignal,
  FdeDashboardData,
  Playbook,
  SlackConnection,
  SlackThread,
  TimelineItem,
} from "@/types/ui";
import { sleep, uid } from "@/lib/utils";
import { buildDashboard, loadStore } from "./store";

const ACCOUNT_KEY = "grok-fde-accounts-v1";

interface AccountStore {
  accounts: Record<string, AccountRoom>;
  slackConnectedGlobally: boolean;
  threads: Record<string, SlackThread>;
  demoStep: number;
  fieldSignals: FieldSignal[];
  playbooks: Playbook[];
}

function now(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function empty(): AccountStore {
  return {
    accounts: {},
    slackConnectedGlobally: true,
    threads: {},
    demoStep: 0,
    fieldSignals: [],
    playbooks: [],
  };
}

function loadAcc(): AccountStore {
  if (typeof window === "undefined") return seedIfNeeded(empty());
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) {
      const s = seedIfNeeded(empty());
      saveAcc(s);
      return s;
    }
    return seedIfNeeded(JSON.parse(raw) as AccountStore);
  } catch {
    return seedIfNeeded(empty());
  }
}

function saveAcc(s: AccountStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s));
}

function updateAcc(mutator: (s: AccountStore) => void): AccountStore {
  const s = loadAcc();
  mutator(s);
  saveAcc(s);
  return s;
}

async function latency(a = 200, b = 500) {
  await sleep(a + Math.floor(Math.random() * (b - a)));
}

function stageLabel(stage: AccountStage): string {
  return stage.replace(/_/g, " ");
}

function seedGlobex(): AccountRoom {
  const prospectId = "pr_globex";
  const conversationId = "cv_globex";
  const threadIssueId = "thread_401";

  return {
    id: "acct_globex",
    prospectId,
    conversationId,
    name: "Globex",
    stage: "staging",
    successOutcome:
      "Reduce technical sales response time from 2 days to under 5 minutes for enterprise accounts.",
    successCriteria: [
      "Authentication works in staging",
      "95% eval pass rate",
      "Production deployment",
      "Customer team trained",
      "First 100 real sessions successful",
    ],
    stack: ["Next.js", "Supabase", "AWS", "Kubernetes", "Salesforce", "Slack"],
    atlasStatus: "Monitoring staging rollout",
    nextAction: "Validate staging auth after PR #142",
    nextMilestone: "Security Review",
    currentImplementation: "PR #142",
    currentEnvironment: "Staging",
    slack: {
      id: "slack_globex",
      workspaceName: "Globex",
      channelId: "C_GLOBEX_FDE",
      channelName: "#globex-grok-fde",
      status: "connected",
      botName: "Atlas",
      participantCount: 6,
      lastActiveAt: now(-120000),
      permissions: ["Read channel", "Post messages", "Read threads"],
    },
    milestones: [
      { id: "m1", label: "Discovery", status: "completed" },
      { id: "m2", label: "Architecture", status: "completed" },
      { id: "m3", label: "Repository Connected", status: "completed" },
      { id: "m4", label: "Integration Built", status: "completed" },
      { id: "m5", label: "Staging", status: "current" },
      { id: "m6", label: "Security Review", status: "upcoming" },
      { id: "m7", label: "Production", status: "upcoming" },
      { id: "m8", label: "Adoption Review", status: "upcoming" },
    ],
    blockers: [],
    decisions: [
      {
        id: "d1",
        title: "Authentication",
        decision: "Use existing JWT auth rather than a new OAuth flow.",
        rationale: "Avoids changing customer identity infrastructure.",
        source: "Call + Slack",
        createdAt: now(-86400000),
      },
      {
        id: "d2",
        title: "Deployment",
        decision: "Launch to staging first.",
        rationale: "Security team requires validation before production.",
        source: "Slack thread",
        createdAt: now(-43200000),
      },
    ],
    commitments: [
      {
        id: "c1",
        owner: "Atlas",
        description: "Monitor staging after PR #142 merge",
        status: "open",
        dueLabel: "Ongoing",
      },
      {
        id: "c2",
        owner: "Globex Security",
        description: "Confirm service account for production",
        status: "open",
        dueLabel: "Before launch",
      },
      {
        id: "c3",
        owner: "Globex",
        description: "Provide staging API credentials",
        status: "done",
      },
    ],
    deployment: {
      environment: "Staging",
      status: "validating",
      version: "PR #142",
      demo: true,
      checks: [
        { label: "Authentication", status: "passed" },
        { label: "API connectivity", status: "passed" },
        { label: "Webhook flow", status: "passed" },
        { label: "Customer acceptance", status: "running" },
      ],
      next: "Security approval → production",
    },
    adoption: undefined,
    quality: {
      scenarioPassRate: 94,
      policyAdherence: 100,
      toolCorrectness: 98,
      escalationAccuracy: 91,
      issues: 3,
      status: "PASSING",
    },
    issue: null,
    implementationRequest: null,
    timeline: [
      {
        id: "t1",
        type: "chat",
        title: "CHAT",
        summary: "Prospect explained Next.js + Supabase architecture and asked if Grok FDE fits.",
        createdAt: now(-7200000),
      },
      {
        id: "t2",
        type: "call",
        title: "CALL",
        summary: "Technical discovery call. Stack and residency constraints captured.",
        createdAt: now(-6800000),
      },
      {
        id: "t3",
        type: "implementation",
        title: "IMPLEMENTATION",
        summary: "Integration built on branch grok-fde/globex-integration.",
        createdAt: now(-5400000),
      },
      {
        id: "t4",
        type: "github",
        title: "GITHUB",
        summary: "PR #142 opened for review.",
        createdAt: now(-5000000),
      },
      {
        id: "t5",
        type: "slack",
        title: "SLACK",
        summary: "Atlas posted PR #142 link to #globex-grok-fde.",
        createdAt: now(-4900000),
        threadId: "thread_pr142",
      },
      {
        id: "t6",
        type: "deployment",
        title: "DEPLOYMENT",
        summary: "Staging validation in progress for PR #142.",
        createdAt: now(-3600000),
      },
    ],
    updatedAt: now(),
  };
}

function seedThreads(): Record<string, SlackThread> {
  return {
    thread_pr142: {
      id: "thread_pr142",
      channelName: "#globex-grok-fde",
      root: {
        id: "sm1",
        author: "Atlas",
        authorRole: "agent",
        text: "PR #142 is ready for review — Grok FDE integration via existing server routes. Nothing merges without your approval.",
        createdAt: now(-4900000),
      },
      replies: [
        {
          id: "sm2",
          author: "Jordan",
          authorRole: "customer",
          text: "Looking now. We'll run staging after merge.",
          createdAt: now(-4800000),
        },
      ],
    },
    thread_401: {
      id: "thread_401",
      channelName: "#globex-grok-fde",
      root: {
        id: "sm3",
        author: "Jordan",
        authorRole: "customer",
        text: "@Atlas staging started returning 401s after the new auth change.",
        createdAt: now(-60000),
      },
      replies: [
        {
          id: "sm4",
          author: "Atlas",
          authorRole: "agent",
          text: "I'm checking the integration and staging configuration now.",
          createdAt: now(-45000),
        },
      ],
    },
  };
}

function seedFieldSignals(): FieldSignal[] {
  return [
    {
      id: "fs1",
      type: "request",
      title: "Native Salesforce integration",
      accountCount: 7,
      recommendation: "Product opportunity — repeated field request across enterprise accounts.",
    },
    {
      id: "fs2",
      type: "issue",
      title: "MCP auth setup is confusing",
      accountCount: 5,
      recommendation: "Improve onboarding docs and default read-only MCP templates.",
    },
    {
      id: "fs3",
      type: "request",
      title: "EU-only data residency",
      accountCount: 4,
      recommendation: "Document residency modes; consider region-pinned collections.",
    },
    {
      id: "fs4",
      type: "pattern",
      title: "Webhook retry middleware written custom for 4 deployments",
      accountCount: 4,
      recommendation:
        "This implementation has now been written for 4 customers. Consider making it a native integration.",
    },
  ];
}

function seedPlaybooks(): Playbook[] {
  return [
    {
      id: "pb1",
      title: "Salesforce → Grok FDE",
      usedBy: 7,
      includes: ["OAuth setup", "Lead mapping", "Technical prospect memory"],
    },
    {
      id: "pb2",
      title: "Next.js + Supabase attach",
      usedBy: 5,
      includes: ["Server route pattern", "JWT passthrough", "Env key setup"],
    },
  ];
}

function seedIfNeeded(s: AccountStore): AccountStore {
  if (!s.accounts.acct_globex && !s.accounts["pr_globex"]) {
    const g = seedGlobex();
    s.accounts[g.id] = g;
    s.accounts[g.prospectId] = g; // alias by prospect id
  }
  if (!Object.keys(s.threads).length) s.threads = seedThreads();
  if (!s.fieldSignals?.length) s.fieldSignals = seedFieldSignals();
  if (!s.playbooks?.length) s.playbooks = seedPlaybooks();
  if (s.slackConnectedGlobally === undefined) s.slackConnectedGlobally = true;
  if (s.demoStep === undefined) s.demoStep = 0;
  return s;
}

export function resetAccounts() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCOUNT_KEY);
}

function getGlobex(s: AccountStore): AccountRoom {
  return s.accounts.acct_globex || s.accounts.pr_globex || seedGlobex();
}

export async function mockGetAccountRoom(prospectId: string): Promise<AccountRoom | null> {
  await latency();
  const s = loadAcc();
  // resolve by prospect id or account id
  const byKey = s.accounts[prospectId];
  if (byKey) return byKey;
  const found = Object.values(s.accounts).find(
    (a) => a.prospectId === prospectId || a.id === prospectId || a.name.toLowerCase() === prospectId
  );
  if (found) return found;
  // default globex for demo routes
  if (prospectId === "globex" || prospectId === "pr_globex") return getGlobex(s);
  return null;
}

export async function mockListAccounts(): Promise<AccountRoom[]> {
  await latency(100, 250);
  const s = loadAcc();
  const seen = new Set<string>();
  const list: AccountRoom[] = [];
  for (const a of Object.values(s.accounts)) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    list.push(a);
  }
  return list;
}

export async function mockConnectSlack(input?: {
  workspaceName?: string;
  channelName?: string;
  prospectId?: string;
}): Promise<SlackConnection> {
  await latency(400, 800);
  const conn: SlackConnection = {
    id: uid("slack"),
    workspaceName: input?.workspaceName || "Globex",
    channelId: "C_GLOBEX_FDE",
    channelName: input?.channelName || "#globex-grok-fde",
    status: "connected",
    botName: "Atlas",
    participantCount: 6,
    lastActiveAt: now(),
    permissions: ["Read channel", "Post messages", "Read threads", "React to mentions"],
  };
  updateAcc((s) => {
    s.slackConnectedGlobally = true;
    const acct = getGlobex(s);
    acct.slack = conn;
    acct.updatedAt = now();
    s.accounts[acct.id] = acct;
    s.accounts[acct.prospectId] = acct;
  });
  return conn;
}

export async function mockGetSlackChannels(): Promise<SlackConnection[]> {
  await latency(150, 300);
  const s = loadAcc();
  const acct = getGlobex(s);
  return acct.slack ? [acct.slack] : [];
}

export async function mockGetSlackThread(threadId: string): Promise<SlackThread | null> {
  await latency(120, 280);
  return loadAcc().threads[threadId] ?? null;
}

/** Advance the canonical staging-401 → fix → security → production demo */
export async function mockAdvanceAccountDemo(prospectId = "pr_globex"): Promise<AccountRoom> {
  await latency(500, 900);
  let result: AccountRoom | null = null;

  updateAcc((s) => {
    const acct = getGlobex(s);
    const step = s.demoStep;

    if (step === 0) {
      // Receive 401 issue
      const thread = s.threads.thread_401;
      acct.issue = {
        id: "iss_401",
        title: "401 authentication failures",
        environment: "Staging",
        firstReported: now(),
        source: "Slack",
        status: "investigating",
        atlasStatus: "Investigating auth header mismatch",
      };
      acct.atlasStatus = "Investigating staging 401s";
      acct.stage = "staging";
      acct.timeline = [
        ...acct.timeline,
        {
          id: uid("t"),
          type: "slack",
          title: "SLACK",
          summary: "Jordan reported staging 401s after the auth change.",
          createdAt: now(),
          threadId: "thread_401",
        },
        {
          id: uid("t"),
          type: "system",
          title: "ISSUE",
          summary: "Staging issue surfaced in Account Room — Atlas investigating.",
          createdAt: now(1000),
        },
      ];
      if (thread) {
        thread.replies = [
          ...thread.replies,
          {
            id: uid("sm"),
            author: "Atlas",
            authorRole: "agent",
            text: "I found the likely issue. Checking whether staging still sends the previous auth header.",
            createdAt: now(2000),
          },
        ];
      }
      s.demoStep = 1;
    } else if (step === 1) {
      acct.issue = {
        ...acct.issue!,
        status: "root_cause_found",
        rootCause:
          "Staging is sending X-Internal-Token; integration expects Authorization: Bearer.",
        atlasStatus: "Root cause found — preparing fix",
      };
      acct.atlasStatus = "Preparing auth header fix";
      acct.implementationRequest = {
        id: "ireq_auth",
        source: "Slack",
        request: "Align staging auth header with Authorization: Bearer",
        status: "building",
        createdAt: now(),
      };
      acct.timeline.push({
        id: uid("t"),
        type: "implementation",
        title: "IMPLEMENTATION",
        summary: "Atlas preparing auth header fix linked from Slack issue.",
        createdAt: now(),
      });
      s.demoStep = 2;
    } else if (step === 2) {
      acct.issue = {
        ...acct.issue!,
        status: "fix_ready",
        linkedPr: "PR #143",
        atlasStatus: "Fix ready for review",
      };
      acct.currentImplementation = "PR #143";
      acct.implementationRequest = {
        id: "ireq_auth",
        source: "Slack",
        request: "Align staging auth header with Authorization: Bearer",
        status: "done",
        createdAt: now(-60000),
      };
      const thread = s.threads.thread_401;
      if (thread) {
        thread.replies.push({
          id: uid("sm"),
          author: "Atlas",
          authorRole: "agent",
          text: "I found the issue. Staging was still using the old auth header (X-Internal-Token). I've prepared a fix in PR #143.",
          createdAt: now(),
        });
        thread.replies.push({
          id: uid("sm"),
          author: "Jordan",
          authorRole: "customer",
          text: "Thanks. Can we go to production after security approves?",
          createdAt: now(30000),
        });
        thread.replies.push({
          id: uid("sm"),
          author: "Atlas",
          authorRole: "agent",
          text: "Yes. I'll hold production until Globex security approves the service account. Tracking that as a blocker.",
          createdAt: now(45000),
        });
      }
      acct.blockers = [
        {
          id: "blk_sec",
          title: "Security approval for service account",
          description: "Globex security must approve before production rollout.",
          owner: "Globex Security",
          ownerKind: "customer",
          source: "Slack",
          status: "open",
          impact: "Production rollout",
          atlasAction: "Waiting for customer approval",
          createdAt: now(),
        },
      ];
      acct.milestones = acct.milestones.map((m) => {
        if (m.label === "Staging") return { ...m, status: "completed" };
        if (m.label === "Security Review") return { ...m, status: "current" };
        return m;
      });
      acct.nextMilestone = "Production";
      acct.nextAction = "Globex security approval";
      acct.atlasStatus = "Waiting on security approval";
      acct.commitments = [
        ...acct.commitments.filter((c) => c.owner !== "Atlas"),
        {
          id: uid("c"),
          owner: "Atlas",
          description: "Ship production after security approval",
          status: "open",
        },
        {
          id: "c2",
          owner: "Globex Security",
          description: "Confirm service account for production",
          status: "open",
          dueLabel: "Blocking launch",
        },
      ];
      acct.timeline.push(
        {
          id: uid("t"),
          type: "github",
          title: "GITHUB",
          summary: "PR #143 opened — auth header fix.",
          createdAt: now(),
        },
        {
          id: uid("t"),
          type: "slack",
          title: "SLACK",
          summary: "Atlas posted fix and PR #143 to the channel.",
          createdAt: now(1000),
          threadId: "thread_401",
        },
        {
          id: uid("t"),
          type: "blocker",
          title: "BLOCKER",
          summary: "Security approval required before production.",
          createdAt: now(2000),
        }
      );
      if (acct.deployment) {
        acct.deployment = {
          ...acct.deployment,
          status: "validating",
          version: "PR #143",
          checks: [
            { label: "Authentication", status: "passed" },
            { label: "API connectivity", status: "passed" },
            { label: "Webhook flow", status: "passed" },
            { label: "Security approval", status: "pending" },
          ],
          next: "Await security approval",
        };
      }
      s.demoStep = 3;
    } else if (step === 3) {
      // Security approved
      acct.blockers = acct.blockers.map((b) =>
        b.id === "blk_sec"
          ? { ...b, status: "resolved", resolvedAt: now(), atlasAction: "Unblocked" }
          : b
      );
      acct.stage = "staging";
      acct.deployment = {
        environment: "Staging",
        status: "ready_for_production",
        version: "PR #143",
        demo: true,
        checks: [
          { label: "Authentication", status: "passed" },
          { label: "API connectivity", status: "passed" },
          { label: "Webhook flow", status: "passed" },
          { label: "Security approval", status: "passed" },
        ],
        next: "Production rollout",
      };
      acct.milestones = acct.milestones.map((m) => {
        if (m.label === "Security Review") return { ...m, status: "completed" };
        if (m.label === "Production") return { ...m, status: "current" };
        return m;
      });
      acct.nextAction = "Roll out to production";
      acct.atlasStatus = "Ready for production";
      acct.timeline.push({
        id: uid("t"),
        type: "milestone",
        title: "MILESTONE",
        summary: "Security approved. Deployment ready for production.",
        createdAt: now(),
      });
      const thread = s.threads.thread_401;
      if (thread) {
        thread.replies.push({
          id: uid("sm"),
          author: "Atlas",
          authorRole: "agent",
          text: "Security approved the service account. Staging is green — ready for production when you are.",
          createdAt: now(),
        });
      }
      s.demoStep = 4;
    } else {
      // Production
      acct.stage = "production";
      acct.issue = acct.issue
        ? { ...acct.issue, status: "resolved", atlasStatus: "Resolved in production" }
        : null;
      acct.deployment = {
        environment: "Production",
        status: "production",
        version: "PR #143",
        demo: true,
        checks: [
          { label: "Authentication", status: "passed" },
          { label: "API connectivity", status: "passed" },
          { label: "Webhook flow", status: "passed" },
          { label: "Customer acceptance", status: "passed" },
        ],
        next: "Adoption review",
      };
      acct.adoption = {
        liveFor: "2 days",
        runs: 248,
        successRate: 97.6,
        escalations: 3,
        customerUsers: 18,
        recommendation:
          "Most failures come from missing account IDs. Add input validation before expanding rollout.",
      };
      acct.milestones = acct.milestones.map((m) => {
        if (m.label === "Production") return { ...m, status: "completed" };
        if (m.label === "Adoption Review") return { ...m, status: "current" };
        if (m.status === "current") return { ...m, status: "completed" };
        return m;
      });
      acct.atlasStatus = "Monitoring production adoption";
      acct.nextAction = "Adoption review with Globex";
      acct.nextMilestone = "Adoption Review";
      acct.blockers = acct.blockers.map((b) => ({ ...b, status: "resolved" }));
      acct.timeline.push(
        {
          id: uid("t"),
          type: "deployment",
          title: "DEPLOYMENT",
          summary: "Production rollout completed successfully.",
          createdAt: now(),
        },
        {
          id: uid("t"),
          type: "slack",
          title: "SLACK",
          summary: "Atlas posted: Production rollout completed successfully.",
          createdAt: now(1000),
          threadId: "thread_401",
        }
      );
      const thread = s.threads.thread_401;
      if (thread) {
        thread.replies.push({
          id: uid("sm"),
          author: "Atlas",
          authorRole: "agent",
          text: "Production rollout completed successfully. I'll keep watching session health and flag anything unusual.",
          createdAt: now(),
        });
      }
      s.demoStep = 5;
    }

    acct.updatedAt = now();
    if (acct.slack) acct.slack.lastActiveAt = now();
    s.accounts[acct.id] = acct;
    s.accounts[acct.prospectId] = acct;
    result = acct;
  });

  return result!;
}

export async function mockResolveBlocker(accountId: string, blockerId: string) {
  await latency(300, 500);
  updateAcc((s) => {
    const acct = Object.values(s.accounts).find((a) => a.id === accountId || a.prospectId === accountId);
    if (!acct) return;
    acct.blockers = acct.blockers.map((b) =>
      b.id === blockerId ? { ...b, status: "resolved", resolvedAt: now() } : b
    );
    acct.updatedAt = now();
    s.accounts[acct.id] = acct;
    s.accounts[acct.prospectId] = acct;
  });
}

export async function mockGetFieldSignals(): Promise<FieldSignal[]> {
  await latency(150, 350);
  return loadAcc().fieldSignals;
}

export async function mockGetPlaybooks(): Promise<Playbook[]> {
  await latency(120, 280);
  return loadAcc().playbooks;
}

export async function mockGetFdeDashboard(): Promise<FdeDashboardData> {
  await latency(200, 400);
  const base = buildDashboard(loadStore());
  const accounts = await mockListAccounts();
  const unique = new Map(accounts.map((a) => [a.id, a]));
  const list = [...unique.values()];
  const blocked = list.filter((a) => a.blockers.some((b) => b.status === "open"));
  const production = list.filter((a) => a.stage === "production" || a.stage === "expansion");
  const implementations = list.filter((a) =>
    ["implementation", "staging", "proof_of_concept"].includes(a.stage)
  );
  const signals = loadAcc().fieldSignals;

  return {
    ...base,
    metrics: {
      ...base.metrics,
      activeAccounts: list.length || base.metrics.activeProspects,
      implementations: implementations.length || 1,
      production: production.length || (list[0]?.stage === "production" ? 1 : 0),
      blocked: blocked.length,
      needsHelp: base.metrics.needsHelp + blocked.length,
    },
    blockedAccounts: blocked.map((a) => ({
      id: a.prospectId,
      name: a.name,
      blocker: a.blockers.find((b) => b.status === "open")?.title || "Blocked",
    })),
    fieldSignalsPreview: signals.slice(0, 3),
    atlasActivity: [
      { label: "Monitoring Globex staging rollout", at: now(-120000) },
      { label: "Posted PR update to #globex-grok-fde", at: now(-3600000) },
      { label: "Captured residency requirement from Slack", at: now(-7200000) },
    ],
  };
}

export function accountStageLabel(stage: string) {
  return stageLabel(stage as AccountStage);
}
