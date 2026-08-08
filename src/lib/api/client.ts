import { isMockMode, slugify } from "@/lib/utils";
import * as mock from "@/lib/mock";
import { getStoredCompanyId, setStoredCompany } from "@/lib/session";
import {
  mapAnalysis,
  mapCompany,
  mapConversation,
  mapKnowledgeSource,
  mapMcp,
  mapMessage,
  mapPlan,
  mapProspect,
  mapRepo,
  mapRun,
  mapWorkspaceBundle,
} from "@/lib/api/mappers";
import type {
  AccountRoom,
  CallSession,
  CallTranscriptLine,
  ChatMessageResponse,
  Company,
  Conversation,
  DeploymentState,
  FieldSignal,
  FdeDashboardData,
  ImplementationPlan,
  ImplementationRun,
  KnowledgeSource,
  McpServer,
  Message,
  MessageArtifact,
  Playbook,
  Prospect,
  ProspectMemory,
  SlackConnection,
  SlackThread,
  Workspace,
  WorkspaceAnalysis,
  WorkspaceRepository,
} from "@/types/ui";

async function realFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const companyId = getStoredCompanyId();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(companyId ? { "X-Company-Id": companyId } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body || `Request failed: ${res.status}`;
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      /* raw */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function requireCompanyId(): string {
  const id = getStoredCompanyId();
  if (!id) throw new Error("No company yet. Complete onboarding first.");
  return id;
}

export const api = {
  isMock: () => isMockMode(),

  async createCompany(input: { name: string; agentName: string; agentVoice?: string }) {
    if (isMockMode()) return mock.mockCreateCompany(input);
    const slug = slugify(input.name) || `co-${Date.now()}`;
    const data = await realFetch<{ company: Record<string, unknown> }>("/api/company", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        slug,
        agentName: input.agentName,
        agentVoice: input.agentVoice || "eve",
      }),
    });
    const company = mapCompany(data.company);
    setStoredCompany(company.id, company.slug);
    return company;
  },

  async completeOnboarding() {
    if (isMockMode()) return mock.mockCompleteOnboarding();
    return this.getCompany();
  },

  async getCompany() {
    if (isMockMode()) return mock.mockGetCompany();
    const id = getStoredCompanyId();
    if (id) {
      const data = await realFetch<{ company: Record<string, unknown> }>(
        `/api/company?id=${encodeURIComponent(id)}`,
      );
      return mapCompany(data.company);
    }
    const data = await realFetch<{ companies: Record<string, unknown>[] }>("/api/company");
    const first = data.companies?.[0];
    if (!first) throw new Error("No company found");
    const company = mapCompany(first);
    setStoredCompany(company.id, company.slug);
    return company;
  },

  async getDashboard() {
    if (isMockMode()) return mock.mockGetFdeDashboard();
    const companyId = requireCompanyId();
    const [company, convs, escalations, signals, knowledge, mcp] = await Promise.all([
      this.getCompany(),
      realFetch<{ conversations: Record<string, unknown>[] }>(
        `/api/conversations?companyId=${companyId}`,
      ).catch(() => ({ conversations: [] })),
      realFetch<{ escalations: Record<string, unknown>[] }>(
        `/api/escalations?companyId=${companyId}`,
      ).catch(() => ({ escalations: [] })),
      realFetch<{ signals: FieldSignal[] }>(`/api/field-signals?companyId=${companyId}`).catch(
        () => ({ signals: [] }),
      ),
      this.getKnowledge().catch(() => [] as KnowledgeSource[]),
      this.getMcpServers().catch(() => [] as McpServer[]),
    ]);

    const conversations = (convs.conversations || []).map(mapConversation);
    const openEsc = (escalations.escalations || []).filter((e) => e.status === "open");

    const dash: FdeDashboardData = {
      metrics: {
        activeProspects: conversations.length,
        conversations: conversations.length,
        calls: 0,
        needsHelp: openEsc.length,
        activeAccounts: conversations.length,
        implementations: 0,
        production: 0,
        blocked: 0,
      },
      escalations: openEsc.map((e) => ({
        id: String(e.id),
        companyId,
        prospectId: String(e.prospect_id || e.prospectId || ""),
        prospectName: "Prospect",
        question: String(e.question || ""),
        reason: String(e.reason || ""),
        priority: (e.priority as "low" | "medium" | "high") || "medium",
        status: "open" as const,
        createdAt: String(e.created_at || e.createdAt || new Date().toISOString()),
      })),
      recentConversations: conversations.slice(0, 8).map((c) => ({
        id: c.id,
        prospectName: c.prospect?.companyName || c.prospect?.personName || "Prospect",
        channel: (c.lastChannel || "chat") as "chat" | "email" | "call" | "system",
        preview: c.lastMessagePreview || "Open conversation",
        updatedAt: c.updatedAt,
      })),
      agent: {
        name: company.agentName,
        status: "ONLINE",
        knowledgeSourceCount: knowledge.length,
        mcpToolCount: mcp.reduce((n, s) => n + (s.tools?.length || 0), 0),
      },
      fieldSignalsPreview: (signals.signals || []).slice(0, 5).map((s, i) => ({
        id: s.id || `sig_${i}`,
        type: s.type || "signal",
        title: s.title,
        accountCount: s.accountCount || 1,
        recommendation: s.recommendation,
      })),
      atlasActivity: [
        { label: `${company.agentName} online`, at: new Date().toISOString() },
      ],
    };
    return dash;
  },

  async getKnowledge() {
    if (isMockMode()) return mock.mockGetKnowledge();
    const companyId = requireCompanyId();
    const data = await realFetch<{
      company: Record<string, unknown>;
      knowledgeSources: Record<string, unknown>[];
    }>(`/api/company?id=${encodeURIComponent(companyId)}`);
    return (data.knowledgeSources || []).map(mapKnowledgeSource);
  },

  async getMcpServers() {
    if (isMockMode()) return mock.mockGetMcpServers();
    const companyId = requireCompanyId();
    const data = await realFetch<{ servers: Record<string, unknown>[] }>(
      `/api/mcp?companyId=${encodeURIComponent(companyId)}`,
    );
    return (data.servers || []).map(mapMcp);
  },

  async uploadKnowledge(input: { title: string; type: KnowledgeSource["type"]; file?: File; content?: string }) {
    if (isMockMode()) return mock.mockUploadKnowledge(input);
    const companyId = requireCompanyId();
    if (input.file) {
      const form = new FormData();
      form.append("companyId", companyId);
      form.append("title", input.title);
      form.append("file", input.file);
      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: form,
        headers: { "X-Company-Id": companyId },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { source: Record<string, unknown> };
      return mapKnowledgeSource(data.source);
    }
    const data = await realFetch<{ source: Record<string, unknown> }>("/api/knowledge/upload", {
      method: "POST",
      body: JSON.stringify({
        companyId,
        title: input.title,
        content: input.content || `# ${input.title}\n\nUploaded knowledge source.`,
      }),
    });
    return mapKnowledgeSource(data.source);
  },

  async pasteKnowledge(input: { title: string; content: string }) {
    if (isMockMode()) return mock.mockPasteKnowledge(input);
    const companyId = requireCompanyId();
    const data = await realFetch<{ source: Record<string, unknown> }>("/api/knowledge/paste", {
      method: "POST",
      body: JSON.stringify({ companyId, title: input.title, content: input.content }),
    });
    return mapKnowledgeSource(data.source);
  },

  async addUrlKnowledge(input: { url: string; title?: string }) {
    if (isMockMode()) return mock.mockAddUrlKnowledge(input);
    const companyId = requireCompanyId();
    const data = await realFetch<{ source: Record<string, unknown> }>("/api/knowledge/url", {
      method: "POST",
      body: JSON.stringify({ companyId, url: input.url, title: input.title }),
    });
    return mapKnowledgeSource(data.source);
  },

  async connectMcp(input: {
    label: string;
    serverUrl: string;
    authToken?: string;
    allowWrite?: boolean;
  }) {
    if (isMockMode()) return mock.mockConnectMCP(input);
    const companyId = requireCompanyId();
    const data = await realFetch<{ mcp: Record<string, unknown> }>("/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        companyId,
        label: input.label,
        serverUrl: input.serverUrl,
        auth: input.authToken,
        allowWrite: input.allowWrite,
      }),
    });
    return mapMcp(data.mcp);
  },

  async getConversations() {
    if (isMockMode()) return mock.mockGetConversations();
    const companyId = requireCompanyId();
    const data = await realFetch<{ conversations: Record<string, unknown>[] }>(
      `/api/conversations?companyId=${encodeURIComponent(companyId)}`,
    );
    return (data.conversations || []).map(mapConversation);
  },

  async getConversation(id: string) {
    if (isMockMode()) return mock.mockGetConversation(id);
    const data = await realFetch<{
      conversation: Record<string, unknown>;
      messages: Record<string, unknown>[];
      prospect: Record<string, unknown>;
      company: Record<string, unknown>;
    }>(`/api/conversations/${id}`);
    return {
      conversation: mapConversation(data.conversation),
      messages: (data.messages || []).map(mapMessage),
      prospect: mapProspect(data.prospect),
    };
  },

  async getProspect(id: string) {
    if (isMockMode()) return mock.mockGetProspect(id);
    const data = await realFetch<{ prospect: Record<string, unknown> }>(
      `/api/prospects/${id}`,
    );
    return mapProspect(data.prospect);
  },

  async ensureProspectSession(companySlug: string, prospectId?: string) {
    if (isMockMode()) return mock.mockEnsureProspectSession(companySlug, prospectId);
    // Resolve company by slug
    const companyRes = await realFetch<{ company: Record<string, unknown> }>(
      `/api/company?slug=${encodeURIComponent(companySlug)}`,
    );
    const company = mapCompany(companyRes.company);
    setStoredCompany(company.id, company.slug);

    const session = await realFetch<{
      conversation: Record<string, unknown>;
      prospect: Record<string, unknown>;
    }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        companyId: company.id,
        prospectId,
        companyName: "Prospect",
      }),
    });

    const conversation = mapConversation(session.conversation);
    const prospect = mapProspect(session.prospect);

    const detail = await realFetch<{
      messages: Record<string, unknown>[];
    }>(`/api/conversations/${conversation.id}`);

    return {
      company,
      prospect,
      conversation,
      messages: (detail.messages || []).map(mapMessage),
    };
  },

  async sendMessage(conversationId: string, message: string) {
    if (isMockMode()) return mock.mockSendMessage(conversationId, message);
    const data = await realFetch<{
      message: { id: string; role: string; content: string; createdAt: string };
      prospect: Record<string, unknown>;
      events: Array<{ type: string; label: string }>;
    }>(`/api/conversations/${conversationId}/message`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });

    const response: ChatMessageResponse = {
      message: {
        id: data.message.id,
        conversationId,
        channel: "chat",
        role: "assistant",
        content: data.message.content,
        createdAt: data.message.createdAt,
        events: data.events as Message["events"],
      },
      prospect: mapMemoryFromChat(data.prospect),
      events: data.events as ChatMessageResponse["events"],
    };
    return response;
  },

  async startCall(conversationId: string) {
    if (isMockMode()) return mock.mockStartCall(conversationId);
    const data = await realFetch<{
      token: string;
      realtimeUrl?: string;
      session?: { instructions?: string; voice?: string };
      context?: { agentName?: string };
      mock?: boolean;
    }>("/api/voice/token", {
      method: "POST",
      body: JSON.stringify({ conversationId }),
    });

    const session: CallSession & {
      realtimeToken?: string;
      realtimeUrl?: string;
      instructions?: string;
    } = {
      id: `call_${Date.now()}`,
      conversationId,
      status: "connected",
      startedAt: new Date().toISOString(),
      transcript: [],
      liveActivity: [
        { type: "searching_knowledge", label: "Loading company knowledge" },
      ],
      media: {
        faceImageUrl: "/agents/atlas-face.jpg",
        displayName: data.context?.agentName || "Atlas",
      },
      realtimeToken: data.token,
      realtimeUrl: data.realtimeUrl,
      instructions: data.session?.instructions,
    };
    return session;
  },

  connectCall(callId: string) {
    if (isMockMode()) return mock.mockConnectCall(callId);
    return Promise.resolve({
      id: callId,
      conversationId: "",
      status: "connected" as const,
      startedAt: new Date().toISOString(),
      transcript: [],
      liveActivity: [],
      media: {
        faceImageUrl: "/agents/atlas-face.jpg",
        displayName: "Atlas",
      },
    });
  },

  getCallScript(conversationId: string) {
    return mock.mockGetCallScript(conversationId);
  },

  async completeCall(input: {
    callId: string;
    conversationId: string;
    transcript: CallTranscriptLine[];
    durationSeconds: number;
  }) {
    if (isMockMode()) return mock.mockCompleteCall(input);
    const transcriptText = input.transcript
      .map((l) => `${l.speaker === "prospect" ? "Prospect" : "Atlas"}: ${l.text}`)
      .join("\n");
    const data = await realFetch<{
      call: Record<string, unknown>;
      prospect: Record<string, unknown>;
    }>("/api/calls/complete", {
      method: "POST",
      body: JSON.stringify({
        conversationId: input.conversationId,
        transcript: transcriptText,
        startedAt: new Date(Date.now() - input.durationSeconds * 1000).toISOString(),
        endedAt: new Date().toISOString(),
      }),
    });
    return {
      call: {
        id: String(data.call.id || input.callId),
        conversationId: input.conversationId,
        status: "ended" as const,
        startedAt: new Date().toISOString(),
        transcript: input.transcript,
        liveActivity: [],
      },
      prospect: mapMemoryFromChat(data.prospect),
      learned: [] as string[],
    };
  },

  async generateArchitecture(conversationId: string) {
    if (isMockMode()) return mock.mockGenerateArchitecture(conversationId);
    const data = await realFetch<{
      title: string;
      summary?: string;
      nodes: Array<{ id: string; label: string; type?: string }>;
      edges: Array<{ source: string; target: string; label?: string }>;
    }>("/api/assets/architecture", {
      method: "POST",
      body: JSON.stringify({ conversationId }),
    });
    const artifact: MessageArtifact = {
      type: "architecture",
      title: data.title,
      data: {
        title: data.title,
        nodes: data.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.type })),
        edges: data.edges.map((e) => ({
          from: e.source,
          to: e.target,
          label: e.label,
        })),
        notes: data.summary ? [data.summary] : [],
      },
    };
    return artifact;
  },

  respondEscalation(id: string, response: string) {
    if (isMockMode()) return mock.mockRespondEscalation(id, response);
    return realFetch(`/api/escalations`, {
      method: "PATCH",
      body: JSON.stringify({ id, status: "resolved", response }),
    });
  },

  resetDemo() {
    if (isMockMode()) return mock.mockResetDemo();
    return Promise.resolve(null);
  },

  /* ── Implementation workspace ── */

  async createWorkspace(input: { prospectId: string; conversationId: string }) {
    if (isMockMode()) return mock.mockCreateWorkspace(input);
    const data = await realFetch<{ workspace: Record<string, unknown> }>(
      "/api/workspaces",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return mapWorkspaceBundle({ workspace: data.workspace });
  },

  async getWorkspace(id: string) {
    if (isMockMode()) return mock.mockGetWorkspace(id);
    const data = await realFetch<Record<string, unknown>>(`/api/workspaces/${id}`);
    return mapWorkspaceBundle(data);
  },

  async getWorkspaceByConversation(conversationId: string) {
    if (isMockMode()) return mock.mockGetWorkspaceByConversation(conversationId);
    // List via prospect from conversation
    try {
      const conv = await this.getConversation(conversationId);
      if (!conv?.prospect?.id) return null;
      const list = await realFetch<{ workspaces: Record<string, unknown>[] }>(
        `/api/workspaces?prospectId=${encodeURIComponent(conv.prospect.id)}`,
      );
      const match = (list.workspaces || []).find(
        (w) =>
          String(w.conversationId || w.conversation_id) === conversationId ||
          String(w.prospectId || w.prospect_id) === conv.prospect.id,
      );
      if (!match) return null;
      return this.getWorkspace(String(match.id));
    } catch {
      return null;
    }
  },

  async connectRepository(
    workspaceId: string,
    input: { provider: "demo" | "github"; repository?: string },
  ) {
    if (isMockMode()) return mock.mockConnectRepository(workspaceId, input);
    const data = await realFetch<Record<string, unknown>>(
      `/api/workspaces/${workspaceId}/repositories`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return mapRepo(data);
  },

  async analyzeWorkspace(workspaceId: string) {
    if (isMockMode()) return mock.mockAnalyzeWorkspace(workspaceId);
    const data = await realFetch<Record<string, unknown>>(
      `/api/workspaces/${workspaceId}/analyze`,
      { method: "POST", body: "{}" },
    );
    return mapAnalysis(data);
  },

  async createImplementationPlan(workspaceId: string, input: { objective?: string }) {
    if (isMockMode()) return mock.mockCreatePlan(workspaceId, input);
    const data = await realFetch<Record<string, unknown>>(
      `/api/workspaces/${workspaceId}/plan`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return mapPlan(data);
  },

  async startBuild(workspaceId: string, input: { planId: string }) {
    if (isMockMode()) return mock.mockStartBuild(workspaceId, input);
    return realFetch<{ runId: string; status: string; branchName?: string }>(
      `/api/workspaces/${workspaceId}/build`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },

  async getImplementationRun(runId: string) {
    if (isMockMode()) return mock.mockGetRun(runId);
    const data = await realFetch<Record<string, unknown>>(
      `/api/implementation-runs/${runId}`,
    );
    return mapRun(data);
  },

  async preparePullRequest(runId: string) {
    if (isMockMode()) return mock.mockPreparePr(runId);
    await realFetch(`/api/implementation-runs/${runId}/pull-request`, {
      method: "POST",
      body: "{}",
    });
    return this.getImplementationRun(runId);
  },

  getFitArchitecture(prospectName: string, companyName: string) {
    if (isMockMode()) return Promise.resolve(mock.mockFitArchitecture(prospectName, companyName));
    return Promise.resolve(mock.mockFitArchitecture(prospectName, companyName));
  },

  /* ── Account Room + Slack ── */

  async getAccountRoom(prospectId: string) {
    if (isMockMode()) return mock.mockGetAccountRoom(prospectId);
    // Prefer account by prospect — create if needed
    const list = await realFetch<{ accounts: Array<{ id: string; prospect_id: string }> }>(
      `/api/accounts?prospectId=${encodeURIComponent(prospectId)}`,
    );
    let accountId = list.accounts?.[0]?.id;
    if (!accountId) {
      const created = await realFetch<{ account: { id: string } }>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ prospectId }),
      });
      accountId = created.account.id;
    }
    const data = await realFetch<{ account: Record<string, unknown> }>(
      `/api/accounts/${accountId}`,
    );
    return mapAccountRoom(data.account, prospectId);
  },

  async listAccounts() {
    if (isMockMode()) return mock.mockListAccounts();
    const companyId = getStoredCompanyId();
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const data = await realFetch<{ accounts: Array<Record<string, unknown>> }>(
      `/api/accounts${q}`,
    );
    // Lightweight list → fetch rooms
    const rooms: AccountRoom[] = [];
    for (const a of (data.accounts || []).slice(0, 12)) {
      try {
        const full = await realFetch<{ account: Record<string, unknown> }>(
          `/api/accounts/${a.id}`,
        );
        rooms.push(mapAccountRoom(full.account, String(a.prospect_id || "")));
      } catch {
        /* skip */
      }
    }
    return rooms;
  },

  async connectSlack(input?: {
    workspaceName?: string;
    channelName?: string;
    prospectId?: string;
  }) {
    if (isMockMode()) return mock.mockConnectSlack(input);
    const prospectId = input?.prospectId;
    if (!prospectId) throw new Error("prospectId required to connect Slack");
    const room = await this.getAccountRoom(prospectId);
    if (!room) throw new Error("Account not found");
    const channelId = `C_${Date.now().toString(36).toUpperCase()}`;
    const data = await realFetch<{ connection: Record<string, unknown> }>(
      "/api/slack/connect-channel",
      {
        method: "POST",
        body: JSON.stringify({
          accountId: room.id,
          workspaceName: input?.workspaceName || "Customer",
          channelName: input?.channelName || "fde-shared",
          channelId,
          teamId: "T_DEMO",
        }),
      },
    );
    return {
      id: String(data.connection.id),
      workspaceName: String(data.connection.workspaceName || "Customer"),
      channelName: String(data.connection.channelName || "fde-shared"),
      channelId: String(data.connection.channelId),
      status: "connected" as const,
      lastActiveAt: new Date().toISOString(),
    } satisfies SlackConnection;
  },

  getSlackChannels() {
    if (isMockMode()) return mock.mockGetSlackChannels();
    return Promise.resolve([] as SlackConnection[]);
  },

  getSlackThread(threadId: string) {
    if (isMockMode()) return mock.mockGetSlackThread(threadId);
    return Promise.resolve({
      id: threadId,
      channelName: "fde-shared",
      root: {
        id: threadId,
        author: "system",
        text: "",
        createdAt: new Date().toISOString(),
      },
      replies: [],
    } as SlackThread);
  },

  async advanceAccountDemo(prospectId = "pr_globex") {
    if (isMockMode()) return mock.mockAdvanceAccountDemo(prospectId);
    const room = await this.getAccountRoom(prospectId);
    if (!room) throw new Error("Account not found");
    await realFetch(`/api/demo/slack-message`, {
      method: "POST",
      body: JSON.stringify({
        accountId: room.id,
        user: "Jordan",
        text: "@Atlas staging is returning 401s after the auth change.",
      }),
    }).catch(() => null);
    return this.getAccountRoom(prospectId);
  },

  async resolveBlocker(accountId: string, blockerId: string) {
    if (isMockMode()) return mock.mockResolveBlocker(accountId, blockerId);
    return realFetch(`/api/accounts/${accountId}/blockers`, {
      method: "PATCH",
      body: JSON.stringify({ blockerId, resolve: true }),
    });
  },

  async getFieldSignals() {
    if (isMockMode()) return mock.mockGetFieldSignals();
    const companyId = getStoredCompanyId();
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const data = await realFetch<{ signals: FieldSignal[] }>(`/api/field-signals${q}`);
    return data.signals || [];
  },

  getPlaybooks() {
    if (isMockMode()) return mock.mockGetPlaybooks();
    return Promise.resolve([] as Playbook[]);
  },
};

