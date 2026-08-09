import {
  askGrok,
  askGrokStructured,
  backgroundModel,
  chatModel,
  streamGrok,
  textModel,
  type AskGrokResult,
  type GrokMessage,
  type GrokStreamEvent,
  type ReasoningEffort,
} from "@/lib/ai/grok";
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
  type ConversationRow,
  type ProspectMemory,
  type ProspectRow,
} from "./types";
import { ApiError } from "./errors";
import { parseKnowledgeSummary } from "./merge";

/**
 * Grok 4.5 spends its reasoning budget before emitting a visible character:
 * ~5s at default effort, ~1.2s at "low". A prospect watching a blank chat panel
 * is the thing we are optimizing against, so chat asks for "low". Background
 * work (memory extraction, knowledge ingestion) keeps the default.
 */
const CHAT_REASONING_EFFORT: ReasoningEffort =
  process.env.XAI_CHAT_REASONING_EFFORT === "high" ? "high" : "low";

/**
 * How long the stream stays open waiting on post-answer memory extraction.
 *
 * The answer is already rendered and persisted before this clock starts, so
 * this only decides whether the client learns the new memory on this connection
 * or on its next read. The model call measures ~2.5s and the read-merge-write
 * around it adds two more Supabase round trips; 8s clipped a real turn at 8.2s,
 * so the budget sits above the observed tail. When it is exceeded the stream
 * closes anyway and the write still lands via the route's `after()`.
 */
const MEMORY_STREAM_BUDGET_MS = 12_000;

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

