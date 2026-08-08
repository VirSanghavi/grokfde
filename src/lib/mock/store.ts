import type {
  CallSession,
  Company,
  Conversation,
  DashboardData,
  Escalation,
  KnowledgeSource,
  McpServer,
  Message,
  Prospect,
  ProspectMemory,
} from "@/types/ui";

const STORAGE_KEY = "grok-fde-mock-v1";

export interface MockStore {
  company: Company;
  sources: KnowledgeSource[];
  mcpServers: McpServer[];
  prospects: Prospect[];
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  escalations: Escalation[];
  calls: CallSession[];
  onboarded: boolean;
}

function now(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

export function createSeedStore(): MockStore {
  const companyId = "co_grok_fde";
  const prospectId = "pr_globex";
  const conversationId = "cv_globex";

  const memory: ProspectMemory = {
    stage: "technical-evaluation",
    summary: "Evaluating Grok FDE for technical sales automation. Interested in MCP and voice.",
    currentStack: ["AWS", "Kubernetes"],
    painPoints: ["GPU availability", "Infrastructure cost", "SE bandwidth"],
    requirements: ["US data residency", "Burst capacity", "Sandbox creation for prospects"],
    objections: ["Migration complexity"],
    nextAction: "Send architecture proposal",
  };

  const company: Company = {
    id: companyId,
    name: "Grok FDE",
    slug: "grok-fde",
    description: "Every prospect gets an engineer.",
    agentName: "Atlas",
    agentVoice: "professional",
    knowledgeSummary: {
      whatYouSell: "AI Forward-Deployed Engineer platform",
      primaryBuyers: ["ML engineering teams", "Infrastructure teams", "Technical sales orgs"],
      coreUseCases: [
        "GPU / inference workload enablement",
        "Technical sales automation",
        "Always-on solutions engineering",
        "Multi-channel prospect engagement",
      ],
      commonObjections: ["Migration effort", "Security & compliance", "Cost predictability"],
    },
    createdAt: now(-86400000 * 3),
  };

  const sources: KnowledgeSource[] = [
    {
      id: "ks_product",
      title: "Product Overview",
      type: "paste",
      status: "ready",
      createdAt: now(-86400000 * 2),
    },
    {
      id: "ks_arch",
      title: "Technical Architecture",
      type: "file",
      status: "ready",
      createdAt: now(-86400000 * 2),
    },
    {
      id: "ks_mcp",
      title: "MCP Integration",
      type: "paste",
      status: "ready",
      createdAt: now(-86400000 * 2),
    },
    {
      id: "ks_voice",
      title: "Voice & Communication",
      type: "file",
      status: "ready",
      createdAt: now(-86400000 * 1),
    },
    {
      id: "ks_security",
      title: "Security",
      type: "file",
      status: "ready",
      createdAt: now(-86400000 * 1),
    },
    {
      id: "ks_pricing",
      title: "Pricing",
      type: "paste",
      status: "ready",
      createdAt: now(-3600000),
    },
  ];

  const mcpServers: McpServer[] = [
    {
      id: "mcp_internal",
      label: "Internal Platform",
      serverUrl: "https://mcp.grok-fde.internal",
      allowWrite: false,
      enabled: true,
      tools: [
        { name: "inspect_project", description: "Inspect a prospect project configuration" },
        { name: "create_sandbox", description: "Provision a temporary sandbox environment" },
        { name: "estimate_cost", description: "Estimate infrastructure cost for a workload" },
      ],
      createdAt: now(-86400000),
    },
  ];

  const prospect: Prospect = {
    id: prospectId,
    companyId,
    companyName: "Globex",
    personName: "Alex Chen",
    email: "alex@globex.io",
    memory,
    createdAt: now(-7200000),
    updatedAt: now(-120000),
  };

  const conversation: Conversation = {
    id: conversationId,
    companyId,
    prospectId,
    prospect,
    lastChannel: "chat",
    lastMessagePreview: "We use Kubernetes on AWS. Could Grok FDE fit into our workflow?",
    createdAt: now(-7200000),
    updatedAt: now(-120000),
  };

  const messages: Message[] = [
    {
      id: "msg_welcome",
      conversationId,
      channel: "chat",
      role: "assistant",
      content:
        "I'm Atlas, Forward-Deployed Engineer at Grok FDE. I can walk you through how we work, map Grok FDE onto your stack, and draft an implementation plan. What does your environment look like today?",
      createdAt: now(-7000000),
    },
    {
      id: "msg_email_1",
      conversationId,
      channel: "email",
      role: "assistant",
      content:
        "Subject: Following up on technical evaluation\n\nAlex — sharing a short overview of how Grok FDE maintains prospect memory across chat, email, and voice. Happy to jump on a call whenever you're ready.",
      createdAt: now(-6800000),
    },
  ];

  const escalations: Escalation[] = [
    {
      id: "esc_hipaa",
      companyId,
      prospectId,
      conversationId,
      prospectName: "Globex",
      question: "Can you support a custom HIPAA agreement?",
      reason: "Not covered by company knowledge.",
      priority: "high",
      status: "open",
      createdAt: now(-5400000),
    },
  ];

  return {
    company,
    sources,
    mcpServers,
    prospects: [prospect],
    conversations: [conversation],
    messages: { [conversationId]: messages },
    escalations,
    calls: [],
    onboarded: true,
  };
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadStore(): MockStore {
  if (!canUseStorage()) return createSeedStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedStore();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as MockStore;
  } catch {
    return createSeedStore();
  }
}

export function saveStore(store: MockStore) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function resetStore() {
  const seed = createSeedStore();
  saveStore(seed);
  return seed;
}

export function updateStore(mutator: (store: MockStore) => void): MockStore {
  const store = loadStore();
  mutator(store);
  saveStore(store);
  return store;
}

export function buildDashboard(store: MockStore): DashboardData {
  const toolCount = store.mcpServers.reduce((n, s) => n + s.tools.length, 0);
  const openEscalations = store.escalations.filter((e) => e.status === "open");

  return {
    metrics: {
      activeProspects: store.prospects.length,
      conversations: store.conversations.length,
      calls: store.calls.filter((c) => c.status === "ended").length + 1,
      needsHelp: openEscalations.length,
    },
    escalations: openEscalations,
    recentConversations: store.conversations
      .slice()
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .map((c) => {
        const prospect = store.prospects.find((p) => p.id === c.prospectId);
        return {
          id: c.id,
          prospectName: prospect?.companyName ?? "Prospect",
          channel: c.lastChannel ?? "chat",
          preview: c.lastMessagePreview ?? "",
          updatedAt: c.updatedAt,
        };
      }),
    agent: {
      name: store.company.agentName,
      status: "ONLINE",
      knowledgeSourceCount: store.sources.length,
      mcpToolCount: toolCount,
    },
  };
}
