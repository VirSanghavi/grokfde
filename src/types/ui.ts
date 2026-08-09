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
   * Talking loop, played while the agent is speaking when no live stream is
   * attached. Not lip-synced — it reads as a person talking, nothing more.
   */
  faceVideoUrl?: string;
  /**
   * Listening loop, played while the agent is silent. Without this the stage
   * freezes on a still between every sentence, which reads as a dropped call.
   */
  idleVideoUrl?: string;
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
  /** Segments of one spoken turn share this, so the UI merges them into one line. */
  turnId?: number;
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

/* ─── Implementation workspace (second-pass FDE lifecycle) ─── */

export type WorkspaceStatus =
  | "discovery"
  | "connected"
  | "analyzing"
  | "analyzed"
  | "planning"
  | "planned"
  | "building"
  | "ready_for_review"
  | "failed";

export type ImplementationRunStatus =
  | "queued"
  | "analyzing"
  | "planning"
  | "building"
  | "testing"
  | "repairing"
  | "ready_for_review"
  | "failed"
  | "pr_ready";

export type FileOperation = "create" | "modify" | "delete";

export type ImplementationEventType =
  | "repository_connected"
  | "repository_analyzing"
  | "repository_analyzed"
  | "implementation_planning"
  | "implementation_plan_ready"
  | "implementation_started"
  | "file_modified"
  | "test_started"
  | "test_passed"
  | "test_failed"
  | "repair_started"
  | "repair_completed"
  | "pr_ready"
  | string;

export interface ImplementationEvent {
  type: ImplementationEventType;
  label: string;
  at?: string;
}

export interface WorkspaceRepository {
  id: string;
  repositoryName: string;
  defaultBranch: string;
  status: "connected" | "error";
  provider: "demo" | "github";
}

export interface ImportantFile {
  path: string;
  reason: string;
}

export interface WorkspaceAnalysis {
  status: "analyzed";
  stack: string[];
  architectureSummary: string;
  importantFiles: ImportantFile[];
  integrationPoints: string[];
  risks: string[];
}

export interface PlanChange {
  path: string;
  operation: FileOperation;
  purpose: string;
}

export interface ImplementationPlan {
  planId: string;
  summary: string;
  changes: PlanChange[];
  tests: string[];
  risks: string[];
  requiresApproval: boolean;
  objective?: string;
}

export interface ImplementationFile {
  path: string;
  operation: FileOperation;
  diff?: string;
}

export interface ImplementationTest {
  name: string;
  status: "passed" | "failed" | "running" | "pending" | string;
  output?: string;
}

export interface PullRequestInfo {
  number?: number;
  title: string;
  url: string;
  branchName: string;
  status: "ready" | "open" | "merged";
}

