import { z } from "zod";
import { ApiError } from "@/lib/server/errors";

const XAI_BASE = "https://api.x.ai/v1";
const XAI_MGMT = "https://management-api.x.ai/v1";

export type GrokMessage = {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
};

export type McpToolConfig = {
  server_url: string;
  server_label: string;
  server_description?: string;
  authorization?: string;
  allowed_tools?: string[];
};

export type FunctionToolConfig = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

function apiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new ApiError("XAI_ERROR", "XAI_API_KEY is not configured", {
      status: 500,
      recoverable: false,
    });
  }
  return key;
}

function managementKey(): string | null {
  return process.env.XAI_MANAGEMENT_API_KEY ?? null;
}

export function textModel(): string {
  return process.env.XAI_TEXT_MODEL || "grok-4.5";
}

/**
 * Model for the visible chat answer.
 *
 * Defaults to the main text model. Measured against the live API, grok-4.5
 * spends ~4s reasoning before its first visible character and that floor does
 * not move with `reasoning_effort` ("low" 4.2s / 4.9s, "minimal" 4.8s / 4.1s
 * across two runs). `grok-4.20-0309-non-reasoning` produces its first token in
 * ~0.55s. Set `XAI_CHAT_MODEL` to trade reasoning depth for a near-instant
 * cursor when a human is watching the panel.
 */
export function chatModel(): string {
  return process.env.XAI_CHAT_MODEL || textModel();
}

/**
 * Model for background structured extraction (prospect memory).
 *
 * Measured on the real extraction prompt: grok-4.5 9.5s, grok-4.3 7.4s,
 * grok-4.20-0309-non-reasoning 2.5s — all three returning valid JSON, and the
 * non-reasoning model matching grok-4.5's stack extraction exactly. Reasoning
 * buys nothing on a copy-fields-into-a-schema task, so this path does not pay
 * for it. Override with `XAI_BACKGROUND_MODEL`.
 */
export function backgroundModel(): string {
  return process.env.XAI_BACKGROUND_MODEL || "grok-4.20-0309-non-reasoning";
}

export function voiceModel(): string {
  return process.env.XAI_VOICE_MODEL || "grok-voice-latest";
}

export function imageModel(): string {
  return process.env.XAI_IMAGE_MODEL || "grok-imagine-image";
}