function mapMemoryFromChat(raw: Record<string, unknown>): ProspectMemory {
  return {
    stage: String(raw.stage || "discovery"),
    summary: String(raw.summary || ""),
    currentStack: (raw.currentStack as string[]) || [],
    painPoints: (raw.painPoints as string[]) || [],
    requirements: (raw.requirements as string[]) || [],
    objections: (raw.objections as string[]) || [],
    nextAction: String(raw.nextAction || ""),
  };
}

function mapAccountRoom(raw: Record<string, unknown>, prospectId: string): AccountRoom {
  const slack = raw.slack as Record<string, unknown> | undefined;
  const deployment = raw.deployment as Record<string, unknown> | null;
  const implementation = raw.implementation as Record<string, unknown> | null;
  const summary = raw.accountSummary as Record<string, unknown> | undefined;
  const tech = raw.technicalEnvironment as Record<string, unknown> | undefined;

  return {
    id: String(raw.id),
    prospectId: String(raw.prospectId || prospectId),
    conversationId: String(raw.conversationId || ""),
    name: String(summary?.prospectCompany || "Account"),
    stage: (raw.stage as AccountRoom["stage"]) || "discovery",
    successOutcome: String(raw.successOutcome || ""),
    successCriteria: (raw.successCriteria as string[]) || [],
    stack: (tech?.stack as string[]) || [],
    atlasStatus: "Online in shared channel",
    nextAction: "Continue technical engagement",
    nextMilestone: ((raw.milestones as Array<{ label: string; status: string }>) || []).find(
      (m) => m.status === "current",
    )?.label,
    currentImplementation: implementation
      ? String(implementation.status || "")
      : undefined,
    currentEnvironment: deployment ? String(deployment.environment || "") : undefined,
    slack:
      slack && slack.connected
        ? {
            id: "slack",
            workspaceName: String(slack.workspaceName || ""),
            channelName: String(slack.channelName || ""),
            channelId: String(slack.channelId || ""),
            status: "connected" as const,
            lastActiveAt: new Date().toISOString(),
          }
        : undefined,
    milestones: ((raw.milestones as AccountRoom["milestones"]) || []).map((m) => ({
      ...m,
      id: String((m as { id?: string }).id || m.label),
    })),
    blockers: ((raw.blockers as AccountRoom["blockers"]) || []).map((b) => ({
      ...b,
      id: String((b as { id?: string }).id),
      ownerKind: ((b as { owner_type?: string }).owner_type ||
        (b as { ownerKind?: string }).ownerKind ||
        "unknown") as AccountRoom["blockers"][0]["ownerKind"],
    })),
    decisions: ((raw.decisions as AccountRoom["decisions"]) || []).map((d) => ({
      ...d,
      id: String((d as { id?: string }).id),
    })),
    commitments: ((raw.commitments as AccountRoom["commitments"]) || []).map((c) => ({
      ...c,
      id: String((c as { id?: string }).id),
    })),
    deployment: deployment
      ? {
          environment: String(deployment.environment || "staging"),
          status: (String(deployment.status || "not_started") as DeploymentState["status"]),
          version: deployment.version ? String(deployment.version) : undefined,
          demo: true,
        }
      : undefined,
    timeline: [],
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}