function dedupeEvents(events: AgentEvent[]): AgentEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const k = `${e.type}:${e.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Everything a turn needs, loaded once and shared by both entry points. */
type TurnContext = {
  conversation: ConversationRow;
  prospect: ProspectRow;
  company: Awaited<ReturnType<typeof getCompanyById>>;
  companyId: string;
  memory: ProspectMemory;
  message: string;
  channel: "chat" | "email";
  system: string;
  collectionIds: string[] | undefined;
  knowledgeFileIds: string[];
  mcpConfigs: ReturnType<typeof buildMcpToolConfigs>;
  functionTools: ReturnType<typeof demoToolFunctionConfigs>;
  events: AgentEvent[];
  /**
   * The inbound turn's write, started but deliberately not awaited: it does not
   * gate generation. Await it before writing the assistant reply so the two rows
   * cannot land out of order.
   */
  userMessageWritten: Promise<unknown>;
};

/**
 * Loads conversation, company, history, MCP config, and knowledge handles.
 *
 * Every millisecond here lands directly on time-to-first-token, so this is two
 * database round trips rather than four: the conversation and its prospect come
 * back in a single embedded read, the four independent lookups run concurrently,
 * and the inbound message write is started without being awaited. History is
 * read before that write so the new turn is not duplicated into the prompt.
 */
async function prepareTurn(args: {
  conversationId: string;
  message: string;
  channel?: "chat" | "email";
  confirmedWriteTools?: string[];
}): Promise<TurnContext> {
  const message = args.message?.trim();
  if (!message) {
    throw new ApiError("BAD_REQUEST", "message is required", { status: 400 });
  }

  const channel = args.channel ?? "chat";
  const db = getSupabaseAdmin();

  // `prospects` is a to-ONE relation here, so PostgREST embeds it as an object.
  const { data: row, error } = await db
    .from("conversations")
    .select("*, prospects(*)")
    .eq("id", args.conversationId)
    .maybeSingle();

  if (error || !row) {
    throw new ApiError("NOT_FOUND", "Conversation not found", { status: 404 });
  }

  const { prospects, ...conversationRow } = row as Record<string, unknown>;
  const conversation = conversationRow as unknown as ConversationRow;
  const prospect = prospects as ProspectRow | null;
  if (!prospect) {
    throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
  }

  const companyId = conversation.company_id;

  const [company, recent, mcpServers, knowledgeSources] = await Promise.all([
    getCompanyById(companyId),
    getRecentMessages(conversation.id, 16),
    listEnabledMcpServers(companyId),
    db
      .from("knowledge_sources")
      .select("xai_file_id")
      .eq("company_id", companyId)
      .eq("status", "ready")
      .not("xai_file_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const memory = getProspectMemory(prospect);

  const userMessageWritten = insertMessage({
    conversationId: conversation.id,
    channel,
    role: "user",
    content: message,
  });
  // Prevents an unhandled rejection while nothing is awaiting it yet; the real
  // failure surfaces where the promise is awaited.
  userMessageWritten.catch(() => {});

  const events: AgentEvent[] = [];
  const hasCollection = Boolean(
    company.xai_collection_id && !company.xai_collection_id.startsWith("local_"),
  );
  events.push(
    hasCollection
      ? { type: "searching_knowledge", label: "Searching company knowledge" }
      : { type: "searching_knowledge", label: "Using company knowledge summary" },
  );

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

  const collectionIds = hasCollection ? [company.xai_collection_id as string] : undefined;

  // Without a Collection, uploaded xAI file IDs ride along on the user turn.
  let knowledgeFileIds: string[] = [];
  if (!collectionIds?.length) {
    knowledgeFileIds = (knowledgeSources.data ?? [])
      .map((s) => s.xai_file_id as string | null)
      .filter((id): id is string => Boolean(id));
    if (knowledgeFileIds.length) {
      events.push({
        type: "searching_knowledge",
        label: "Reading company knowledge files",
      });
    }
  }

  return {
    conversation,
    prospect,
    company,
    companyId,
    memory,
    message,
    channel,
    system,
    collectionIds,
    knowledgeFileIds,
    mcpConfigs,
    functionTools,
    events,
    userMessageWritten,
  };
}

function userTurnContent(ctx: TurnContext): string {
  return (
    ctx.message +
    (ctx.functionTools.length
      ? `\n\n(If a demo tool would help — create_sandbox, estimate_cost, list_capabilities, generate_config — you may call it. Only claim success if a tool result is present.)`
      : "")
  );
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(raw ?? "{}"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type ToolRun = { name: string; ok: boolean; result: unknown; error?: string };

/**
 * Runs every demo tool the model asked for.
 *
 * Grok routinely emits two or three calls in one turn (a pricing question pulls
 * `estimate_cost` and `list_capabilities` together). Executing them here and
 * feeding all the results into a single continuation is what keeps a multi-tool
 * turn to two model round trips instead of one per tool — the old per-call loop
 * threw away the previous continuation each time and measured 42s on a
 * two-tool turn.
 */
function runFunctionCalls(
  rawOutput: Array<Record<string, unknown>>,
  onToolEvent: (event: AgentEvent) => void,
): ToolRun[] {
  const runs: ToolRun[] = [];
  for (const item of rawOutput) {
    if (item.type !== "function_call" || typeof item.name !== "string") continue;
    const exec = executeDemoTool(item.name, parseToolArgs(item.arguments));
    onToolEvent({ type: "using_tool", label: `Using ${item.name}` });
    runs.push({
      name: item.name,
      ok: exec.ok,
      result: exec.result,
      ...(exec.error ? { error: exec.error } : {}),
    });
  }
  return runs;
}

/**
 * The continuation prompt after tools ran. Carries every result at once so the
 * model writes one grounded answer rather than one answer per tool.
 */
function toolFollowUpMessages(
  ctx: TurnContext,
  draft: string,
  runs: ToolRun[],
): GrokMessage[] {
  const names = runs.map((r) => r.name).join(", ");
  const results = runs
    .map((r) =>
      r.ok
        ? `${r.name} returned: ${JSON.stringify(r.result)}`
        : `${r.name} failed: ${r.error ?? "unknown error"}`,
    )
    .join("\n");

  return [
    { role: "system", content: ctx.system },
    { role: "user", content: ctx.message },
    { role: "assistant", content: draft || `(calling ${names})` },
    {
      role: "user",
      content: `Tool results:\n${results}\n\nContinue as the FDE using these results. Do not invent additional tool outcomes, and do not claim a tool succeeded if it is listed as failed.`,
    },
  ];
}

/** Answer to fall back on when a tool ran but the continuation could not. */
function toolResultFallback(runs: ToolRun[]): string {
  const ok = runs.filter((r) => r.ok);
  if (!ok.length) {
    return `I tried to run ${runs.map((r) => r.name).join(", ")} but it failed: ${
      runs.find((r) => !r.ok)?.error ?? "unknown error"
    }`;
  }
  return ok.map((r) => `Tool ${r.name} succeeded: ${JSON.stringify(r.result)}`).join("\n\n");
}

function recordToolEvents(ctx: TurnContext, toolEvents: AskGrokResult["toolEvents"]) {
  for (const te of toolEvents) {
    if (te.type === "searching_knowledge") {
      ctx.events.push({ type: "searching_knowledge", label: te.label });
    } else if (te.type === "searching_web") {
      ctx.events.push({ type: "searching_web", label: te.label });
    } else if (te.type === "using_tool") {
      ctx.events.push({ type: "using_tool", label: te.label });
    }
  }
}

/**
 * Post-generation work that is identical in both modes: deterministic demo tool
 * application, the empty-answer guard, and escalation creation. Returns the
 * final authoritative text.
 */
async function finishTurn(
  ctx: TurnContext,
  draft: string,
): Promise<{
  content: string;
  escalation?: { id: string; question: string; reason: string; priority: string };
}> {
  let assistantContent = applyDemoSandboxIfNeeded({
    message: ctx.message,
    prospect: ctx.prospect,
    assistantContent: draft,
    functionTools: ctx.functionTools,
    events: ctx.events,
  });

  if (!assistantContent) {
    assistantContent =
      "I want to make sure I answer this accurately. Could you share a bit more about your current stack and what you're trying to accomplish?";
  }

  let escalation:
    | { id: string; question: string; reason: string; priority: string }
    | undefined;

  const mustEscalate =
    isLegalOrExceptionQuestion(ctx.message) ||
    /\b(flag(?:ged)? for|need to verify|cannot confirm|won't invent|do not have.*(docs|documentation))\b/i.test(
      assistantContent,
    );

  if (mustEscalate && isLegalOrExceptionQuestion(ctx.message)) {
    const db = getSupabaseAdmin();
    const reason = "Not confidently answerable from company documentation";
    if (!/flag|human|team|verify|won't invent|cannot/i.test(assistantContent)) {
      assistantContent = `${assistantContent}\n\nI've flagged this for the team so we don't guess on something that needs a definitive company answer.`;
    }

    const { data: esc } = await db
      .from("escalations")
      .insert({
        company_id: ctx.companyId,
        prospect_id: ctx.prospect.id,
        conversation_id: ctx.conversation.id,
        question: ctx.message,
        reason,
        priority: "high",
        status: "open",
        suggested_response: assistantContent.slice(0, 1000),
      })
      .select("id")
      .single();

    if (esc) {
      escalation = { id: esc.id, question: ctx.message, reason, priority: "high" };
      ctx.events.push({ type: "needs_human", label: "Company confirmation required" });
    }
  }

  return { content: assistantContent, escalation };
}

/**
 * Asks a model to fold the latest exchange into the prospect's memory.
 *
 * Tries the fast background model first and the main text model second: an
 * unavailable or renamed background model would otherwise silently demote every
 * prospect to the regex heuristic, which is a quality regression nobody would
 * see until the memory looked thin during a demo.
 */
async function extractMemoryWithGrok(
  ctx: TurnContext,
  assistantContent: string,
): Promise<ProspectMemory> {
  const messages: GrokMessage[] = [
    { role: "system", content: PROSPECT_MEMORY_SYSTEM },
    {
      role: "user",
      content: prospectMemoryUserPrompt({
        existingMemoryJson: JSON.stringify(ctx.memory),
        latestUserMessage: ctx.message,
        latestAssistantMessage: assistantContent,
        channel: ctx.channel,
      }),
    },
  ];

  const models = Array.from(new Set([backgroundModel(), textModel()]));
  let lastError: unknown;

  for (const model of models) {
    try {
      return await askGrokStructured({
        schema: ProspectMemorySchema,
        schemaName: "ProspectMemory",
        model,
        messages,
      });
    } catch (err) {
      lastError = err;
      console.warn(`[chat-agent] memory extraction failed on ${model}`, err);
    }
  }
  throw lastError;
}

/**
 * Prospect-memory extraction. A second full LLM round trip, so the streaming
 * path only ever runs this AFTER the answer has finished reaching the browser.
 */
async function extractProspectMemory(
  ctx: TurnContext,
  assistantContent: string,
): Promise<{ prospect: ProspectRow; event?: AgentEvent }> {
  let memory: ProspectMemory;
  if (process.env.XAI_API_KEY) {
    try {
      memory = await extractMemoryWithGrok(ctx, assistantContent);
    } catch {
      memory = heuristicMemoryUpdate(ctx.memory, ctx.message, assistantContent);
    }
  } else {
    memory = heuristicMemoryUpdate(ctx.memory, ctx.message, assistantContent);
  }

  try {
    return {
      prospect: await updateProspectMemory(ctx.prospect.id, memory),
      event: { type: "prospect_updated", label: "Prospect memory updated" },
    };
  } catch (err) {
    console.warn("[chat-agent] memory persist failed", err);
    return { prospect: ctx.prospect };
  }
}

// ─── Streaming turn ────────────────────────────────────────────────

export type ChatStreamEvent =
  /** Agent activity: knowledge retrieval, tool use, escalation. Deduplicated. */
  | { type: "activity"; event: AgentEvent }
  /** Model reasoning summary, safe to render as a thinking affordance. */
  | { type: "reasoning"; text: string }
  /** Append this text to the answer being rendered. */
  | { type: "delta"; text: string }
  /** Discard everything accumulated and render this instead. */
  | { type: "replace"; text: string }
  | {
      type: "escalation";
      escalation: { id: string; question: string; reason: string; priority: string };
    }
  /** The persisted assistant message. Its content is authoritative. */
  | {
      type: "message";
      message: { id: string; role: "assistant"; content: string; createdAt: string };
      events: AgentEvent[];
    }
  /** Updated prospect memory. Always arrives after `message`. */
  | { type: "memory"; prospect: ChatResponse["prospect"]; events: AgentEvent[] }
  | { type: "error"; code: string; message: string; recoverable: boolean };

function isAbort(err: unknown): boolean {
  return (
    err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")
  );
}

/**
 * Streaming turn. Emits tokens as they arrive and defers prospect-memory
 * extraction until after the answer has fully reached the browser, which is what
 * removes the second blocking LLM round trip from the critical path.
 *
 * The assistant message is written to Supabase exactly once. If generation is
 * aborted mid-stream, whatever was produced is still persisted and flagged
 * `partial` so a dropped connection never loses the turn.
 */
export async function streamChatMessage(args: {
  conversationId: string;
  message: string;
  channel?: "chat" | "email";
  confirmedWriteTools?: string[];
  signal?: AbortSignal;
  emit: (event: ChatStreamEvent) => void;
}): Promise<void> {
  const { emit } = args;
  const ctx = await prepareTurn(args);

  let persisted = false;
  const persistAssistant = async (
    content: string,
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    if (persisted) return;
    persisted = true;
    // Keeps the inbound turn ahead of the reply in created_at order.
    await ctx.userMessageWritten;
    const row = await insertMessage({
      conversationId: ctx.conversation.id,
      channel: ctx.channel,
      role: "assistant",
      content,
      metadata: { events: dedupeEvents(ctx.events), ...extra },
    });
    emit({
      type: "message",
      message: {
        id: row.id,
        role: "assistant",
        content: row.content,
        createdAt: row.created_at,
      },
      events: dedupeEvents(ctx.events),
    });
  };

  // One activity per distinct thing that happened. Without this the same tool
  // surfaces twice — once from the live stream and once from the final result
  // items — and the client renders "Using estimate_cost" back to back.
  const announced = new Set<string>();
  /** Emits an activity the client has not seen yet. Returns whether it was new. */
  const announce = (event: AgentEvent): boolean => {
    const key = `${event.type}:${event.label}`;
    if (announced.has(key)) return false;
    announced.add(key);
    emit({ type: "activity", event });
    return true;
  };
  /** Records an activity on the turn and announces it. */
  const pushEvent = (event: AgentEvent) => {
    if (announce(event)) ctx.events.push(event);
  };

  const seeded = [...ctx.events];
  ctx.events.length = 0;
  for (const event of seeded) pushEvent(event);

  let streamed = "";

  /**
   * Bridges Grok's stream events to client events.
   *
   * `replacesDraft` marks the continuation that runs after tools: it rewrites
   * the whole answer, so the preamble has to go. The swap is held until its
   * first real token, because blanking the panel up front leaves the prospect
   * staring at an empty box for the length of a second generation.
   */
  const forwarder = (replacesDraft = false) => {
    let swapped = !replacesDraft;
    return (event: GrokStreamEvent) => {
      if (event.type === "text") {
        if (!swapped) {
          swapped = true;
          streamed = "";
          emit({ type: "replace", text: "" });
        }
        streamed += event.delta;
        emit({ type: "delta", text: event.delta });
      } else if (event.type === "reasoning") {
        emit({ type: "reasoning", text: event.delta });
      } else if (event.type === "tool") {
        pushEvent({ type: event.toolType as AgentEvent["type"], label: event.label });
      }
    };
  };
  const forward = forwarder();

  let assistantContent = "";
  const offline = !process.env.XAI_API_KEY;

  try {
    if (isLegalOrExceptionQuestion(ctx.message) && offline) {
      assistantContent = legalEscalationReply(ctx.company.name, ctx.company.agent_name);
      emit({ type: "delta", text: assistantContent });
      streamed = assistantContent;
    } else if (!offline) {
      const result = await streamGrok({
        messages: [
          { role: "system", content: ctx.system },
          { role: "user", content: userTurnContent(ctx) },
        ],
        model: chatModel(),
        collectionIds: ctx.collectionIds,
        fileIds: ctx.knowledgeFileIds,
        mcpTools: ctx.mcpConfigs,
        functionTools: ctx.functionTools.length ? ctx.functionTools : undefined,
        temperature: 0.45,
        reasoningEffort: CHAT_REASONING_EFFORT,
        signal: args.signal,
        onEvent: forward,
      });

      assistantContent = result.content;
      for (const te of result.toolEvents) {
        pushEvent({ type: te.type as AgentEvent["type"], label: te.label });
      }

      const rawOutput = (result.raw.output as Array<Record<string, unknown>>) ?? [];
      const runs = runFunctionCalls(rawOutput, pushEvent);

      if (runs.some((r) => r.ok)) {
        // Turn one was a preamble before the tool calls. One continuation covers
        // every result; `forwarder(true)` swaps it in on its first token.
        try {
          const follow = await streamGrok({
            messages: toolFollowUpMessages(ctx, assistantContent, runs),
            model: chatModel(),
            collectionIds: ctx.collectionIds,
            temperature: 0.3,
            reasoningEffort: CHAT_REASONING_EFFORT,
            signal: args.signal,
            onEvent: forwarder(true),
          });
          assistantContent = follow.content || assistantContent;
        } catch (err) {
          if (isAbort(err)) throw err;
          console.error("[chat-agent] tool continuation failed", err);
          assistantContent = toolResultFallback(runs);
        }
      } else if (runs.length) {
        assistantContent = assistantContent || toolResultFallback(runs);
      }
    } else {
      assistantContent = groundedFallback({
        companyName: ctx.company.name,
        agentName: ctx.company.agent_name,
        message: ctx.message,
        memory: ctx.memory,
        knowledge: ctx.company.knowledge_summary_json,
      });
      emit({ type: "delta", text: assistantContent });
      streamed = assistantContent;
    }
  } catch (err) {
    if (isAbort(err)) {
      // Client went away and the grace window expired. Keep the partial answer
      // rather than losing the turn, and mark it so nothing treats it as final.
      await persistAssistant(streamed, { partial: true, stopReason: "aborted" });
      return;
    }
    console.error("[chat-agent] grok stream failed", err);
    assistantContent = groundedFallback({
      companyName: ctx.company.name,
      agentName: ctx.company.agent_name,
      message: ctx.message,
      memory: ctx.memory,
      knowledge: ctx.company.knowledge_summary_json,
    });
    emit({ type: "replace", text: assistantContent });
    streamed = assistantContent;
  }

  const finished = await finishTurn(ctx, assistantContent);

  // `finishTurn` and the sandbox helper append straight to ctx.events. Surface
  // anything they added — escalation especially — as live activity.
  for (const event of ctx.events) announce(event);

  // Demo-tool application and escalation copy can rewrite the answer after the
  // model is done. Reconcile the client with the text we are about to persist.
  if (finished.content !== streamed) {
    emit({ type: "replace", text: finished.content });
  }
  if (finished.escalation) {
    emit({ type: "escalation", escalation: finished.escalation });
  }

  // Started before the write so extraction overlaps the two Supabase round
  // trips instead of queueing behind them. Nothing visible waits on it: the
  // prospect already has the full answer on screen.
  const memoryWork = extractProspectMemory(ctx, finished.content).then(
    ({ prospect, event }) => {
      if (event) ctx.events.push(event);
      return prospect;
    },
  );
  // The race below may never observe this promise; keep a rejection from going
  // unhandled and taking the process with it.
  memoryWork.catch((err) => console.warn("[chat-agent] memory tail failed", err));

  await persistAssistant(finished.content, { escalationId: finished.escalation?.id });

  let budget: ReturnType<typeof setTimeout> | undefined;
  const updatedProspect = await Promise.race([
    memoryWork.catch(() => null),
    new Promise<null>((resolve) => {
      budget = setTimeout(() => resolve(null), MEMORY_STREAM_BUDGET_MS);
    }),
  ]);
  if (budget) clearTimeout(budget);

  if (updatedProspect) {
    emit({
      type: "memory",
      prospect: prospectToChatShape(getProspectMemory(updatedProspect)),
      events: dedupeEvents(ctx.events),
    });
  }
  // Past the budget the write still lands — `after()` in the route keeps this
  // turn alive — and the client picks it up on its next read rather than
  // holding a connection open for it.
}

export async function handleChatMessage(args: {
  conversationId: string;
  message: string;
  channel?: "chat" | "email";
  confirmedWriteTools?: string[];
}): Promise<ChatResponse> {
  const ctx = await prepareTurn(args);
  const { company, message, memory } = ctx;

  let assistantContent = "";

  // Fast offline path for legal: never invent, always escalate-ready copy
  if (isLegalOrExceptionQuestion(message) && !process.env.XAI_API_KEY) {
    assistantContent = legalEscalationReply(company.name, company.agent_name);
  } else if (process.env.XAI_API_KEY) {
    try {
      const result = await askGrok({
        messages: [
          { role: "system", content: ctx.system },
          { role: "user", content: userTurnContent(ctx) },
        ],
        model: chatModel(),
        collectionIds: ctx.collectionIds,
        fileIds: ctx.knowledgeFileIds,
        mcpTools: ctx.mcpConfigs,
        functionTools: ctx.functionTools.length ? ctx.functionTools : undefined,
        temperature: 0.45,
        reasoningEffort: CHAT_REASONING_EFFORT,
      });

      assistantContent = result.content;
      recordToolEvents(ctx, result.toolEvents);

      const rawOutput = (result.raw.output as Array<Record<string, unknown>>) ?? [];
      const runs = runFunctionCalls(rawOutput, (event) => ctx.events.push(event));

      if (runs.some((r) => r.ok)) {
        // One continuation for every tool result, matching the streaming path.
        try {
          const follow = await askGrok({
            messages: toolFollowUpMessages(ctx, assistantContent, runs),
            model: chatModel(),
            collectionIds: ctx.collectionIds,
            temperature: 0.3,
            reasoningEffort: CHAT_REASONING_EFFORT,
          });
          assistantContent = follow.content || assistantContent;
        } catch (err) {
          console.error("[chat-agent] tool continuation failed", err);
          assistantContent = toolResultFallback(runs);
        }
      } else if (runs.length) {
        assistantContent = assistantContent || toolResultFallback(runs);
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

  const finished = await finishTurn(ctx, assistantContent);

  await ctx.userMessageWritten;
  const assistantMessage = await insertMessage({
    conversationId: ctx.conversation.id,
    channel: ctx.channel,
    role: "assistant",
    content: finished.content,
    metadata: { events: ctx.events, escalationId: finished.escalation?.id },
  });

  const { prospect: updatedProspect, event } = await extractProspectMemory(
    ctx,
    finished.content,
  );
  if (event) ctx.events.push(event);

  return {
    message: {
      id: assistantMessage.id,
      role: "assistant",
      content: assistantMessage.content,
      createdAt: assistantMessage.created_at,
    },
    prospect: prospectToChatShape(getProspectMemory(updatedProspect)),
    events: dedupeEvents(ctx.events),
    ...(finished.escalation ? { escalation: finished.escalation } : {}),
  };
}