export function videoModel(): string {
  return process.env.XAI_VIDEO_MODEL || "grok-imagine-video";
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function xaiFetch(
  path: string,
  init: RequestInit & { base?: "api" | "mgmt" } = {},
): Promise<Response> {
  const base = init.base === "mgmt" ? XAI_MGMT : XAI_BASE;
  const key = init.base === "mgmt" ? managementKey() : apiKey();
  if (!key) {
    throw new ApiError(
      "XAI_ERROR",
      init.base === "mgmt"
        ? "XAI_MANAGEMENT_API_KEY is required for Collections"
        : "XAI_API_KEY is not configured",
      { status: 500, recoverable: false },
    );
  }

  const { base: _b, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${key}`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base}${path}`, { ...rest, headers });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`xAI ${res.status}: ${await res.text()}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      await sleep(400 * (attempt + 1));
    }
  }
  throw new ApiError("XAI_ERROR", "xAI request failed after retry", {
    status: 502,
    details: lastError instanceof Error ? lastError.message : lastError,
  });
}

function extractOutputText(data: Record<string, unknown>): string {
  // Responses API shape
  if (typeof data.output_text === "string" && data.output_text) {
    return data.output_text;
  }

  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const item of output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content as Array<Record<string, unknown>>) {
          if (c.type === "output_text" && typeof c.text === "string") {
            texts.push(c.text);
          }
        }
      }
    }
    if (texts.length) return texts.join("\n");
  }

  // Chat completions shape
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices) && choices[0]) {
    const msg = choices[0].message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string") return msg.content;
  }

  return "";
}

function extractToolEvents(data: Record<string, unknown>): Array<{
  type: string;
  name?: string;
  label: string;
}> {
  const events: Array<{ type: string; name?: string; label: string }> = [];
  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(output)) return events;

  for (const item of output) {
    if (item.type === "file_search_call" || item.type === "file_search") {
      events.push({ type: "searching_knowledge", label: "Searching company knowledge" });
    }
    if (item.type === "web_search_call" || item.type === "web_search") {
      events.push({ type: "searching_web", label: "Searching the web" });
    }
    if (item.type === "mcp_call" || item.type === "mcp_tool_call") {
      const name = String(item.name ?? item.tool_name ?? "tool");
      events.push({ type: "using_tool", name, label: `Using ${name}` });
    }
    if (item.type === "function_call") {
      const name = String(item.name ?? "tool");
      events.push({ type: "using_tool", name, label: `Using ${name}` });
    }
  }
  return events;
}

/**
 * Grok 4.5 burns reasoning tokens before it emits a single visible character.
 * At the default effort that is ~5s of dead air; at "low" it is ~1.2s. Chat is
 * the one surface where a human is watching the cursor, so it asks for "low".
 */
export type ReasoningEffort = "low" | "high";

export type AskGrokOptions = {
  messages: GrokMessage[];
  model?: string;
  temperature?: number;
  /** xAI Collections IDs for file_search tool */
  collectionIds?: string[];
  /** Uploaded xAI file IDs attached to the latest user turn (attachment_search) */
  fileIds?: string[];
  mcpTools?: McpToolConfig[];
  functionTools?: FunctionToolConfig[];
  enableWebSearch?: boolean;
  maxOutputTokens?: number;
  reasoningEffort?: ReasoningEffort;
};

export type AskGrokResult = {
  content: string;
  raw: Record<string, unknown>;
  toolEvents: Array<{ type: string; name?: string; label: string }>;
};

/**
 * Builds the Responses API payload. Shared verbatim by the blocking and streaming
 * paths so knowledge, MCP, and function tools behave identically in both.
 */
function buildResponsesBody(options: AskGrokOptions): Record<string, unknown> {
  const tools: Array<Record<string, unknown>> = [];

  if (options.collectionIds?.length) {
    tools.push({
      type: "file_search",
      vector_store_ids: options.collectionIds,
      max_num_results: 8,
    });
  }

  if (options.enableWebSearch) {
    tools.push({ type: "web_search" });
  }

  for (const mcp of options.mcpTools ?? []) {
    tools.push({
      type: "mcp",
      server_url: mcp.server_url,
      server_label: mcp.server_label,
      ...(mcp.server_description ? { server_description: mcp.server_description } : {}),
      ...(mcp.authorization ? { authorization: mcp.authorization } : {}),
      ...(mcp.allowed_tools?.length ? { allowed_tools: mcp.allowed_tools } : {}),
    });
  }

  for (const fn of options.functionTools ?? []) {
    tools.push({
      type: "function",
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    });
  }

  const fileIds = (options.fileIds ?? []).filter(Boolean).slice(0, 10);

  const input = options.messages.map((m, idx) => {
    const role = m.role === "developer" ? "system" : m.role;
    const isLastUser =
      role === "user" && idx === options.messages.length - 1 && fileIds.length > 0;

    if (!isLastUser) {
      return { role, content: m.content };
    }

    // Attach knowledge files so Grok can search them without a Collection
    return {
      role,
      content: [
        { type: "input_text", text: m.content },
        ...fileIds.map((file_id) => ({ type: "input_file", file_id })),
      ],
    };
  });

  const body: Record<string, unknown> = {
    model: options.model ?? textModel(),
    input,
    temperature: options.temperature ?? 0.4,
  };

  if (tools.length) body.tools = tools;
  if (options.maxOutputTokens) body.max_output_tokens = options.maxOutputTokens;
  if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;

  return body;
}

/**
 * Primary Grok call via Responses API with optional knowledge + MCP + functions.
 */
export async function askGrok(options: AskGrokOptions): Promise<AskGrokResult> {
  const body = buildResponsesBody(options);

  const res = await xaiFetch("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Fallback to chat completions if responses fails
    const errText = await res.text();
    if (res.status === 404 || res.status === 400) {
      return askGrokChatCompletions(options, errText);
    }
    throw new ApiError("XAI_ERROR", `Grok request failed: ${res.status}`, {
      status: 502,
      details: errText.slice(0, 800),
    });
  }

  const data = (await res.json()) as Record<string, unknown>;
  const content = extractOutputText(data);
  return {
    content: content.trim(),
    raw: data,
    toolEvents: extractToolEvents(data),
  };
}

async function askGrokChatCompletions(
  options: AskGrokOptions,
  priorError?: string,
): Promise<AskGrokResult> {
  const messages = options.messages.map((m) => ({
    role: m.role === "developer" ? "system" : m.role,
    content: m.content,
  }));

  const res = await xaiFetch("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model ?? textModel(),
      messages,
      temperature: options.temperature ?? 0.4,
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ApiError("XAI_ERROR", `Grok chat failed: ${res.status}`, {
      status: 502,
      details: { responsesError: priorError, chatError: errText.slice(0, 800) },
    });
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    content: extractOutputText(data).trim(),
    raw: data,
    toolEvents: [],
  };
}

// ─── Streaming ─────────────────────────────────────────────────────

export type GrokStreamEvent =
  /** A visible token delta. Append to the rendered answer. */
  | { type: "text"; delta: string }
  /** Model reasoning summary. Useful as an "Atlas is thinking" affordance. */
  | { type: "reasoning"; delta: string }
  /** Knowledge retrieval / web search / MCP call observed mid-generation. */
  | { type: "tool"; toolType: string; name?: string; label: string }
  /** A function tool the model wants executed, with complete JSON arguments. */
  | { type: "function_call"; name: string; arguments: string; callId?: string };

export type StreamGrokOptions = AskGrokOptions & {
  signal?: AbortSignal;
  onEvent?: (event: GrokStreamEvent) => void;
};

/**
 * Parses a `text/event-stream` body into complete SSE blocks.
 *
 * Network reads split wherever TCP feels like it, so a single `data:` line
 * routinely arrives across two or three chunks. Everything is buffered until a
 * real newline shows up, and the decoder runs in streaming mode so a multi-byte
 * UTF-8 character straddling a chunk boundary is not corrupted.
 */
async function* sseBlocks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string | null; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | null = null;
  let dataLines: string[] = [];

  const flush = (): { event: string | null; data: string } | null => {
    if (!dataLines.length) {
      event = null;
      return null;
    }
    const block = { event, data: dataLines.join("\n") };
    event = null;
    dataLines = [];
    return block;
  };

  const consumeLine = (raw: string) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith(":")) return; // keepalive comment
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const raw = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (raw === "" || raw === "\r") {
          const block = flush();
          if (block) yield block;
          continue;
        }
        consumeLine(raw);
      }
    }

    buffer += decoder.decode();
    if (buffer.length) consumeLine(buffer);
    const tail = flush();
    if (tail) yield tail;
  } finally {
    // Releases the upstream socket on early exit (abort, client disconnect,
    // or a `break` from the consumer) instead of leaking the connection.
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
}

function streamErrorFrom(payload: Record<string, unknown>): string | null {
  const err = payload.error;
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    return String(e.message ?? e.code ?? JSON.stringify(e));
  }
  return "Unknown upstream error";
}

/**
 * Streaming counterpart to {@link askGrok}, over the Responses API.
 *
 * The Responses API is the only xAI surface that accepts `input_file`
 * attachments and `mcp` tools, so streaming through it is what keeps knowledge
 * retrieval and tool calls working. Falls back to the OpenAI-compatible
 * `/chat/completions` stream when Responses rejects the request, mirroring the
 * fallback `askGrok` already performs.
 *
 * Resolves to the same {@link AskGrokResult} shape the blocking path returns,
 * with `raw.output` reconstructed from the streamed items, so every downstream
 * consumer keeps working unchanged.
 */
export async function streamGrok(options: StreamGrokOptions): Promise<AskGrokResult> {
  const body = { ...buildResponsesBody(options), stream: true };

  const res = await fetch(`${XAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    if (res.status === 404 || res.status === 400) {
      return streamGrokChatCompletions(options, errText);
    }
    throw new ApiError("XAI_ERROR", `Grok stream failed: ${res.status}`, {
      status: 502,
      details: errText.slice(0, 800),
    });
  }

  const emit = options.onEvent ?? (() => {});
  const chunks: string[] = [];
  const output: Array<Record<string, unknown>> = [];
  const toolEvents: AskGrokResult["toolEvents"] = [];
  let raw: Record<string, unknown> = {};

  for await (const block of sseBlocks(res.body)) {
    if (block.data === "[DONE]") break;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(block.data) as Record<string, unknown>;
    } catch {
      continue; // a non-JSON frame is not worth killing a live answer over
    }

    const kind = String(payload.type ?? block.event ?? "");

    // An error can arrive after a 200 and after tokens have already flowed.
    if (kind === "error" || kind === "response.failed" || payload.error) {
      const message = streamErrorFrom(payload) ?? "Grok stream reported an error";
      throw new ApiError("XAI_ERROR", `Grok stream error: ${message}`, {
        status: 502,
        details: message.slice(0, 800),
      });
    }

    if (kind === "response.output_text.delta") {
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (delta) {
        chunks.push(delta);
        emit({ type: "text", delta });
      }
      continue;
    }

    if (kind === "response.reasoning_summary_text.delta") {
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (delta) emit({ type: "reasoning", delta });
      continue;
    }

    if (kind === "response.output_item.done") {
      const item = payload.item as Record<string, unknown> | undefined;
      if (!item) continue;
      output.push(item);

      const itemType = String(item.type ?? "");
      if (itemType === "file_search_call" || itemType === "file_search") {
        const ev = { type: "searching_knowledge", label: "Searching company knowledge" };
        toolEvents.push(ev);
        emit({ type: "tool", toolType: ev.type, label: ev.label });
      } else if (itemType === "web_search_call" || itemType === "web_search") {
        const ev = { type: "searching_web", label: "Searching the web" };
        toolEvents.push(ev);
        emit({ type: "tool", toolType: ev.type, label: ev.label });
      } else if (itemType === "mcp_call" || itemType === "mcp_tool_call") {
        const name = String(item.name ?? item.tool_name ?? "tool");
        const ev = { type: "using_tool", name, label: `Using ${name}` };
        toolEvents.push(ev);
        emit({ type: "tool", toolType: ev.type, name, label: ev.label });
      } else if (itemType === "function_call") {
        const name = String(item.name ?? "tool");
        const args = String(item.arguments ?? "{}");
        const ev = { type: "using_tool", name, label: `Using ${name}` };
        toolEvents.push(ev);
        emit({ type: "tool", toolType: ev.type, name, label: ev.label });
        emit({
          type: "function_call",
          name,
          arguments: args,
          callId: item.call_id ? String(item.call_id) : undefined,
        });
      }
      continue;
    }

    if (kind === "response.completed" && payload.response) {
      raw = payload.response as Record<string, unknown>;
    }
  }

  // Downstream code reads `raw.output` to find function calls. Rebuild it from
  // the streamed items so the blocking and streaming paths look identical.
  raw = { ...raw, output };

  return { content: chunks.join("").trim(), raw, toolEvents };
}

