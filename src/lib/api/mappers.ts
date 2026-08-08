import type {
  Company,
  CompanyKnowledgeSummary,
  Conversation,
  ImplementationPlan,
  ImplementationRun,
  KnowledgeSource,
  McpServer,
  Message,
  Prospect,
  ProspectMemory,
  Workspace,
  WorkspaceAnalysis,
  WorkspaceRepository,
} from "@/types/ui";

export function mapCompany(raw: Record<string, unknown>): Company {
  const ks = (raw.knowledgeSummary || raw.knowledge_summary_json || {}) as Record<
    string,
    unknown
  >;
  const summary: CompanyKnowledgeSummary | undefined =
    ks && (ks.whatYouSell || ks.companyDescription || ks.valueProposition || ks.products)
      ? {
          whatYouSell: String(
            ks.whatYouSell || ks.companyDescription || ks.valueProposition || "",
          ),
          primaryBuyers: (ks.primaryBuyers || ks.buyerTypes || []) as string[],
          coreUseCases: (ks.coreUseCases || ks.useCases || ks.capabilities || []) as string[],
          commonObjections: (ks.commonObjections || []) as string[],
        }
      : undefined;

  return {
    id: String(raw.id),
    name: String(raw.name),
    slug: String(raw.slug),
    description: raw.description ? String(raw.description) : undefined,
    agentName: String(raw.agentName || raw.agent_name || "Atlas"),
    agentVoice: raw.agentVoice || raw.agent_voice
      ? String(raw.agentVoice || raw.agent_voice)
      : undefined,
    knowledgeSummary: summary,
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
  };
}

export function mapKnowledgeSource(raw: Record<string, unknown>): KnowledgeSource {
  return {
    id: String(raw.id),
    title: String(raw.title),
    type: (raw.type as KnowledgeSource["type"]) || "paste",
    status: (raw.status as KnowledgeSource["status"]) || "ready",
    sourceUrl:
      raw.sourceUrl || raw.source_url
        ? String(raw.sourceUrl || raw.source_url)
        : undefined,
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
  };
}

export function mapMcp(raw: Record<string, unknown>): McpServer {
  const tools = (raw.tools || []) as Array<{ name: string; description?: string }>;
  return {
    id: String(raw.id),
    label: String(raw.label),
    serverUrl: String(raw.serverUrl || raw.server_url || ""),
    allowWrite: Boolean(raw.allowWrite ?? raw.allow_write),
    enabled: raw.enabled !== false,
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
  };
}

export function mapMemory(raw: Record<string, unknown> | undefined): ProspectMemory {
  const m = raw || {};
  return {
    stage: String(m.stage || "discovery"),
    summary: String(m.summary || ""),
    currentStack: (m.currentStack as string[]) || [],
    painPoints: (m.painPoints as string[]) || [],
    requirements: (m.requirements as string[]) || [],
    objections: (m.objections as string[]) || [],
    nextAction: String(m.nextAction || ""),
  };
}

export function mapProspect(raw: Record<string, unknown>): Prospect {
  let memory = mapMemory(raw.memory as Record<string, unknown> | undefined);
  if (!raw.memory && (raw.currentStack || raw.summary || raw.stage)) {
    memory = mapMemory(raw);
  }
  return {
    id: String(raw.id),
    companyId: String(raw.companyId || raw.company_id || ""),
    companyName: String(raw.companyName || raw.company_name || "Prospect"),
    personName:
      raw.personName || raw.person_name
        ? String(raw.personName || raw.person_name)
        : undefined,
    email: raw.email ? String(raw.email) : undefined,
    memory,
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.updated_at || new Date().toISOString()),
  };
}

export function mapConversation(raw: Record<string, unknown>): Conversation {
  return {
    id: String(raw.id),
    companyId: String(raw.companyId || raw.company_id || ""),
    prospectId: String(raw.prospectId || raw.prospect_id || ""),
    prospect: raw.prospect
      ? mapProspect(raw.prospect as Record<string, unknown>)
      : undefined,
    lastChannel: raw.lastChannel as Conversation["lastChannel"],
    lastMessagePreview: raw.lastMessagePreview
      ? String(raw.lastMessagePreview)
      : undefined,
    updatedAt: String(raw.updatedAt || raw.updated_at || new Date().toISOString()),
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
  };
}

export function mapMessage(raw: Record<string, unknown>): Message {
  return {
    id: String(raw.id),
    conversationId: String(raw.conversationId || raw.conversation_id || ""),
    channel: (raw.channel as Message["channel"]) || "chat",
    role: (raw.role as Message["role"]) || "assistant",
    content: String(raw.content || ""),
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
    metadata: (raw.metadata || raw.metadata_json || undefined) as Message["metadata"],
    events: raw.events as Message["events"],
  };
}

