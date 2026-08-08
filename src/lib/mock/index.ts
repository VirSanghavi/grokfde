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
import { sleep, slugify, uid } from "@/lib/utils";
import {
  buildAssistantReply,
  buildChatEvents,
  callScript,
  defaultArchitecture,
  mergeMemory,
  needsHumanEscalation,
} from "./responses";
import {
  buildDashboard,
  createSeedStore,
  loadStore,
  resetStore,
  saveStore,
  updateStore,
  type MockStore,
} from "./store";

async function latency(min = 280, max = 900) {
  await sleep(min + Math.floor(Math.random() * (max - min)));
}

function touchConversation(store: MockStore, conversationId: string, preview: string, channel: Message["channel"]) {
  const conv = store.conversations.find((c) => c.id === conversationId);
  if (!conv) return;
  conv.updatedAt = new Date().toISOString();
  conv.lastMessagePreview = preview.slice(0, 140);
  conv.lastChannel = channel;
}

export async function mockCreateCompany(input: {
  name: string;
  agentName: string;
  agentVoice?: string;
}): Promise<Company> {
  await latency(400, 800);
  const store = createSeedStore();
  store.company = {
    id: uid("co"),
    name: input.name,
    slug: slugify(input.name) || "company",
    agentName: input.agentName || "Atlas",
    agentVoice: input.agentVoice || "professional",
    description: "Every prospect gets an engineer.",
    knowledgeSummary: {
      whatYouSell: "AI infrastructure platform",
      primaryBuyers: ["ML engineering teams", "Infrastructure teams"],
      coreUseCases: ["GPU orchestration", "Inference workloads", "Multi-cloud routing"],
      commonObjections: ["Migration effort", "Security", "Cost predictability"],
    },
    createdAt: new Date().toISOString(),
  };
  store.sources = [];
  store.mcpServers = [];
  store.prospects = [];
  store.conversations = [];
  store.messages = {};
  store.escalations = [];
  store.calls = [];
  store.onboarded = false;
  saveStore(store);
  return store.company;
}

export async function mockCompleteOnboarding(): Promise<Company> {
  await latency(300, 600);
  const store = updateStore((s) => {
    s.onboarded = true;
    // Ensure demo prospect exists after onboarding
    if (s.prospects.length === 0) {
      const seeded = createSeedStore();
      s.prospects = seeded.prospects.map((p) => ({
        ...p,
        companyId: s.company.id,
      }));
      s.conversations = seeded.conversations.map((c) => ({
        ...c,
        companyId: s.company.id,
      }));
      s.messages = seeded.messages;
      s.escalations = seeded.escalations.map((e) => ({
        ...e,
        companyId: s.company.id,
      }));
      if (s.sources.length === 0) s.sources = seeded.sources;
      if (s.mcpServers.length === 0) s.mcpServers = seeded.mcpServers;
    }
  });
  return store.company;
}

export async function mockGetCompany(): Promise<Company> {
  await latency(120, 280);
  return loadStore().company;
}

export async function mockGetDashboard(): Promise<DashboardData> {
  await latency(200, 450);
  return buildDashboard(loadStore());
}

