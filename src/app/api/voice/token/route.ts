import { createVoiceClientSecret, voiceModel } from "@/lib/ai/grok";
import { buildVoiceInstructions } from "@/lib/ai/prompts/fde";
import { getCompanyById } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { buildMcpToolConfigs, listEnabledMcpServers } from "@/lib/server/mcp";
import {
  getConversationBundle,
  getProspectMemory,
  getRecentMessages,
} from "@/lib/server/prospect-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues ephemeral voice credentials + full FDE session context.
 * Browser connects directly to the xAI realtime WebSocket, with no audio proxy.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversationId");
    if (!conversationId) {
      throw new ApiError("BAD_REQUEST", "conversationId is required", { status: 400 });
    }

    const { conversation, prospect, companyId } =
      await getConversationBundle(conversationId);
    const company = await getCompanyById(companyId);
    const memory = getProspectMemory(prospect);
    const recent = await getRecentMessages(conversation.id, 12);
    const mcpServers = await listEnabledMcpServers(companyId);
    const mcpConfigs = buildMcpToolConfigs(mcpServers);

    const instructions = buildVoiceInstructions({
      company,
      prospectMemory: memory,
      prospectName: prospect.person_name,
      prospectCompany: prospect.company_name,
      recentMessages: recent.map((m) => ({
        role: m.role,
        content: m.content,
        channel: m.channel,
      })),
    });

    const secret = await createVoiceClientSecret(300);

    /*
     * SECURITY BOUNDARY.
     *
     * This payload is handed to the BROWSER, which owns the realtime socket
     * directly under an ephemeral client secret. Every byte here is readable
     * by anyone who opens devtools on a public prospect page. So a tool
     * definition may never carry a credential.
     *
     * - `file_search` is safe: xAI resolves it server side and the browser
     *   only ever sees a collection id.
     * - An `mcp` tool carrying `authorization` is NOT safe. Sending one would
     *   publish that server's bearer token to every visitor. Those servers are
     *   dropped here rather than downgraded, because stripping the header and
     *   sending it anyway would just produce a tool that always 401s.
     * - Anything privileged is exposed as a `function` tool instead, executed
     *   in the browser against OUR backend, which holds the secrets.
     */
    const tools: Array<Record<string, unknown>> = [];
    const withheldMcpServers: string[] = [];

    if (company.xai_collection_id && !company.xai_collection_id.startsWith("local_")) {
      tools.push({
        type: "file_search",
        vector_store_ids: [company.xai_collection_id],
        max_num_results: 8,
      });
    }

    for (const mcp of mcpConfigs) {
      if (mcp.authorization) {
        withheldMcpServers.push(mcp.server_label);
        continue;
      }
      tools.push({
        type: "mcp",
        server_url: mcp.server_url,
        server_label: mcp.server_label,
        ...(mcp.allowed_tools ? { allowed_tools: mcp.allowed_tools } : {}),
      });
    }

    if (withheldMcpServers.length) {
      console.warn(
        `[voice] withheld ${withheldMcpServers.length} authenticated MCP server(s) from the browser session: ${withheldMcpServers.join(", ")}`,
      );
    }

    /*
     * Executed in the browser, which calls POST /api/email/send. No secret
     * travels with the definition; the recipient is supplied by the visitor
     * out loud, which is exactly when asking for an email address is earned.
     */
    tools.push({
      type: "function",
      name: "email_conversation_summary",
      description:
        "Email the visitor a written summary of this conversation, including the technical specifics discussed and the agreed next step. Only call this after they have said an email address out loud. Confirm the address back to them before calling.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "The email address the visitor gave, exactly as they said it.",
          },
        },
        required: ["to"],
        additionalProperties: false,
      },
    });

    return jsonOk({
      token: secret.value,
      expiresAt: secret.expires_at,
      mock: Boolean(secret.mock),
      model: voiceModel(),
      realtimeUrl: `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(voiceModel())}`,
      // Browser can pass token via sec-websocket-protocol: xai-client-secret.${token}
      websocketProtocols: secret.mock
        ? []
        : [`xai-client-secret.${secret.value}`],
      session: {
        voice: company.agent_voice || "eve",
        instructions,
        turn_detection: {
          type: "server_vad",
          // Verified against the live API. This page gets opened on a phone in
          // a startup office, so the threshold is deliberately high: every
          // false trigger cuts Atlas off mid-sentence.
          threshold: 0.85,
          prefix_padding_ms: 333,
          silence_duration_ms: 500,
        },
        tools,
        // Audio format and transcription are set by the browser client, which
        // pins both directions to 48kHz to avoid resampling.
      },
      context: {
        agentName: company.agent_name,
        companyName: company.name,
        companySlug: company.slug,
        prospect: {
          id: prospect.id,
          companyName: prospect.company_name,
          personName: prospect.person_name,
          stage: memory.stage,
          summary: memory.summary,
          currentStack: memory.currentStack,
          painPoints: memory.painPoints,
          requirements: memory.requirements,
          objections: memory.objections,
          unresolvedQuestions: memory.unresolvedQuestions,
          nextAction: memory.nextAction,
        },
        collectionId: company.xai_collection_id,
        recentMessageCount: recent.length,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  // Allow POST with body for clients that prefer it
  try {
    const body = (await req.json()) as { conversationId?: string };
    if (!body.conversationId) {
      throw new ApiError("BAD_REQUEST", "conversationId is required", { status: 400 });
    }
    const url = new URL(req.url);
    url.searchParams.set("conversationId", body.conversationId);
    return GET(new Request(url.toString(), { method: "GET" }));
  } catch (err) {
    return errorResponse(err);
  }
}
