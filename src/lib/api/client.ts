import { isMockMode } from "@/lib/utils";
import * as mock from "@/lib/mock";
import type {
  CallSession,
  CallTranscriptLine,
  ChatMessageResponse,
  Company,
  Conversation,
  DashboardData,
  KnowledgeSource,
  McpServer,
  Message,
  MessageArtifact,
  Prospect,
  ProspectMemory,
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
    if (isMockMode()) return mock.mockGetDashboard();
    return realFetch<DashboardData>("/api/company/dashboard");
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
};