export interface ImplementationRun {
  id: string;
  workspaceId: string;
  status: ImplementationRunStatus;
  branchName: string;
  summary?: string;
  files: ImplementationFile[];
  tests: ImplementationTest[];
  events: ImplementationEvent[];
  pr?: PullRequestInfo;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  prospectId: string;
  conversationId: string;
  status: WorkspaceStatus;
  objective: string;
  repository?: WorkspaceRepository;
  analysis?: WorkspaceAnalysis;
  plan?: ImplementationPlan;
  activeRunId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ─── Pass 3: Account Room + Slack lifecycle ─── */

export type AccountStage =
  | "prospect"
  | "discovery"
  | "technical_evaluation"
  | "proof_of_concept"
  | "implementation"
  | "staging"
  | "production"
  | "expansion"
  | "blocked";

export type TimelineItemType =
  | "chat"
  | "email"
  | "call"
  | "slack"
  | "implementation"
  | "deployment"
  | "decision"
  | "blocker"
  | "milestone"
  | "github"
  | "system"
  | string;

export interface SlackConnection {
  id: string;
  workspaceName: string;
  channelId: string;
  channelName: string;
  status: "connected" | "error" | "disconnected";
  botName?: string;
  participantCount?: number;
  lastActiveAt?: string;
  permissions?: string[];
}

export interface SlackMessage {
  id: string;
  author: string;
  authorRole?: "customer" | "agent" | "vendor" | "system";
  text: string;
  createdAt: string;
}

export interface SlackThread {
  id: string;
  channelName: string;
  root: SlackMessage;
  replies: SlackMessage[];
}

export type BlockerOwnerKind = "customer" | "vendor" | "atlas" | "unknown";

export interface AccountBlocker {
  id: string;
  title: string;
  description?: string;
  owner?: string;
  ownerKind?: BlockerOwnerKind;
  source?: string;
  status: "open" | "resolved";
  impact?: string;
  atlasAction?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AccountDecision {
  id: string;
  title: string;
  decision: string;
  rationale?: string;
  source?: string;
  createdAt: string;
}

export interface Commitment {
  id: string;
  owner: string;
  description: string;
  status: "open" | "done";
  dueLabel?: string;
}

export interface Milestone {
  id: string;
  label: string;
  status: "completed" | "current" | "upcoming" | "blocked";
}

export type DeploymentStatus =
  | "not_started"
  | "staging"
  | "validating"
  | "ready_for_production"
  | "production"
  | "degraded"
  | "rolled_back"
  | string;

export interface DeploymentCheck {
  label: string;
  status: "passed" | "running" | "pending" | "failed" | string;
}

export interface DeploymentState {
  environment: string;
  status: DeploymentStatus;
  version?: string;
  checks?: DeploymentCheck[];
  next?: string;
  demo?: boolean;
}

export interface AdoptionMetrics {
  liveFor?: string;
  runs?: number;
  successRate?: number;
  escalations?: number;
  customerUsers?: number;
  recommendation?: string;
}

export interface QualityMetrics {
  scenarioPassRate?: number;
  policyAdherence?: number;
  toolCorrectness?: number;
  escalationAccuracy?: number;
  issues?: number;
  status?: "PASSING" | "NEEDS ATTENTION" | string;
}

export interface ProductionIssue {
  id: string;
  title: string;
  environment: string;
  firstReported?: string;
  source?: string;
  status: "investigating" | "root_cause_found" | "fix_ready" | "needs_customer" | "resolved" | string;
  rootCause?: string;
  atlasStatus?: string;
  linkedPr?: string;
}

export interface ImplementationRequest {
  id: string;
  source: string;
  request: string;
  status: "open" | "planned" | "building" | "done";
  createdAt: string;
}

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  title: string;
  summary?: string;
  createdAt: string;
  meta?: Record<string, unknown>;
  threadId?: string;
}

export interface FieldSignal {
  id: string;
  type: string;
  title: string;
  accountCount: number;
  recommendation?: string;
}

export interface Playbook {
  id: string;
  title: string;
  usedBy: number;
  includes: string[];
}

export interface AccountRoom {
  id: string;
  prospectId: string;
  conversationId: string;
  name: string;
  stage: AccountStage;
  successOutcome: string;
  successCriteria: string[];
  stack: string[];
  atlasStatus: string;
  nextAction: string;
  nextMilestone?: string;
  currentImplementation?: string;
  currentEnvironment?: string;
  slack?: SlackConnection;
  milestones: Milestone[];
  blockers: AccountBlocker[];
  decisions: AccountDecision[];
  commitments: Commitment[];
  deployment?: DeploymentState;
  adoption?: AdoptionMetrics;
  quality?: QualityMetrics;
  issue?: ProductionIssue | null;
  implementationRequest?: ImplementationRequest | null;
  timeline: TimelineItem[];
  updatedAt: string;
}

export interface FdeDashboardData extends DashboardData {
  metrics: DashboardData["metrics"] & {
    activeAccounts?: number;
    implementations?: number;
    production?: number;
    blocked?: number;
  };
  blockedAccounts?: { id: string; name: string; blocker: string }[];
  fieldSignalsPreview?: FieldSignal[];
  atlasActivity?: { label: string; at: string }[];
}
