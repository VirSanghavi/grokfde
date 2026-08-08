/** Shared UI + API contract types for Grok FDE (Person A). */

export type KnowledgeSourceType = "file" | "paste" | "url" | "mcp";
export type KnowledgeSourceStatus = "processing" | "ready" | "error";

export type Channel = "chat" | "email" | "call" | "system";
export type MessageRole = "user" | "assistant" | "system";

export type AgentEventType =
  | "searching_knowledge"
  | "searching_web"
  | "using_tool"
  | "generating_image"
  | "generating_architecture"
  | "prospect_updated"
  | "needs_human";

export type ProspectStage =
  | "discovery"
  | "technical-evaluation"
  | "architecture-review"
  | "procurement"
  | "closed-won"
  | "closed-lost";

export type EscalationStatus = "open" | "responded" | "resolved";

export type StatusLabel =
  | "READY"
  | "PROCESSING"
  | "LISTENING"
  | "SEARCHING"
  | "USING TOOL"
  | "GENERATING"
  | "CONNECTED"
  | "NEEDS HUMAN"
  | "ONLINE"
  | "OFFLINE"
  | "ERROR";

export interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string;
  agentName: string;
  agentVoice?: string;
  knowledgeSummary?: CompanyKnowledgeSummary;
  createdAt: string;
}

export interface CompanyKnowledgeSummary {
  whatYouSell: string;
  primaryBuyers: string[];
  coreUseCases: string[];
  commonObjections: string[];
}

export interface KnowledgeSource {
  id: string;
  title: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface McpServer {
  id: string;
  label: string;
  serverUrl: string;
  allowWrite: boolean;
  enabled: boolean;
  tools: McpTool[];
  createdAt: string;
}

export interface McpTool {
  name: string;
  description?: string;
}

export interface ProspectMemory {
  stage: ProspectStage | string;
  summary: string;
  currentStack: string[];
  painPoints: string[];
  requirements: string[];
  objections: string[];
  nextAction: string;
}

export interface Prospect {
  id: string;
  companyId: string;
  companyName: string;
  personName?: string;
  email?: string;
  memory: ProspectMemory;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  companyId: string;
  prospectId: string;
  prospect?: Prospect;
  lastChannel?: Channel;
  lastMessagePreview?: string;
  updatedAt: string;
  createdAt: string;
}

export interface AgentEvent {
  type: AgentEventType;
  label: string;
}

export interface MessageArtifact {
  type: "architecture" | "implementation_plan" | "image" | "proposal" | "code";
  title: string;
  data: ArchitectureData | ImplementationPlanData | CodeExampleData | ImageArtifactData | ProposalData;
}

export interface ArchitectureNode {
  id: string;
  label: string;
  kind?: string;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ArchitectureData {
  title: string;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  notes?: string[];
}

export interface ImplementationPlanData {
  title: string;
  steps: { title: string; detail: string }[];
}

export interface CodeExampleData {
  title: string;
  language: string;
  code: string;
}

export interface ImageArtifactData {
  title: string;
  url: string;
  alt?: string;
}

export interface ProposalData {
  title: string;
  summary: string;
  bullets: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  channel: Channel;
  role: MessageRole;
  content: string;
  events?: AgentEvent[];
  artifacts?: MessageArtifact[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Face / video media for the call stage (Person B can populate these). */
export interface CallMedia {
  /** Still portrait used while connecting, idle, or if video fails. */
  faceImageUrl?: string;
  /**
   * Talking / looping face video (mock asset or Grok Imagine clip).
   * Played when the agent is speaking if no live stream is attached.
   */
  faceVideoUrl?: string;
  /**
   * Live realtime stream URL (HLS/WebRTC gateway) when Person B wires voice+face.
   * Takes priority over faceVideoUrl when present.
   */
  streamUrl?: string;
  /** Optional WebRTC room / session token for browser-side attach. */
  realtimeToken?: string;
  /** Display label under the video stage. */
  displayName?: string;
}

export type CallSpeakingState = "idle" | "listening" | "speaking" | "thinking";

export interface CallSession {
  id: string;
  conversationId: string;
  status: "connecting" | "connected" | "ended";
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  transcript: CallTranscriptLine[];
  liveActivity: AgentEvent[];
  learned?: string[];
  /** Face + video payload for the call UI. */
  media?: CallMedia;
}

export interface CallTranscriptLine {
  id: string;
  speaker: "agent" | "prospect";
  text: string;
  at: string;
}

export interface Escalation {
  id: string;
  companyId: string;
  prospectId: string;
  conversationId?: string;
  prospectName: string;
  question: string;
  reason: string;
  priority: "low" | "medium" | "high";
  status: EscalationStatus;
  createdAt: string;
}

export interface DashboardData {
  metrics: {
    activeProspects: number;
    conversations: number;
    calls: number;
    needsHelp: number;
  };
  escalations: Escalation[];
  recentConversations: {
    id: string;
    prospectName: string;
    channel: Channel;
    preview: string;
    updatedAt: string;
  }[];
  agent: {
    name: string;
    status: "ONLINE" | "OFFLINE";
    knowledgeSourceCount: number;
    mcpToolCount: number;
  };
}

export interface ChatMessageResponse {
  message: Message;
  prospect: ProspectMemory;
  events: AgentEvent[];
}

export interface OnboardingState {
  step: number;
  companyName: string;
  agentName: string;
  agentVoice?: string;
  sourcesAdded: number;
}
