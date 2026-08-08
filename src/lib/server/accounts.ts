import { ApiError } from "./errors";
import { parseProspectMemory } from "./merge";
import { getSupabaseAdmin } from "./supabase-admin";
import type { ProspectRow } from "./types";

export type AccountRow = {
  id: string;
  company_id: string;
  prospect_id: string;
  workspace_id: string | null;
  conversation_id: string | null;
  stage: string;
  success_outcome: string | null;
  success_criteria_json: unknown;
  account_summary_json: Record<string, unknown>;
  technical_environment_json: Record<string, unknown>;
  quality_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const DEFAULT_MILESTONES = [
  "Discovery",
  "Architecture",
  "Environment Connected",
  "Implementation",
  "Validation",
  "Staging",
  "Customer Acceptance",
  "Production",
  "Adoption Review",
];

export function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

export async function addTimelineEvent(
  accountId: string,
  type: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  const db = getSupabaseAdmin();
  await db.from("account_timeline_events").insert({
    account_id: accountId,
    type,
    summary,
    metadata_json: metadata,
  });
}

async function seedMilestones(accountId: string) {
  const db = getSupabaseAdmin();
  const rows = DEFAULT_MILESTONES.map((label, i) => ({
    account_id: accountId,
    label,
    description: label,
    status: i === 0 ? "current" : "upcoming",
    position: i,
  }));
  await db.from("account_milestones").insert(rows);
}

export async function createOrGetAccount(args: {
  prospectId: string;
  workspaceId?: string;
  conversationId?: string;
  stage?: string;
}): Promise<AccountRow> {
  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("accounts")
    .select("*")
    .eq("prospect_id", args.prospectId)
    .maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (args.workspaceId) patch.workspace_id = args.workspaceId;
    if (args.conversationId) patch.conversation_id = args.conversationId;
    if (Object.keys(patch).length) {
      const { data } = await db
        .from("accounts")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      return (data || existing) as AccountRow;
    }
    return existing as AccountRow;
  }

  const { data: prospect, error: pErr } = await db
    .from("prospects")
    .select("*")
    .eq("id", args.prospectId)
    .maybeSingle();
  if (pErr || !prospect) {
    throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
  }
  const p = prospect as ProspectRow;
  const memory = parseProspectMemory(p.memory_json);

  const { data, error } = await db
    .from("accounts")
    .insert({
      company_id: p.company_id,
      prospect_id: p.id,
      workspace_id: args.workspaceId ?? null,
      conversation_id: args.conversationId ?? null,
      stage: args.stage || (memory.stage === "new" ? "prospect" : "discovery"),
      success_outcome:
        "Customer can evaluate and deploy Grok FDE with technical continuity across chat, Slack, and implementation.",
      success_criteria_json: [
        "Slack connected",
        "FDE answers vendor questions from knowledge",
        "Prospect memory persists across channels",
        "Implementation integration ready for review",
        "Staging validated",
        "Production rollout successful",
      ],
      account_summary_json: {
        prospectCompany: p.company_name,
        personName: p.person_name,
        memorySummary: memory.summary,
      },
      technical_environment_json: {
        stack: memory.currentStack,
        requirements: memory.requirements,
      },
      quality_json: {
        source: "demo_fixture",
        scenarioPassRate: null,
        policyAdherence: null,
        note: "Quality metrics populated when evals/tests run",
      },
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not create account", {
      status: 500,
      details: error?.message,
    });
  }

  await seedMilestones(data.id);
  await db.from("deployment_states").insert({
    account_id: data.id,
    environment: "staging",
    status: "not_started",
    metadata_json: { simulated: true },
  });
  await addTimelineEvent(data.id, "system", "Account created from prospect engagement");

  return data as AccountRow;
}

export async function getAccount(id: string): Promise<AccountRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("accounts").select("*").eq("id", id).maybeSingle();
  if (error || !data) {
    throw new ApiError("NOT_FOUND", "Account not found", { status: 404 });
  }
  return data as AccountRow;
}

export async function updateAccount(
  id: string,
  patch: Partial<{
    stage: string;
    success_outcome: string;
    success_criteria_json: unknown;
    account_summary_json: Record<string, unknown>;
    technical_environment_json: Record<string, unknown>;
    quality_json: Record<string, unknown>;
    workspace_id: string | null;
    conversation_id: string | null;
  }>,
): Promise<AccountRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("accounts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not update account", {
      status: 500,
      details: error?.message,
    });
  }
  return data as AccountRow;
}

export async function setMilestoneStatus(
  accountId: string,
  label: string,
  status: "completed" | "current" | "upcoming" | "blocked",
) {
  const db = getSupabaseAdmin();
  await db
    .from("account_milestones")
    .update({ status })
    .eq("account_id", accountId)
    .ilike("label", label);
}

export async function advanceMilestoneOnEvent(
  accountId: string,
  event:
    | "repo_connected"
    | "implementation_ready"
    | "staging"
    | "production"
    | "discovery",
) {
  const map: Record<string, Array<{ label: string; status: "completed" | "current" }>> = {
    discovery: [
      { label: "Discovery", status: "completed" },
      { label: "Architecture", status: "current" },
    ],
    repo_connected: [
      { label: "Environment Connected", status: "completed" },
      { label: "Implementation", status: "current" },
    ],
    implementation_ready: [
      { label: "Implementation", status: "completed" },
      { label: "Validation", status: "completed" },
      { label: "Staging", status: "current" },
    ],
    staging: [
      { label: "Staging", status: "completed" },
      { label: "Customer Acceptance", status: "current" },
    ],
    production: [
      { label: "Customer Acceptance", status: "completed" },
      { label: "Production", status: "completed" },
      { label: "Adoption Review", status: "current" },
    ],
  };
  for (const step of map[event] || []) {
    await setMilestoneStatus(accountId, step.label, step.status);
  }
}