/**
 * OpenAI-compatible `/chat/completions` SSE stream.
 *
 * Used as the fallback when the Responses API rejects a request. Knowledge
 * attachments and MCP tools are not expressible here, so this path is text plus
 * function tools only.
 */
async function streamGrokChatCompletions(
  options: StreamGrokOptions,
  priorError?: string,
): Promise<AskGrokResult> {
  const messages = options.messages.map((m) => ({
    role: m.role === "developer" ? "system" : m.role,
    content: m.content,
  }));

  const tools = (options.functionTools ?? []).map((fn) => ({
    type: "function",
    function: { name: fn.name, description: fn.description, parameters: fn.parameters },
  }));

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: options.model ?? textModel(),
      messages,
      temperature: options.temperature ?? 0.4,
      stream: true,
      ...(tools.length ? { tools } : {}),
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    }),
    signal: options.signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new ApiError("XAI_ERROR", `Grok chat stream failed: ${res.status}`, {
      status: 502,
      details: { responsesError: priorError, chatError: errText.slice(0, 800) },
    });
  }

  const emit = options.onEvent ?? (() => {});
  const chunks: string[] = [];
  const toolEvents: AskGrokResult["toolEvents"] = [];
  // tool_calls stream in fragments keyed by index; assemble before executing.
  const pending = new Map<number, { id?: string; name: string; args: string }>();

  for await (const block of sseBlocks(res.body)) {
    if (block.data === "[DONE]") break;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(block.data) as Record<string, unknown>;
    } catch {
      continue;
    }

    const errMessage = streamErrorFrom(payload);
    if (errMessage) {
      throw new ApiError("XAI_ERROR", `Grok chat stream error: ${errMessage}`, {
        status: 502,
        details: errMessage.slice(0, 800),
      });
    }

    const choice = (payload.choices as Array<Record<string, unknown>> | undefined)?.[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (!delta) continue;

    if (typeof delta.content === "string" && delta.content) {
      chunks.push(delta.content);
      emit({ type: "text", delta: delta.content });
    }

    if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
      emit({ type: "reasoning", delta: delta.reasoning_content });
    }

    for (const call of (delta.tool_calls as Array<Record<string, unknown>>) ?? []) {
      const index = Number(call.index ?? 0);
      const fn = call.function as Record<string, unknown> | undefined;
      const entry = pending.get(index) ?? { name: "", args: "" };
      if (call.id) entry.id = String(call.id);
      if (fn?.name) entry.name = String(fn.name);
      if (typeof fn?.arguments === "string") entry.args += fn.arguments;
      pending.set(index, entry);
    }
  }

  const output: Array<Record<string, unknown>> = [];
  for (const entry of pending.values()) {
    if (!entry.name) continue;
    output.push({
      type: "function_call",
      name: entry.name,
      arguments: entry.args || "{}",
      ...(entry.id ? { call_id: entry.id } : {}),
    });
    const ev = { type: "using_tool", name: entry.name, label: `Using ${entry.name}` };
    toolEvents.push(ev);
    emit({ type: "tool", toolType: ev.type, name: entry.name, label: ev.label });
    emit({ type: "function_call", name: entry.name, arguments: entry.args || "{}", callId: entry.id });
  }

  return { content: chunks.join("").trim(), raw: { output }, toolEvents };
}

