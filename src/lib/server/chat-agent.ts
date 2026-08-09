import { askGrok, askGrokStreaming, askGrokStructured } from "@/lib/ai/grok";
import { buildFdeSystemPrompt } from "@/lib/ai/prompts/fde";
import {
  PROSPECT_MEMORY_SYSTEM,
  prospectMemoryUserPrompt,
} from "@/lib/ai/prompts/prospect-memory";
import { getCompanyById } from "./company-context";
import {
  companyHasDemoMcp,
  buildMcpToolConfigs,
  listEnabledMcpServers,
} from "./mcp";
import { demoToolFunctionConfigs, executeDemoTool } from "./demo-tools";
import {
  getConversationBundle,
  getProspectMemory,
  getRecentMessages,
  insertMessage,
  prospectToChatShape,
  updateProspectMemory,
} from "./prospect-context";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  ProspectMemorySchema,
  type AgentEvent,
  type ChatResponse,
  type ProspectMemory,
  type ProspectRow,
} from "./types";
import { ApiError } from "./errors";
import { parseKnowledgeSummary } from "./merge";

const LEGAL_RE =
  /\b(hipaa|baa|soc\s*2|gdpr|contract(ual)?|msa|sla|indemnif|liability|legal|compliance|security questionnaire|sign (a |an )?(baa|msa|nda))\b/i;

function isLegalOrExceptionQuestion(message: string): boolean {
  return (
    LEGAL_RE.test(message) ||
    /\b(pricing exception|custom (price|pricing)|enterprise agreement|guarantee)\b/i.test(
      message,
    )
  );
}

function wantsSandbox(message: string): boolean {
  return /\b(sandbox|trial environment|spin up|create.*env)\b/i.test(message);
}

