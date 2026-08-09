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
 * Browser connects directly to xAI realtime WebSocket — no audio proxy.
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
    const memory = getProspectMemory(prospect);

    // These four are independent — serialising them added round-trips to every
    // call connect for no reason.
    const [company, recent, mcpServers, secret] = await Promise.all([
      getCompanyById(companyId),
      getRecentMessages(conversation.id, 12),
      listEnabledMcpServers(companyId),
      createVoiceClientSecret(300),
    ]);
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

    const tools: Array<Record<string, unknown>> = [];
    if (company.xai_collection_id && !company.xai_collection_id.startsWith("local_")) {
      tools.push({
        type: "file_search",
        vector_store_ids: [company.xai_collection_id],
        max_num_results: 8,
      });
    }
    for (const mcp of mcpConfigs) {
      tools.push({
        type: "mcp",
        server_url: mcp.server_url,
        server_label: mcp.server_label,
        ...(mcp.authorization ? { authorization: mcp.authorization } : {}),
        ...(mcp.allowed_tools ? { allowed_tools: mcp.allowed_tools } : {}),
      });
    }

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
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools,
        // Enable user speech transcripts in the browser client
        input_audio_transcription: { model: "whisper-1" },
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