export async function askGrokWithKnowledge(
  options: AskGrokOptions & { collectionIds: string[] },
): Promise<AskGrokResult> {
  return askGrok(options);
}

export async function askGrokWithTools(
  options: AskGrokOptions & { mcpTools?: McpToolConfig[]; functionTools?: FunctionToolConfig[] },
): Promise<AskGrokResult> {
  return askGrok(options);
}

/**
 * Structured JSON output via Grok + Zod validation.
 */
export async function askGrokStructured<T>(
  options: AskGrokOptions & {
    schema: z.ZodType<T>;
    schemaName?: string;
  },
): Promise<T> {
  const schemaHint = JSON.stringify(
    // lightweight hint — model returns pure JSON
    { note: "Return only valid JSON matching the requested schema. No markdown." },
  );

  const messages: GrokMessage[] = [
    ...options.messages,
    {
      role: "user",
      content: `Respond with ONLY a single JSON object (no markdown fences). Schema name: ${options.schemaName ?? "result"}. ${schemaHint}`,
    },
  ];

  // Prefer chat completions with json_object response format for reliability
  const res = await xaiFetch("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model ?? textModel(),
      messages: messages.map((m) => ({
        role: m.role === "developer" ? "system" : m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.2,
      response_format: { type: "json_object" },
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    }),
  });

  if (!res.ok) {
    // Fallback without response_format
    const fallback = await askGrok({ ...options, messages, temperature: 0.2 });
    return parseJsonWithSchema(fallback.content, options.schema);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const content = extractOutputText(data);
  return parseJsonWithSchema(content, options.schema);
}

function parseJsonWithSchema<T>(content: string, schema: z.ZodType<T>): T {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new ApiError("XAI_ERROR", "Grok did not return valid JSON", {
        status: 502,
        details: content.slice(0, 400),
      });
    }
    parsed = JSON.parse(match[0]);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError("XAI_ERROR", "Grok JSON failed schema validation", {
      status: 502,
      details: result.error.flatten(),
    });
  }
  return result.data;
}