function extractSandboxName(message: string, prospect: ProspectRow): string {
  const nameMatch =
    message.match(/\b(?:named?|call(?:ed)?)\s+[\"']?([a-z0-9-_]+)[\"']?/i) ||
    message.match(/\b([a-z0-9-_]*test[a-z0-9-_]*)\b/i);
  if (nameMatch?.[1]) return nameMatch[1];
  if (prospect.company_name) {
    return `${prospect.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-test`;
  }
  return "prospect-sandbox";
}

function applyDemoSandboxIfNeeded(args: {
  message: string;
  prospect: ProspectRow;
  assistantContent: string;
  functionTools: Array<{ name: string }>;
  events: AgentEvent[];
}): string {
  const canSandbox = args.functionTools.some((t) => t.name === "create_sandbox");
  if (!canSandbox || !wantsSandbox(args.message)) return args.assistantContent;
  if (/sandbox\.grok-fde\.demo|sbx_/i.test(args.assistantContent)) {
    return args.assistantContent;
  }

  // Require intent to create (or a name) so we don't create on pure questions
  const hasIntent =
    /\b(yes|sure|please|create|make|go ahead|set up|spin)\b/i.test(args.message) ||
    /\b(?:named?|call(?:ed)?)\s+[\"']?[a-z0-9-_]+/i.test(args.message);

  if (!hasIntent) {
    return (
      args.assistantContent ||
      "I can create a trial sandbox for you. What should I name it?"
    );
  }

  const sandboxName = extractSandboxName(args.message, args.prospect);
  const exec = executeDemoTool("create_sandbox", { name: sandboxName });
  args.events.push({ type: "using_tool", label: "Using create_sandbox" });

  if (!exec.ok) {
    return `${args.assistantContent ? args.assistantContent + "\n\n" : ""}I tried to create a sandbox but it failed: ${exec.error}`;
  }

  const r = exec.result as { name: string; endpoint: string; id: string };
  const success = `Done — I created sandbox **${r.name}**. Endpoint: \`${r.endpoint}\` (id: ${r.id}). You can hit that from your environment to try the integration path we discussed.`;
  // Prefer the tool result alone when prior text was only a prompt for a name
  if (!args.assistantContent?.trim() || /give me a name|what should I name/i.test(args.assistantContent)) {
    return success;
  }
  return `${args.assistantContent.trim()}\n\n${success}`;
}

function legalEscalationReply(companyName: string, agentName: string): string {
  return `I won't invent a contractual or compliance commitment for ${companyName}. Our documentation doesn't give me a definitive answer I can stand behind on that point, so I'm flagging it for a human on the team rather than guessing. I'll make sure they have the full context of what you asked.`;
}

function groundedFallback(args: {
  companyName: string;
  agentName: string;
  message: string;
  memory: ProspectMemory;
  knowledge: unknown;
}): string {
  const knowledge = parseKnowledgeSummary(args.knowledge);
  const products = knowledge.products.join(", ");
  const caps = knowledge.capabilities.slice(0, 5).join("; ");
  const stack = args.memory.currentStack;
  const value =
    knowledge.valueProposition ||
    knowledge.companyDescription ||
    `${args.companyName} turns company knowledge and tools into a persistent AI FDE that prospects can chat, email, and call.`;

  if (isLegalOrExceptionQuestion(args.message)) {
    return legalEscalationReply(args.companyName, args.agentName);
  }

  if (wantsSandbox(args.message)) {
    // Tool layer fills in actual create; this is only if tools unavailable
    return "I can create a trial sandbox for you through our tools. Give me a name and I'll provision it.";
  }

  if (/\bwhat do you (guys )?do\b|\bwhat is\b|\bwho are you\b/i.test(args.message)) {
    return `I'm ${args.agentName}, a forward-deployed engineer for ${args.companyName}. ${value}${
      products ? ` Core products: ${products}.` : ""
    }${caps ? ` Key capabilities: ${caps}.` : ""} What does your environment look like today?`;
  }

  if (stack.length && /\brecommend|fit|work with|integrat|current stack\b/i.test(args.message)) {
    return `Given you're on ${stack.join(" + ")}, I wouldn't rip that out. I'd put ${args.companyName} alongside it — chat, email, and voice against your existing stack, with MCP if you expose tools.${
      caps ? ` We can lean on: ${caps}.` : ""
    } Want me to sketch the architecture?`;
  }

  if (/\bkubernetes\b|\baws\b/i.test(args.message)) {
    return `Yes — ${args.companyName} is designed to sit next to existing infrastructure like Kubernetes on AWS rather than replace your orchestration layer. Tell me how prospects currently get technical answers, and I can show the cleanest integration path.`;
  }

  if (/\bmcp\b|internal platform|salesforce/i.test(args.message)) {
    return `If your internal platform exposes an MCP server, I can connect and use its tools directly during the conversation. Otherwise I can work from API docs you upload. Either path keeps ${args.companyName} next to systems like ${
      stack.length ? stack.join(", ") : "your current stack"
    }.`;
  }

  return `Good question. Based on what I know about ${args.companyName}${
    products ? ` (${products})` : ""
  }, I can go deep on implementation — but I only claim what our knowledge supports. ${
    stack.length ? `I already have you on ${stack.join(", ")}. ` : ""
  }What are you trying to get working first?`;
}

const STACK_TOKENS = [
  "Kubernetes",
  "EKS",
  "AWS",
  "GCP",
  "Azure",
  "Salesforce",
  "Lambda",
  "GitHub",
  "Postgres",
  "Snowflake",
  "MCP",
] as const;

/** Split compounds like "Kubernetes on AWS" into discrete stack items. */
export function extractStackTokens(text: string): string[] {
  const found: string[] = [];
  const set = new Set<string>();
  for (const token of STACK_TOKENS) {
    if (new RegExp(`\\b${token}\\b`, "i").test(text) && !set.has(token.toLowerCase())) {
      found.push(token);
      set.add(token.toLowerCase());
    }
  }
  return found;
}

function normalizeStackList(items: string[]): string[] {
  const out: string[] = [];
  const set = new Set<string>();
  for (const raw of items) {
    const parts = extractStackTokens(raw);
    const candidates = parts.length ? parts : [raw.trim()];
    for (const c of candidates) {
      if (!c) continue;
      const key = c.toLowerCase();
      if (set.has(key)) continue;
      set.add(key);
      out.push(c);
    }
  }
  return out;
}

function heuristicMemoryUpdate(
  memory: ProspectMemory,
  userMessage: string,
  assistantContent: string,
): ProspectMemory {
  const next: ProspectMemory = {
    ...memory,
    currentStack: normalizeStackList(memory.currentStack),
    painPoints: [...memory.painPoints],
    requirements: [...memory.requirements],
    technicalQuestions: [...memory.technicalQuestions],
    objections: [...memory.objections],
    competitors: [...memory.competitors],
    commitments: [...memory.commitments],
    unresolvedQuestions: [...memory.unresolvedQuestions],
    people: [...(memory.people ?? [])],
  };

  const stackHits = extractStackTokens(userMessage);
  if (stackHits.length) {
    next.currentStack = normalizeStackList([...next.currentStack, ...stackHits]);
  }

  if (/\bkubernetes\b|\baws\b|\bstack\b|\bintegrat/i.test(userMessage)) {
    if (next.stage === "new" || next.stage === "discovery") {
      next.stage = "technical-evaluation";
    }
  } else if (next.stage === "new" && userMessage.length > 20) {
    next.stage = "discovery";
  }

  if (isLegalOrExceptionQuestion(userMessage)) {
    next.unresolvedQuestions = Array.from(
      new Set([...next.unresolvedQuestions, userMessage.slice(0, 200)]),
    );
    next.objections = Array.from(
      new Set([...next.objections, "Needs human confirmation on compliance/contract"]),
    );
    next.nextAction = "Human follow-up on legal/compliance question";
  }

  if (wantsSandbox(userMessage) && /created sandbox|endpoint:/i.test(assistantContent)) {
    next.commitments = Array.from(
      new Set([...next.commitments, "Sandbox provisioned for evaluation"]),
    );
    next.nextAction = "Prospect tries sandbox endpoint";
  }

  if (!next.summary && next.currentStack.length) {
    next.summary = `Uses ${next.currentStack.join(", ")}.`;
  } else if (next.currentStack.length && next.summary) {
    for (const s of next.currentStack) {
      if (!new RegExp(s, "i").test(next.summary)) {
        next.summary = `${next.summary} Stack includes ${s}.`;
      }
    }
  }

  if (/\brecommend|architecture|migrat/i.test(userMessage) && !next.nextAction) {
    next.nextAction = "Review architecture recommendation";
  }

  return next;
}

export async function handleChatMessage(args: {
  conversationId: string;
  message: string;
  channel?: "chat" | "email";
  confirmedWriteTools?: string[];
  /**
   * When provided, the reply is streamed and each text chunk is handed over as
   * it arrives. Everything downstream — persistence, memory extraction,
   * escalation — is unchanged; only how the prose is fetched differs.
   *
   * Skipped when the turn has tools available, since a tool round-trip emits
   * no prose on the first pass and would show a stalled empty bubble.
   */
  onDelta?: (chunk: string) => void;
}): Promise<ChatResponse> {
  const message = args.message?.trim();
  if (!message) {
    throw new ApiError("BAD_REQUEST", "message is required", { status: 400 });
  }

  const channel = args.channel ?? "chat";
  const { conversation, prospect, companyId } = await getConversationBundle(
    args.conversationId,
  );
  const company = await getCompanyById(companyId);
  const recent = await getRecentMessages(conversation.id, 16);
  const memory = getProspectMemory(prospect);
  const mcpServers = await listEnabledMcpServers(companyId);

  await insertMessage({
    conversationId: conversation.id,
    channel,
    role: "user",
    content: message,
  });

  const events: AgentEvent[] = [];
  if (company.xai_collection_id && !company.xai_collection_id.startsWith("local_")) {
    events.push({ type: "searching_knowledge", label: "Searching company knowledge" });
  } else {
    events.push({ type: "searching_knowledge", label: "Using company knowledge summary" });
  }

  const mcpConfigs = buildMcpToolConfigs(mcpServers, {
    confirmedWriteTools: args.confirmedWriteTools,
  });

  const functionTools =
    companyHasDemoMcp(mcpServers) || mcpConfigs.length === 0
      ? demoToolFunctionConfigs()
      : [];

  const system = buildFdeSystemPrompt({
    company,
    prospectMemory: memory,
    prospectName: prospect.person_name,
    prospectCompany: prospect.company_name,
    channel,
    recentMessages: recent.map((m) => ({
      role: m.role,
      content: m.content,
      channel: m.channel,
    })),
    mcpToolNames: [
      ...mcpConfigs.map((m) => m.server_label),
      ...functionTools.map((f) => f.name),
    ],
  });

  const collectionIds =
    company.xai_collection_id && !company.xai_collection_id.startsWith("local_")
      ? [company.xai_collection_id]
      : undefined;

  // When Collections unavailable, attach uploaded xAI file IDs for document search
  let knowledgeFileIds: string[] = [];
  if (!collectionIds?.length) {
    const db = getSupabaseAdmin();
    const { data: sources } = await db
      .from("knowledge_sources")
      .select("xai_file_id")
      .eq("company_id", companyId)
      .eq("status", "ready")
      .not("xai_file_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);
    knowledgeFileIds = (sources ?? [])
      .map((s) => s.xai_file_id as string | null)
      .filter((id): id is string => Boolean(id));
    if (knowledgeFileIds.length) {
      events.push({
        type: "searching_knowledge",
        label: "Reading company knowledge files",
      });
    }
  }

  let assistantContent = "";

  // Fast offline path for legal: never invent, always escalate-ready copy
  if (isLegalOrExceptionQuestion(message) && !process.env.XAI_API_KEY) {
    assistantContent = legalEscalationReply(company.name, company.agent_name);
  } else if (process.env.XAI_API_KEY) {
    try {
      const canStream =
        Boolean(args.onDelta) &&
        !functionTools.length &&
        !mcpConfigs.length &&
        !collectionIds?.length &&
        !knowledgeFileIds.length;

      const askOptions = {
        messages: [
          { role: "system" as const, content: system },
          {
            role: "user" as const,
            content:
              message +
              (functionTools.length
                ? `\n\n(If a demo tool would help — create_sandbox, estimate_cost, list_capabilities, generate_config — you may call it. Only claim success if a tool result is present.)`
                : ""),
          },
        ],
        collectionIds,
        fileIds: knowledgeFileIds,
        mcpTools: mcpConfigs,
        functionTools: functionTools.length ? functionTools : undefined,
        temperature: 0.45,
      };

      const result = canStream
        ? await askGrokStreaming(askOptions, args.onDelta!)
        : await askGrok(askOptions);

      assistantContent = result.content;

      for (const te of result.toolEvents) {
        if (te.type === "searching_knowledge") {
          events.push({ type: "searching_knowledge", label: te.label });
        } else if (te.type === "searching_web") {
          events.push({ type: "searching_web", label: te.label });
        } else if (te.type === "using_tool") {
          events.push({ type: "using_tool", label: te.label });
        }
      }

      const rawOutput = (result.raw.output as Array<Record<string, unknown>>) ?? [];
      for (const item of rawOutput) {
        if (item.type === "function_call" && typeof item.name === "string") {
          let argsObj: Record<string, unknown> = {};
          try {
            argsObj = JSON.parse(String(item.arguments ?? "{}"));
          } catch {
            argsObj = {};
          }
          const exec = executeDemoTool(item.name, argsObj);
          events.push({ type: "using_tool", label: `Using ${item.name}` });
          if (exec.ok) {
            try {
              const follow = await askGrok({
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: message },
                  {
                    role: "assistant",
                    content: assistantContent || `(calling ${item.name})`,
                  },
                  {
                    role: "user",
                    content: `Tool ${item.name} returned: ${JSON.stringify(exec.result)}. Continue as the FDE with this result. Do not invent additional tool outcomes.`,
                  },
                ],
                collectionIds,
                temperature: 0.3,
              });
              assistantContent = follow.content || assistantContent;
            } catch {
              assistantContent = `Tool ${item.name} succeeded: ${JSON.stringify(exec.result)}`;
            }
          } else {
            assistantContent =
              assistantContent ||
              `I tried to run ${item.name} but it failed: ${exec.error}`;
          }
        }
      }
    } catch (err) {
      console.error("[chat-agent] grok failed", err);
      assistantContent = groundedFallback({
        companyName: company.name,
        agentName: company.agent_name,
        message,
        memory,
        knowledge: company.knowledge_summary_json,
      });
    }
  } else {
    assistantContent = groundedFallback({
      companyName: company.name,
      agentName: company.agent_name,
      message,
      memory,
      knowledge: company.knowledge_summary_json,
    });
  }

  // Deterministic demo tool execution (works with or without live Grok)
  assistantContent = applyDemoSandboxIfNeeded({
    message,
    prospect,
    assistantContent,
    functionTools,
    events,
  });

  if (!assistantContent) {
    assistantContent =
      "I want to make sure I answer this accurately. Could you share a bit more about your current stack and what you're trying to accomplish?";
  }

  let escalation:
    | { id: string; question: string; reason: string; priority: string }
    | undefined;

  const mustEscalate =
    isLegalOrExceptionQuestion(message) ||
    /\b(flag(?:ged)? for|need to verify|cannot confirm|won't invent|do not have.*(docs|documentation))\b/i.test(
      assistantContent,
    );

  if (mustEscalate && isLegalOrExceptionQuestion(message)) {
    const db = getSupabaseAdmin();
    const reason = "Not confidently answerable from company documentation";
    if (!/flag|human|team|verify|won't invent|cannot/i.test(assistantContent)) {
      assistantContent = `${assistantContent}\n\nI've flagged this for the team so we don't guess on something that needs a definitive company answer.`;
    }

    const { data: esc } = await db
      .from("escalations")
      .insert({
        company_id: companyId,
        prospect_id: prospect.id,
        conversation_id: conversation.id,
        question: message,
        reason,
        priority: "high",
        status: "open",
        suggested_response: assistantContent.slice(0, 1000),
      })
      .select("id")
      .single();

    if (esc) {
      escalation = {
        id: esc.id,
        question: message,
        reason,
        priority: "high",
      };
      events.push({ type: "needs_human", label: "Company confirmation required" });
    }
  }

  const assistantMessage = await insertMessage({
    conversationId: conversation.id,
    channel,
    role: "assistant",
    content: assistantContent,
    metadata: { events, escalationId: escalation?.id },
  });

  let updatedProspect = prospect;
  try {
    if (process.env.XAI_API_KEY) {
      const extracted = await askGrokStructured({
        schema: ProspectMemorySchema,
        schemaName: "ProspectMemory",
        messages: [
          { role: "system", content: PROSPECT_MEMORY_SYSTEM },
          {
            role: "user",
            content: prospectMemoryUserPrompt({
              existingMemoryJson: JSON.stringify(memory),
              latestUserMessage: message,
              latestAssistantMessage: assistantContent,
              channel,
            }),
          },
        ],
      });
      updatedProspect = await updateProspectMemory(prospect.id, extracted);
    } else {
      updatedProspect = await updateProspectMemory(
        prospect.id,
        heuristicMemoryUpdate(memory, message, assistantContent),
      );
    }
    events.push({ type: "prospect_updated", label: "Prospect memory updated" });
  } catch (err) {
    console.warn("[chat-agent] memory update failed", err);
    try {
      updatedProspect = await updateProspectMemory(
        prospect.id,
        heuristicMemoryUpdate(memory, message, assistantContent),
      );
      events.push({ type: "prospect_updated", label: "Prospect memory updated" });
    } catch (inner) {
      console.warn("[chat-agent] heuristic memory failed", inner);
    }
  }

  const mem = getProspectMemory(updatedProspect);

  const seen = new Set<string>();
  const deduped = events.filter((e) => {
    const k = `${e.type}:${e.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    message: {
      id: assistantMessage.id,
      role: "assistant",
      content: assistantMessage.content,
      createdAt: assistantMessage.created_at,
    },
    prospect: prospectToChatShape(mem),
    events: deduped,
    ...(escalation ? { escalation } : {}),
  };
}