export function mapRepo(raw: Record<string, unknown>): WorkspaceRepository {
  return {
    id: String(raw.id),
    provider: (raw.provider as "demo" | "github") || "demo",
    repositoryName: String(raw.repositoryName || raw.repository_name || ""),
    defaultBranch: String(raw.defaultBranch || raw.default_branch || "main"),
    status: ((raw.status as string) === "error" ? "error" : "connected") as
      | "connected"
      | "error",
  };
}

export function mapAnalysis(raw: Record<string, unknown>): WorkspaceAnalysis {
  const points = raw.integrationPoints;
  const integrationPoints = Array.isArray(points)
    ? points.map((p) =>
        typeof p === "string"
          ? p
          : `${(p as { location?: string }).location || ""}: ${(p as { reason?: string }).reason || ""}`.trim(),
      )
    : [];
  return {
    status: "analyzed",
    stack: (raw.stack as string[]) || [],
    architectureSummary: String(raw.architectureSummary || ""),
    importantFiles: (raw.importantFiles as WorkspaceAnalysis["importantFiles"]) || [],
    integrationPoints,
    risks: (raw.risks as string[]) || [],
  };
}

export function mapPlan(raw: Record<string, unknown>): ImplementationPlan {
  return {
    planId: String(raw.planId || raw.id),
    summary: String(raw.summary || ""),
    changes: (raw.changes as ImplementationPlan["changes"]) || [],
    tests: ((raw.tests as string[]) || []).map(String),
    risks: (raw.risks as string[]) || [],
    requiresApproval: raw.requiresApproval !== false,
    objective: raw.objective ? String(raw.objective) : undefined,
  };
}

export function mapRun(raw: Record<string, unknown>): ImplementationRun {
  const pr = (raw.pullRequest || raw.pr) as Record<string, unknown> | undefined;
  return {
    id: String(raw.id || raw.runId),
    workspaceId: String(raw.workspaceId || ""),
    status: (raw.status as ImplementationRun["status"]) || "queued",
    branchName: String(raw.branchName || "grok-fde/integration"),
    summary: raw.summary ? String(raw.summary) : undefined,
    files: ((raw.files as ImplementationRun["files"]) || []).map((f) => ({
      path: f.path,
      operation: f.operation,
      diff: f.diff,
    })),
    tests: ((raw.tests as ImplementationRun["tests"]) || []).map((t) => ({
      name: t.name,
      status: t.status,
      output: t.output,
    })),
    events: ((raw.events as ImplementationRun["events"]) || []).map((e) => ({
      type: String((e as { type?: string }).type || "event"),
      label: String((e as { label?: string }).label || ""),
    })),
    pr: pr
      ? {
          number: pr.number as number | undefined,
          title: String(pr.title || "Integration PR"),
          url: String(pr.pullRequestUrl || pr.url || ""),
          branchName: String(pr.branchName || raw.branchName || ""),
          status: "ready" as const,
        }
      : undefined,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

export function mapWorkspaceBundle(raw: Record<string, unknown>): Workspace {
  const ws = (raw.workspace || raw) as Record<string, unknown>;
  const repos = (raw.repositories as Record<string, unknown>[]) || [];
  const plans = (raw.plans as Record<string, unknown>[]) || [];
  const runs = (raw.runs as Record<string, unknown>[]) || [];
  const latestPlan = plans[0];
  const latestRun = runs[0];

  return {
    id: String(ws.id),
    prospectId: String(ws.prospectId || ws.prospect_id || ""),
    conversationId: String(ws.conversationId || ws.conversation_id || ""),
    status: (ws.status as Workspace["status"]) || "discovery",
    objective: String(
      (latestPlan?.objective as string) ||
        (ws.customerSummary as { memorySummary?: string })?.memorySummary ||
        "Integrate Grok FDE",
    ),
    repository: repos[0] ? mapRepo(repos[0]) : undefined,
    analysis: ws.analysis
      ? mapAnalysis(ws.analysis as Record<string, unknown>)
      : undefined,
    plan: latestPlan
      ? mapPlan({
          ...latestPlan,
          planId: latestPlan.id,
          changes:
            (latestPlan.plan as { changes?: unknown })?.changes || latestPlan.changes,
        })
      : undefined,
    activeRunId: latestRun ? String(latestRun.id) : undefined,
    createdAt: String(ws.createdAt || ws.created_at || new Date().toISOString()),
    updatedAt: String(ws.updatedAt || ws.updated_at || new Date().toISOString()),
  };
}