// ─── Files & Collections ───────────────────────────────────────────

export async function createCollection(name: string): Promise<{ collectionId: string }> {
  if (!managementKey()) {
    // Graceful degradation: local-only collection id (knowledge still in summary + files)
    return { collectionId: `local_${crypto.randomUUID()}` };
  }

  try {
    const res = await xaiFetch("/collections", {
      method: "POST",
      base: "mgmt",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection_name: name }),
    });

    if (!res.ok) {
      const text = await res.text();
      // Invalid management keys are common in hackathon setups — degrade, don't hard-fail company create
      console.warn("[xai] collection create failed", text.slice(0, 300));
      return { collectionId: `local_${crypto.randomUUID()}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const collectionId = String(
      data.collection_id ?? data.id ?? data.collectionId ?? "",
    );
    if (!collectionId) {
      return { collectionId: `local_${crypto.randomUUID()}` };
    }
    return { collectionId };
  } catch (err) {
    console.warn("[xai] collection create error; using local id", err);
    return { collectionId: `local_${crypto.randomUUID()}` };
  }
}

export async function uploadFileToXai(
  content: Buffer | Uint8Array | string,
  filename: string,
  contentType = "text/plain",
): Promise<{ fileId: string; filename: string }> {
  const raw =
    typeof content === "string"
      ? new TextEncoder().encode(content)
      : Buffer.isBuffer(content)
        ? content
        : Buffer.from(content);
  // Copy into a standalone ArrayBuffer for Blob typing compatibility
  const ab = new ArrayBuffer(raw.byteLength);
  new Uint8Array(ab).set(raw);

  const form = new FormData();
  form.append("purpose", "assistants");
  form.append("file", new Blob([ab], { type: contentType }), filename);

  const res = await xaiFetch("/files", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError("XAI_ERROR", `File upload failed: ${res.status}`, {
      status: 502,
      details: text.slice(0, 500),
    });
  }

  const data = (await res.json()) as Record<string, unknown>;
  const fileId = String(data.id ?? "");
  if (!fileId) {
    throw new ApiError("XAI_ERROR", "File upload returned no id", {
      status: 502,
      details: data,
    });
  }
  return { fileId, filename: String(data.filename ?? filename) };
}

export async function addFileToCollection(
  collectionId: string,
  fileId: string,
): Promise<void> {
  if (!managementKey() || collectionId.startsWith("local_")) {
    return;
  }

  const res = await xaiFetch(`/collections/${collectionId}/documents/${fileId}`, {
    method: "POST",
    base: "mgmt",
  });

  if (!res.ok) {
    const text = await res.text();
    // Non-fatal if file is still usable via attachment; log and continue
    console.warn("[xai] addFileToCollection failed", collectionId, fileId, text.slice(0, 300));
  }
}

export async function searchCollection(
  collectionId: string,
  query: string,
): Promise<unknown> {
  if (collectionId.startsWith("local_")) return { matches: [] };

  const res = await xaiFetch("/documents/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      source: { collection_ids: [collectionId] },
      retrieval_mode: { type: "hybrid" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn("[xai] collection search failed", text.slice(0, 300));
    return { matches: [] };
  }
  return res.json();
}

// ─── Voice ─────────────────────────────────────────────────────────

export async function createVoiceClientSecret(expiresSeconds = 300): Promise<{
  value: string;
  expires_at?: number;
  mock?: boolean;
}> {
  if (!process.env.XAI_API_KEY) {
    return {
      value: `mock_voice_${crypto.randomUUID()}`,
      expires_at: Math.floor(Date.now() / 1000) + expiresSeconds,
      mock: true,
    };
  }

  const res = await xaiFetch("/realtime/client_secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { seconds: expiresSeconds },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError("VOICE_TOKEN_FAILED", "Could not create voice session token", {
      status: 502,
      details: text.slice(0, 500),
    });
  }

  const data = (await res.json()) as Record<string, unknown>;
  const value = String(
    data.value ??
      (data.client_secret as Record<string, unknown> | undefined)?.value ??
      data.secret ??
      "",
  );
  if (!value) {
    throw new ApiError("VOICE_TOKEN_FAILED", "Voice token response missing value", {
      status: 502,
      details: data,
    });
  }
  return {
    value,
    expires_at:
      typeof data.expires_at === "number"
        ? data.expires_at
        : typeof (data.client_secret as Record<string, unknown> | undefined)?.expires_at ===
            "number"
          ? ((data.client_secret as Record<string, unknown>).expires_at as number)
          : undefined,
  };
}

// ─── Imagine ───────────────────────────────────────────────────────

export async function generateImage(
  prompt: string,
): Promise<{ url?: string; b64?: string; raw: unknown }> {
  // Try OpenAI-compatible images endpoint first
  const res = await xaiFetch("/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      n: 1,
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError("XAI_ERROR", `Image generation failed: ${res.status}`, {
      status: 502,
      details: text.slice(0, 500),
    });
  }

  const data = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const first = data.data?.[0];
  return {
    url: first?.url,
    b64: first?.b64_json,
    raw: data,
  };
}

export async function generateVideo(
  prompt: string,
): Promise<{ url?: string; raw: unknown }> {
  const res = await xaiFetch("/videos/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: videoModel(),
      prompt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError("XAI_ERROR", `Video generation failed: ${res.status}`, {
      status: 502,
      details: text.slice(0, 500),
      recoverable: true,
    });
  }

  const data = (await res.json()) as {
    data?: Array<{ url?: string }>;
    url?: string;
  };
  return {
    url: data.data?.[0]?.url ?? data.url,
    raw: data,
  };
}