export async function buildAccountSnapshot(accountId: string) {
  const db = getSupabaseAdmin();
  const account = await getAccount(accountId);

  const [
    slack,
    milestones,
    blockers,
    decisions,
    commitments,
    deployments,
    issues,
    runs,
  ] = await Promise.all([
    db
      .from("slack_connections")
      .select("id, team_id, workspace_name, channel_id, channel_name, status, created_at")
      .eq("account_id", accountId)
      .eq("status", "connected")
      .maybeSingle(),
    db
      .from("account_milestones")
      .select("*")
      .eq("account_id", accountId)
      .order("position"),
    db
      .from("account_blockers")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    db
      .from("account_decisions")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("account_commitments")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("deployment_states")
      .select("*")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false }),
    db
      .from("production_issues")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(20),
    account.workspace_id
      ? db
          .from("implementation_runs")
          .select("id, status, branch_name, summary_json, pr_json, updated_at")
          .eq("workspace_id", account.workspace_id)
          .order("updated_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const deployment = (deployments.data || [])[0] || null;
  const latestRun = ((runs as { data?: unknown[] }).data || [])[0] as
    | Record<string, unknown>
    | undefined;

  return {
    id: account.id,
    companyId: account.company_id,
    prospectId: account.prospect_id,
    workspaceId: account.workspace_id,
    conversationId: account.conversation_id,
    stage: account.stage,
    successOutcome: account.success_outcome,
    successCriteria: account.success_criteria_json,
    summary: (account.account_summary_json as { memorySummary?: string })?.memorySummary || "",
    accountSummary: account.account_summary_json,
    technicalEnvironment: account.technical_environment_json,
    quality: account.quality_json,
    slack: slack.data
      ? {
          connected: true,
          workspaceName: slack.data.workspace_name,
          channelName: slack.data.channel_name,
          channelId: slack.data.channel_id,
          teamId: slack.data.team_id,
          status: slack.data.status,
        }
      : { connected: false },
    milestones: milestones.data || [],
    blockers: blockers.data || [],
    decisions: decisions.data || [],
    commitments: commitments.data || [],
    issues: issues.data || [],
    deployment: deployment
      ? {
          id: deployment.id,
          environment: deployment.environment,
          version: deployment.version,
          status: deployment.status,
          checks: deployment.checks_json,
          metrics: deployment.metrics_json,
          metadata: deployment.metadata_json,
          updatedAt: deployment.updated_at,
        }
      : null,
    implementation: latestRun
      ? {
          runId: latestRun.id,
          status: latestRun.status,
          branchName: latestRun.branch_name,
          summary: latestRun.summary_json,
          pullRequest: latestRun.pr_json,
          updatedAt: latestRun.updated_at,
        }
      : null,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

export async function buildDeterministicStatus(accountId: string) {
  const snap = await buildAccountSnapshot(accountId);
  const openBlockers = (snap.blockers as Array<{ title: string; owner_type: string }>).map(
    (b) => `${b.title} (owner: ${b.owner_type})`,
  );
  const currentMilestone =
    (snap.milestones as Array<{ label: string; status: string }>).find(
      (m) => m.status === "current",
    )?.label || null;

  let nextAction = "Continue technical discovery";
  if (openBlockers.length) nextAction = `Resolve blocker: ${openBlockers[0]}`;
  else if (snap.implementation?.status === "ready_for_review")
    nextAction = "Human review of implementation PR";
  else if (snap.deployment?.status === "ready_for_production")
    nextAction = "Approve production rollout";
  else if (snap.deployment?.status === "staging") nextAction = "Validate staging";
  else if (snap.stage === "production") nextAction = "Monitor adoption";

  return {
    stage: snap.stage,
    milestone: currentMilestone,
    implementation: snap.implementation,
    deployment: snap.deployment,
    blockers: openBlockers,
    openIssueCount: (snap.issues as unknown[]).filter(
      (i) => (i as { status: string }).status !== "resolved",
    ).length,
    nextAction,
    successOutcome: snap.successOutcome,
    slackConnected: Boolean(snap.slack && (snap.slack as { connected?: boolean }).connected),
  };
}

export function formatStatusNatural(status: Awaited<ReturnType<typeof buildDeterministicStatus>>) {
  const lines = [
    `*Stage:* ${status.stage}`,
    status.milestone ? `*Milestone:* ${status.milestone}` : null,
    status.implementation
      ? `*Implementation:* ${status.implementation.status}${status.implementation.branchName ? ` (\`${status.implementation.branchName}\`)` : ""}`
      : "*Implementation:* not started",
    status.deployment
      ? `*${status.deployment.environment}:* ${status.deployment.status}${status.deployment.version ? ` @ ${status.deployment.version}` : ""}`
      : "*Deployment:* not started",
    status.blockers.length
      ? `*Blockers:*\n${status.blockers.map((b) => `• ${b}`).join("\n")}`
      : "*Blockers:* none open",
    `*Next:* ${status.nextAction}`,
  ].filter(Boolean);
  return lines.join("\n");
}
