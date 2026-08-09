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

export function voiceModel(): string {
  return process.env.XAI_VOICE_MODEL || "grok-voice-latest";
}

export function imageModel(): string {
  return process.env.XAI_IMAGE_MODEL || "grok-imagine-image";
}

export function videoModel(): string {
  return process.env.XAI_VIDEO_MODEL || "grok-imagine-video-1.5";
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
};

export type AskGrokResult = {
  content: string;
  raw: Record<string, unknown>;
  toolEvents: Array<{ type: string; name?: string; label: string }>;
};

/**
 * Primary Grok call via Responses API with optional knowledge + MCP + functions.
 */
export async function askGrok(options: AskGrokOptions): Promise<AskGrokResult> {
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

export type VideoOptions = {
  /** Image-to-video: animate this still instead of inventing a new subject. */
  image?: string;
  /** 1–15 seconds. */
  duration?: number;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
  resolution?: "480p" | "720p" | "1080p";
};

export type VideoJob = {
  status: "pending" | "done" | "expired" | "failed";
  url?: string;
  durationSeconds?: number;
};

/**
 * Video generation is asynchronous: this returns a request id, not a video.
 * Poll it with getVideo(). Generation can take several minutes, so callers
 * must not block a user-facing request on completion.
 */
export async function submitVideo(
  prompt: string,
  opts: VideoOptions = {},
): Promise<string> {
  const res = await xaiFetch("/videos/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: videoModel(),
      prompt,
      ...(opts.image ? { image: opts.image } : {}),
      ...(opts.duration ? { duration: opts.duration } : {}),
      ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
      ...(opts.resolution ? { resolution: opts.resolution } : {}),
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

  const data = (await res.json()) as { request_id?: string };
  if (!data.request_id) {
    throw new ApiError("XAI_ERROR", "Video generation returned no request_id", {
      status: 502,
      recoverable: true,
    });
  }
  return data.request_id;
}

/** Check a submitted video job. Returns status "pending" until it is ready. */
export async function getVideo(requestId: string): Promise<VideoJob> {
  const res = await xaiFetch(`/videos/${encodeURIComponent(requestId)}`);

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError("XAI_ERROR", `Video lookup failed: ${res.status}`, {
      status: 502,
      details: text.slice(0, 500),
      recoverable: true,
    });
  }

  const data = (await res.json()) as {
    status?: VideoJob["status"];
    video?: { url?: string; duration?: number };
  };
  return {
    status: data.status ?? "pending",
    url: data.video?.url,
    durationSeconds: data.video?.duration,
  };
}

/**
 * Submit and wait. Only for background work — the default budget is well past
 * any request timeout. Returns undefined if it is still pending when we give up.
 */
export async function generateVideo(
  prompt: string,
  opts: VideoOptions & { maxWaitMs?: number; pollMs?: number } = {},
): Promise<{ url?: string; requestId: string; status: VideoJob["status"] }> {
  const { maxWaitMs = 240_000, pollMs = 5_000, ...videoOpts } = opts;
  const requestId = await submitVideo(prompt, videoOpts);

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const job = await getVideo(requestId);
    if (job.status === "done") return { url: job.url, requestId, status: job.status };
    if (job.status === "failed" || job.status === "expired") {
      return { requestId, status: job.status };
    }
  }
  return { requestId, status: "pending" };
}