export async function mockGetKnowledge(): Promise<KnowledgeSource[]> {
  await latency(150, 350);
  return loadStore().sources.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function mockGetMcpServers(): Promise<McpServer[]> {
  await latency(150, 300);
  return loadStore().mcpServers;
}

export async function mockUploadKnowledge(input: {
  title: string;
  type: KnowledgeSource["type"];
}): Promise<KnowledgeSource> {
  await latency(500, 900);
  const source: KnowledgeSource = {
    id: uid("ks"),
    title: input.title,
    type: input.type,
    status: "processing",
    createdAt: new Date().toISOString(),
  };
  updateStore((s) => {
    s.sources.unshift(source);
  });

  // Simulate processing → ready
  setTimeout(() => {
    updateStore((s) => {
      const found = s.sources.find((x) => x.id === source.id);
      if (found) found.status = "ready";
    });
  }, 1800);

  return source;
}

export async function mockPasteKnowledge(input: {
  title: string;
  content: string;
}): Promise<KnowledgeSource> {
  await latency(400, 700);
  const source: KnowledgeSource = {
    id: uid("ks"),
    title: input.title || "Pasted knowledge",
    type: "paste",
    status: "processing",
    metadata: { chars: input.content.length },
    createdAt: new Date().toISOString(),
  };
  updateStore((s) => {
    s.sources.unshift(source);
  });
  setTimeout(() => {
    updateStore((s) => {
      const found = s.sources.find((x) => x.id === source.id);
      if (found) found.status = "ready";
    });
  }, 1400);
  return source;
}

export async function mockAddUrlKnowledge(input: { url: string; title?: string }): Promise<KnowledgeSource> {
  await latency(400, 800);
  let host = input.url;
  try {
    host = new URL(input.url).hostname;
  } catch {
    /* keep raw */
  }
  const source: KnowledgeSource = {
    id: uid("ks"),
    title: input.title || host,
    type: "url",
    status: "processing",
    sourceUrl: input.url,
    createdAt: new Date().toISOString(),
  };
  updateStore((s) => {
    s.sources.unshift(source);
  });
  setTimeout(() => {
    updateStore((s) => {
      const found = s.sources.find((x) => x.id === source.id);
      if (found) found.status = "ready";
    });
  }, 1600);
  return source;
}

export async function mockConnectMCP(input: {
  label: string;
  serverUrl: string;
  authToken?: string;
  allowWrite?: boolean;
}): Promise<McpServer> {
  await latency(600, 1100);
  const server: McpServer = {
    id: uid("mcp"),
    label: input.label || "MCP Server",
    serverUrl: input.serverUrl,
    allowWrite: Boolean(input.allowWrite),
    enabled: true,
    tools: [
      { name: "inspect_project", description: "Inspect project configuration" },
      { name: "create_sandbox", description: "Create a temporary sandbox" },
      { name: "estimate_cost", description: "Estimate workload cost" },
    ],
    createdAt: new Date().toISOString(),
  };
  updateStore((s) => {
    s.mcpServers.unshift(server);
    s.sources.unshift({
      id: uid("ks"),
      title: input.label || "MCP Server",
      type: "mcp",
      status: "ready",
      metadata: { tools: server.tools.length },
      createdAt: new Date().toISOString(),
    });
  });
  return server;
}

export async function mockGetConversations(): Promise<Conversation[]> {
  await latency(180, 400);
  const store = loadStore();
  return store.conversations
    .slice()
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .map((c) => ({
      ...c,
      prospect: store.prospects.find((p) => p.id === c.prospectId),
    }));
}

export async function mockGetConversation(id: string): Promise<{
  conversation: Conversation;
  messages: Message[];
  prospect: Prospect;
} | null> {
  await latency(150, 350);
  const store = loadStore();
  const conversation = store.conversations.find((c) => c.id === id);
  if (!conversation) return null;
  const prospect = store.prospects.find((p) => p.id === conversation.prospectId);
  if (!prospect) return null;
  return {
    conversation: { ...conversation, prospect },
    messages: store.messages[id] ?? [],
    prospect,
  };
}

export async function mockGetProspect(id: string): Promise<Prospect | null> {
  await latency(120, 280);
  return loadStore().prospects.find((p) => p.id === id) ?? null;
}

export async function mockEnsureProspectSession(companySlug: string, prospectId?: string): Promise<{
  company: Company;
  prospect: Prospect;
  conversation: Conversation;
  messages: Message[];
}> {
  await latency(200, 400);
  const store = loadStore();
  // If slug doesn't match seeded company, still serve demo company for mock
  const company = store.company.slug === companySlug || companySlug === "grok-fde" ? store.company : store.company;

  let prospect = prospectId ? store.prospects.find((p) => p.id === prospectId) : store.prospects[0];

  if (!prospect) {
    prospect = {
      id: uid("pr"),
      companyId: company.id,
      companyName: "Visitor",
      personName: "You",
      memory: {
        stage: "discovery",
        summary: "New prospect session.",
        currentStack: [],
        painPoints: [],
        requirements: [],
        objections: [],
        nextAction: "Discover technical environment",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const conversationId = uid("cv");
    const conversation: Conversation = {
      id: conversationId,
      companyId: company.id,
      prospectId: prospect.id,
      prospect,
      lastChannel: "chat",
      lastMessagePreview: "New conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const welcome: Message = {
      id: uid("msg"),
      conversationId,
      channel: "chat",
      role: "assistant",
      content: `I'm ${company.agentName}, Forward-Deployed Engineer at ${company.name}. Ask me anything technical. I remember context across chat and calls.`,
      createdAt: new Date().toISOString(),
    };
    updateStore((s) => {
      s.prospects.push(prospect!);
      s.conversations.push(conversation);
      s.messages[conversationId] = [welcome];
    });
    return { company, prospect, conversation, messages: [welcome] };
  }

  let conversation = store.conversations.find((c) => c.prospectId === prospect!.id);
  if (!conversation) {
    conversation = {
      id: uid("cv"),
      companyId: company.id,
      prospectId: prospect.id,
      lastChannel: "chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateStore((s) => {
      s.conversations.push(conversation!);
      s.messages[conversation!.id] = [
        {
          id: uid("msg"),
          conversationId: conversation!.id,
          channel: "chat",
          role: "assistant",
          content: `I'm ${company.agentName}. I already have context on ${prospect!.companyName}. How can I help?`,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }

  const fresh = loadStore();
  return {
    company,
    prospect: fresh.prospects.find((p) => p.id === prospect!.id)!,
    conversation: fresh.conversations.find((c) => c.id === conversation!.id)!,
    messages: fresh.messages[conversation!.id] ?? [],
  };
}

export async function mockSendMessage(conversationId: string, text: string): Promise<ChatMessageResponse> {
  await latency(500, 900);
  const store = loadStore();
  const conversation = store.conversations.find((c) => c.id === conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const prospect = store.prospects.find((p) => p.id === conversation.prospectId);
  if (!prospect) throw new Error("Prospect not found");

  const userMsg: Message = {
    id: uid("msg"),
    conversationId,
    channel: "chat",
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
  };

  const events = buildChatEvents(text);
  const nextMemory = mergeMemory(prospect.memory, text);
  const content = buildAssistantReply(text, nextMemory, store.company.agentName, store.company.name);

  const artifacts: MessageArtifact[] = [];
  if (/architecture|diagram|design/i.test(text)) {
    artifacts.push({
      type: "architecture",
      title: defaultArchitecture(prospect.companyName, store.company.name).title,
      data: defaultArchitecture(prospect.companyName, store.company.name),
    });
  }

  if (needsHumanEscalation(text)) {
    events.push({ type: "needs_human", label: "Flagged for human review" });
  }

  const assistantMsg: Message = {
    id: uid("msg"),
    conversationId,
    channel: "chat",
    role: "assistant",
    content,
    events,
    artifacts: artifacts.length ? artifacts : undefined,
    createdAt: new Date(Date.now() + 10).toISOString(),
  };

  updateStore((s) => {
    if (!s.messages[conversationId]) s.messages[conversationId] = [];
    s.messages[conversationId].push(userMsg, assistantMsg);
    const p = s.prospects.find((x) => x.id === prospect.id);
    if (p) {
      p.memory = nextMemory;
      p.updatedAt = new Date().toISOString();
    }
    touchConversation(s, conversationId, text, "chat");

    if (needsHumanEscalation(text)) {
      s.escalations.unshift({
        id: uid("esc"),
        companyId: s.company.id,
        prospectId: prospect.id,
        conversationId,
        prospectName: prospect.companyName,
        question: text,
        reason: "Not covered by company knowledge.",
        priority: "high",
        status: "open",
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Extra thinking latency for activity UI
  await latency(400, 700);

  return {
    message: assistantMsg,
    prospect: nextMemory,
    events,
  };
}

/** Default mock face media — swap faceVideoUrl/streamUrl when Person B ships realtime face. */
function mockCallMedia(agentName: string): CallSession["media"] {
  return {
    faceImageUrl: "/agents/atlas-face.jpg",
    // When backend provides a talking loop or live stream, set:
    // faceVideoUrl: "https://…/atlas-talk.mp4"
    // streamUrl: "https://…/realtime.m3u8"
    // realtimeToken: "…"
    displayName: agentName,
  };
}

export async function mockStartCall(conversationId: string): Promise<CallSession> {
  await latency(300, 600);
  const store = loadStore();
  const session: CallSession = {
    id: uid("call"),
    conversationId,
    status: "connecting",
    transcript: [],
    liveActivity: [{ type: "searching_knowledge", label: "Connecting secure video channel" }],
    media: mockCallMedia(store.company.agentName),
  };
  updateStore((s) => {
    s.calls.unshift(session);
  });
  return session;
}

export async function mockConnectCall(callId: string): Promise<CallSession> {
  await latency(700, 1200);
  let updated: CallSession | null = null;
  updateStore((s) => {
    const call = s.calls.find((c) => c.id === callId);
    if (!call) return;
    call.status = "connected";
    call.startedAt = new Date().toISOString();
    call.liveActivity = [{ type: "searching_knowledge", label: "Loading prospect context" }];
    call.media = {
      ...mockCallMedia(s.company.agentName),
      ...call.media,
    };
    updated = call;
  });
  if (!updated) throw new Error("Call not found");
  return updated;
}

export function mockGetCallScript(conversationId: string) {
  const store = loadStore();
  const conversation = store.conversations.find((c) => c.id === conversationId);
  const prospect = store.prospects.find((p) => p.id === conversation?.prospectId);
  const memory = prospect?.memory ?? {
    stage: "discovery",
    summary: "",
    currentStack: [],
    painPoints: [],
    requirements: [],
    objections: [],
    nextAction: "",
  };
  return callScript(memory, store.company.agentName);
}

export async function mockCompleteCall(input: {
  callId: string;
  conversationId: string;
  transcript: CallTranscriptLine[];
  durationSeconds: number;
}): Promise<{ call: CallSession; prospect: ProspectMemory; learned: string[] }> {
  await latency(500, 900);
  const store = loadStore();
  const conversation = store.conversations.find((c) => c.id === input.conversationId);
  const prospect = store.prospects.find((p) => p.id === conversation?.prospectId);
  if (!conversation || !prospect) throw new Error("Call context missing");

  const transcriptText = input.transcript.map((t) => t.text).join(" ");
  let nextMemory = mergeMemory(prospect.memory, transcriptText);

  // Explicit demo extractions from call script
  const learned: string[] = [];
  if (/salesforce/i.test(transcriptText)) {
    nextMemory = mergeMemory(nextMemory, "Salesforce");
    learned.push("Uses Salesforce");
  }
  if (/eks|kubernetes/i.test(transcriptText) || nextMemory.currentStack.includes("Kubernetes")) {
    if (!nextMemory.currentStack.includes("EKS") && /eks/i.test(transcriptText)) {
      nextMemory.currentStack = [...nextMemory.currentStack, "EKS"];
    }
    learned.push(nextMemory.currentStack.includes("EKS") ? "Uses EKS" : `Uses ${nextMemory.currentStack.join(", ")}`);
  }
  if (/us|residen/i.test(transcriptText)) {
    nextMemory = mergeMemory(nextMemory, "US data residency");
    learned.push("Needs US data residency");
  }
  if (/500\s*gpu/i.test(transcriptText)) {
    if (!nextMemory.requirements.includes("Evaluating 500 GPU-hours/month")) {
      nextMemory.requirements = [...nextMemory.requirements, "Evaluating 500 GPU-hours/month"];
    }
    learned.push("Evaluating 500 GPU-hours/month");
  }
  if (/sandbox/i.test(transcriptText)) {
    learned.push("Wants prospect sandbox creation via MCP");
  }
  if (/implementation/i.test(transcriptText)) {
    nextMemory.nextAction = "Send implementation plan";
    learned.push("Wants implementation plan");
  }

  // Dedupe learned
  const uniqueLearned = Array.from(new Set(learned));

  let callResult: CallSession | null = null;

  updateStore((s) => {
    const call = s.calls.find((c) => c.id === input.callId);
    if (call) {
      call.status = "ended";
      call.endedAt = new Date().toISOString();
      call.durationSeconds = input.durationSeconds;
      call.transcript = input.transcript;
      call.learned = uniqueLearned;
      call.liveActivity = [];
      callResult = call;
    }
    const p = s.prospects.find((x) => x.id === prospect.id);
    if (p) {
      p.memory = nextMemory;
      p.updatedAt = new Date().toISOString();
    }

    // Add call summary message into timeline
    const summaryMsg: Message = {
      id: uid("msg"),
      conversationId: input.conversationId,
      channel: "call",
      role: "system",
      content: `Call ended · ${Math.floor(input.durationSeconds / 60)}m ${input.durationSeconds % 60}s\n\n${input.transcript.map((t) => `${t.speaker === "agent" ? s.company.agentName : p?.companyName ?? "Prospect"}: ${t.text}`).join("\n\n")}`,
      metadata: { learned: uniqueLearned, callId: input.callId },
      createdAt: new Date().toISOString(),
    };
    if (!s.messages[input.conversationId]) s.messages[input.conversationId] = [];
    s.messages[input.conversationId].push(summaryMsg);
    touchConversation(s, input.conversationId, "Call completed", "call");
  });

  if (!callResult) throw new Error("Call not found");

  return { call: callResult, prospect: nextMemory, learned: uniqueLearned };
}

export async function mockGenerateArchitecture(conversationId: string): Promise<MessageArtifact> {
  await latency(700, 1200);
  const store = loadStore();
  const conversation = store.conversations.find((c) => c.id === conversationId);
  const prospect = store.prospects.find((p) => p.id === conversation?.prospectId);
  const data = defaultArchitecture(prospect?.companyName ?? "Prospect", store.company.name);

  // Enrich with stack nodes if present
  if (prospect?.memory.currentStack.length) {
    for (const item of prospect.memory.currentStack.slice(0, 4)) {
      const id = slugify(item) || uid("n");
      if (!data.nodes.find((n) => n.id === id)) {
        data.nodes.push({ id, label: item, kind: "stack" });
        data.edges.push({ from: "fde", to: id, label: "integrates" });
      }
    }
  }

  const artifact: MessageArtifact = {
    type: "architecture",
    title: data.title,
    data,
  };

  if (conversation) {
    updateStore((s) => {
      const msg: Message = {
        id: uid("msg"),
        conversationId,
        channel: "chat",
        role: "assistant",
        content: `Here's a concrete architecture for ${prospect?.companyName ?? "your team"} based on what I've learned so far.`,
        events: [{ type: "generating_architecture", label: "Generating architecture" }],
        artifacts: [artifact],
        createdAt: new Date().toISOString(),
      };
      if (!s.messages[conversationId]) s.messages[conversationId] = [];
      s.messages[conversationId].push(msg);
      touchConversation(s, conversationId, "Generated architecture", "chat");
    });
  }

  return artifact;
}

export async function mockRespondEscalation(id: string, response: string): Promise<void> {
  await latency(300, 500);
  updateStore((s) => {
    const esc = s.escalations.find((e) => e.id === id);
    if (esc) esc.status = "responded";
    if (esc?.conversationId) {
      const msg: Message = {
        id: uid("msg"),
        conversationId: esc.conversationId,
        channel: "system",
        role: "system",
        content: `Human response from the team:\n\n${response}`,
        createdAt: new Date().toISOString(),
      };
      if (!s.messages[esc.conversationId]) s.messages[esc.conversationId] = [];
      s.messages[esc.conversationId].push(msg);
    }
  });
}

export async function mockResetDemo() {
  await latency(100, 200);
  return resetStore();
}

export { loadStore, resetStore };
