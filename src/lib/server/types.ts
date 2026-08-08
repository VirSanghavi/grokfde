import { z } from "zod";

export const AgentEventTypeSchema = z.enum([
  "searching_knowledge",
  "searching_web",
  "using_tool",
  "generating_image",
  "prospect_updated",
  "needs_human",
]);

export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;

export const AgentEventSchema = z.object({
  type: AgentEventTypeSchema,
  label: z.string(),
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const KnowledgeSummarySchema = z.object({
  products: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  useCases: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  technicalFacts: z.array(z.string()).default([]),
  pricingFacts: z.array(z.string()).default([]),
  securityFacts: z.array(z.string()).default([]),
  implementationFacts: z.array(z.string()).default([]),
  commonObjections: z.array(z.string()).default([]),
  buyerTypes: z.array(z.string()).default([]),
  companyDescription: z.string().optional(),
  valueProposition: z.string().optional(),
});

export type KnowledgeSummary = z.infer<typeof KnowledgeSummarySchema>;

export const emptyKnowledgeSummary = (): KnowledgeSummary => ({
  products: [],
  capabilities: [],
  useCases: [],
  integrations: [],
  technicalFacts: [],
  pricingFacts: [],
  securityFacts: [],
  implementationFacts: [],
  commonObjections: [],
  buyerTypes: [],
});

export const ProspectMemorySchema = z.object({
  currentStack: z.array(z.string()).default([]),
  painPoints: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  technicalQuestions: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  competitors: z.array(z.string()).default([]),
  commitments: z.array(z.string()).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
  nextAction: z.string().default(""),
  stage: z.string().default("new"),
  summary: z.string().default(""),
  industry: z.string().optional(),
  people: z.array(z.string()).default([]),
});

export type ProspectMemory = z.infer<typeof ProspectMemorySchema>;

export const emptyProspectMemory = (): ProspectMemory => ({
  currentStack: [],
  painPoints: [],
  requirements: [],
  technicalQuestions: [],
  objections: [],
  competitors: [],
  commitments: [],
  unresolvedQuestions: [],
  nextAction: "",
  stage: "new",
  summary: "",
  people: [],
});

export const ArchitectureSchema = z.object({
  title: z.string(),
  summary: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.string().default("system"),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      label: z.string().optional(),
    }),
  ),
});

export type Architecture = z.infer<typeof ArchitectureSchema>;

export const CallSummarySchema = z.object({
  summary: z.string(),
  technicalRequirements: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  commitments: z.array(z.string()).default([]),
  unansweredQuestions: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  dealStage: z.string().default("technical-evaluation"),
  stackMentions: z.array(z.string()).default([]),
});

export type CallSummary = z.infer<typeof CallSummarySchema>;

export type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  agent_name: string;
  agent_voice: string;
  agent_greeting: string | null;
  agent_email_signature: string | null;
  escalation_contact: string | null;
  xai_collection_id: string | null;
  knowledge_summary_json: KnowledgeSummary | Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ProspectRow = {
  id: string;
  company_id: string;
  company_name: string | null;
  person_name: string | null;
  email: string | null;
  stage: string;
  memory_json: ProspectMemory | Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ConversationRow = {
  id: string;
  company_id: string;
  prospect_id: string;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  channel: "chat" | "email" | "call" | "system";
  role: "user" | "assistant" | "system";
  content: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export type KnowledgeSourceRow = {
  id: string;
  company_id: string;
  type: "file" | "paste" | "url" | "mcp";
  title: string;
  source_url: string | null;
  xai_file_id: string | null;
  status: "processing" | "ready" | "error";
  error_message: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export type McpServerRow = {
  id: string;
  company_id: string;
  label: string;
  server_url: string;
  auth_token: string | null;
  allow_write: boolean;
  enabled: boolean;
  tools_json: Array<{ name: string; description?: string }>;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

/** Frozen frontend contract for chat responses */
export type ChatResponse = {
  message: {
    id: string;
    role: "assistant";
    content: string;
    createdAt: string;
  };
  prospect: {
    stage: string;
    summary: string;
    currentStack: string[];
    painPoints: string[];
    requirements: string[];
    objections: string[];
    nextAction: string;
  };
  events: AgentEvent[];
  escalation?: {
    id: string;
    question: string;
    reason: string;
    priority: string;
  };
};
