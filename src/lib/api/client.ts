import { isMockMode } from "@/lib/utils";
import * as mock from "@/lib/mock";
import type {
  AccountRoom,
  CallSession,
  CallTranscriptLine,
  ChatMessageResponse,
  Company,
  Conversation,
  DashboardData,
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
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  isMock: () => isMockMode(),

  createCompany(input: { name: string; agentName: string; agentVoice?: string }) {
    if (isMockMode()) return mock.mockCreateCompany(input);
    return realFetch<Company>("/api/company", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  completeOnboarding() {
    if (isMockMode()) return mock.mockCompleteOnboarding();
    return realFetch<Company>("/api/company/onboarding/complete", { method: "POST" });
  },

  getCompany() {
    if (isMockMode()) return mock.mockGetCompany();
    return realFetch<Company>("/api/company");
  },

  getDashboard() {
    if (isMockMode()) return mock.mockGetFdeDashboard();
    return realFetch<FdeDashboardData>("/api/company/dashboard").catch(() =>
      realFetch<DashboardData>("/api/company/dashboard")
    ) as Promise<FdeDashboardData>;
  },

  getKnowledge() {
    if (isMockMode()) return mock.mockGetKnowledge();
    return realFetch<KnowledgeSource[]>("/api/knowledge");
  },

  getMcpServers() {
    if (isMockMode()) return mock.mockGetMcpServers();
    return realFetch<McpServer[]>("/api/mcp");
  },

  uploadKnowledge(input: { title: string; type: KnowledgeSource["type"] }) {
    if (isMockMode()) return mock.mockUploadKnowledge(input);
    return realFetch<KnowledgeSource>("/api/knowledge/upload", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  pasteKnowledge(input: { title: string; content: string }) {
    if (isMockMode()) return mock.mockPasteKnowledge(input);
    return realFetch<KnowledgeSource>("/api/knowledge/paste", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  addUrlKnowledge(input: { url: string; title?: string }) {
    if (isMockMode()) return mock.mockAddUrlKnowledge(input);
    return realFetch<KnowledgeSource>("/api/knowledge/url", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  connectMcp(input: {
    label: string;
    serverUrl: string;
    authToken?: string;
    allowWrite?: boolean;
  }) {
    if (isMockMode()) return mock.mockConnectMCP(input);
    return realFetch<McpServer>("/api/mcp", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getConversations() {
    if (isMockMode()) return mock.mockGetConversations();
    return realFetch<Conversation[]>("/api/conversations");
  },

  getConversation(id: string) {
    if (isMockMode()) return mock.mockGetConversation(id);
    return realFetch<{
      conversation: Conversation;
      messages: Message[];
      prospect: Prospect;
    }>(`/api/conversations/${id}`);
  },

  getProspect(id: string) {
    if (isMockMode()) return mock.mockGetProspect(id);
    return realFetch<Prospect>(`/api/prospects/${id}`);
  },

  ensureProspectSession(companySlug: string, prospectId?: string) {
    if (isMockMode()) return mock.mockEnsureProspectSession(companySlug, prospectId);
    const q = prospectId ? `?prospectId=${prospectId}` : "";
    return realFetch<{
      company: Company;
      prospect: Prospect;
      conversation: Conversation;
      messages: Message[];
    }>(`/api/fde/${companySlug}${q}`);
  },

  sendMessage(conversationId: string, message: string) {
    if (isMockMode()) return mock.mockSendMessage(conversationId, message);
    return realFetch<ChatMessageResponse>(`/api/conversations/${conversationId}/message`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  },

  startCall(conversationId: string) {
    if (isMockMode()) return mock.mockStartCall(conversationId);
    // Person B: return CallSession including media.faceImageUrl / faceVideoUrl / streamUrl / realtimeToken
    return realFetch<CallSession>("/api/voice/token", {
      method: "POST",
      body: JSON.stringify({ conversationId }),
    });
  },

  connectCall(callId: string) {
    if (isMockMode()) return mock.mockConnectCall(callId);
    return realFetch<CallSession>(`/api/voice/session/${callId}`, {
      method: "POST",
    }).catch(() => ({
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
    }));
  },

  getCallScript(conversationId: string) {
    return mock.mockGetCallScript(conversationId);
  },

  completeCall(input: {
    callId: string;
    conversationId: string;
    transcript: CallTranscriptLine[];
    durationSeconds: number;
  }) {
    if (isMockMode()) return mock.mockCompleteCall(input);
    return realFetch<{ call: CallSession; prospect: ProspectMemory; learned: string[] }>(
      "/api/calls/complete",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  },

  generateArchitecture(conversationId: string) {
    if (isMockMode()) return mock.mockGenerateArchitecture(conversationId);
    return realFetch<MessageArtifact>("/api/assets/architecture", {
      method: "POST",
      body: JSON.stringify({ conversationId }),
    });
  },

  respondEscalation(id: string, response: string) {
    if (isMockMode()) return mock.mockRespondEscalation(id, response);
    return realFetch(`/api/escalations/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ response }),
    });
  },

  resetDemo() {
    if (isMockMode()) return mock.mockResetDemo();
    return Promise.resolve(null);
  },

  /* ── Implementation workspace ── */

  createWorkspace(input: { prospectId: string; conversationId: string }) {
    if (isMockMode()) return mock.mockCreateWorkspace(input);
    return realFetch<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getWorkspace(id: string) {
    if (isMockMode()) return mock.mockGetWorkspace(id);
    return realFetch<Workspace>(`/api/workspaces/${id}`);
  },

  getWorkspaceByConversation(conversationId: string) {
    if (isMockMode()) return mock.mockGetWorkspaceByConversation(conversationId);
    return realFetch<Workspace | null>(
      `/api/workspaces?conversationId=${encodeURIComponent(conversationId)}`
    ).catch(() => null);
  },

  connectRepository(
    workspaceId: string,
    input: { provider: "demo" | "github"; repository?: string }
  ) {
    if (isMockMode()) return mock.mockConnectRepository(workspaceId, input);
    return realFetch<WorkspaceRepository>(`/api/workspaces/${workspaceId}/repositories`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  analyzeWorkspace(workspaceId: string) {
    if (isMockMode()) return mock.mockAnalyzeWorkspace(workspaceId);
    return realFetch<WorkspaceAnalysis>(`/api/workspaces/${workspaceId}/analyze`, {
      method: "POST",
    });
  },

  createImplementationPlan(workspaceId: string, input: { objective?: string }) {
    if (isMockMode()) return mock.mockCreatePlan(workspaceId, input);
    return realFetch<ImplementationPlan>(`/api/workspaces/${workspaceId}/plan`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  startBuild(workspaceId: string, input: { planId: string }) {
    if (isMockMode()) return mock.mockStartBuild(workspaceId, input);
    return realFetch<{ runId: string; status: string }>(
      `/api/workspaces/${workspaceId}/build`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  },

  getImplementationRun(runId: string) {
    if (isMockMode()) return mock.mockGetRun(runId);
    return realFetch<ImplementationRun>(`/api/implementation-runs/${runId}`);
  },

  preparePullRequest(runId: string) {
    if (isMockMode()) return mock.mockPreparePr(runId);
    return realFetch<ImplementationRun>(`/api/implementation-runs/${runId}/pr`, {
      method: "POST",
    });
  },

  getFitArchitecture(prospectName: string, companyName: string) {
    if (isMockMode()) return Promise.resolve(mock.mockFitArchitecture(prospectName, companyName));
    return Promise.resolve(mock.mockFitArchitecture(prospectName, companyName));
  },

  /* ── Account Room + Slack (Pass 3) ── */

  getAccountRoom(prospectId: string) {
    if (isMockMode()) return mock.mockGetAccountRoom(prospectId);
    return realFetch<AccountRoom>(`/api/accounts/${prospectId}`);
  },

  listAccounts() {
    if (isMockMode()) return mock.mockListAccounts();
    return realFetch<AccountRoom[]>("/api/accounts");
  },

  connectSlack(input?: {
    workspaceName?: string;
    channelName?: string;
    prospectId?: string;
  }) {
    if (isMockMode()) return mock.mockConnectSlack(input);
    return realFetch<SlackConnection>("/api/slack/connect", {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    });
  },

  getSlackChannels() {
    if (isMockMode()) return mock.mockGetSlackChannels();
    return realFetch<SlackConnection[]>("/api/slack/channels");
  },

  getSlackThread(threadId: string) {
    if (isMockMode()) return mock.mockGetSlackThread(threadId);
    return realFetch<SlackThread>(`/api/slack/threads/${threadId}`);
  },

  /** Demo control: advance Globex Slack→fix→production narrative */
  advanceAccountDemo(prospectId = "pr_globex") {
    if (isMockMode()) return mock.mockAdvanceAccountDemo(prospectId);
    return realFetch<AccountRoom>(`/api/accounts/${prospectId}/demo/advance`, {
      method: "POST",
    });
  },

  resolveBlocker(accountId: string, blockerId: string) {
    if (isMockMode()) return mock.mockResolveBlocker(accountId, blockerId);
    return realFetch(`/api/accounts/${accountId}/blockers/${blockerId}/resolve`, {
      method: "POST",
    });
  },

  getFieldSignals() {
    if (isMockMode()) return mock.mockGetFieldSignals();
    return realFetch<FieldSignal[]>("/api/field-signals");
  },

  getPlaybooks() {
    if (isMockMode()) return mock.mockGetPlaybooks();
    return realFetch<Playbook[]>("/api/playbooks").catch(() => []);
  },
};
