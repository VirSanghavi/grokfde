import { z } from "zod";
import { askGrokStructured } from "@/lib/ai/grok";
import {
  ARCHITECTURE_SYSTEM,
  architectureUserPrompt,
} from "@/lib/ai/prompts/architecture";
import { getCompanyById } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { parseKnowledgeSummary } from "@/lib/server/merge";
import {
  getConversationBundle,
  getProspectMemory,
  getRecentMessages,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ArchitectureSchema } from "@/lib/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({
  conversationId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const { conversation, prospect, companyId } = await getConversationBundle(
      body.conversationId,
    );
    const company = await getCompanyById(companyId);
    const memory = getProspectMemory(prospect);
    const recent = await getRecentMessages(conversation.id, 20);
    const knowledge = parseKnowledgeSummary(company.knowledge_summary_json);

    let architecture = await askGrokStructured({
      schema: ArchitectureSchema,
      schemaName: "Architecture",
      messages: [
        { role: "system", content: ARCHITECTURE_SYSTEM },
        {
          role: "user",
          content: architectureUserPrompt({
            companyName: company.name,
            companyKnowledgeJson: JSON.stringify(knowledge),
            prospectMemoryJson: JSON.stringify(memory),
            recentConversation: recent
              .map((m) => `${m.role}: ${m.content}`)
              .join("\n"),
          }),
        },
      ],
    }).catch(() => fallbackArchitecture(company.name, memory.currentStack));

    // Ensure vendor node exists
    if (!architecture.nodes.some((n) => /fde|grok|vendor/i.test(n.id + n.label))) {
      architecture = {
        ...architecture,
        nodes: [
          ...architecture.nodes,
          { id: "grok-fde", label: company.name, type: "product" },
        ],
      };
    }

    const db = getSupabaseAdmin();
    const { data: asset, error } = await db
      .from("generated_assets")
      .insert({
        conversation_id: conversation.id,
        type: "architecture",
        content_json: architecture,
        prompt: `Architecture for ${prospect.company_name || "prospect"} + ${company.name}`,
      })
      .select("*")
      .single();

    if (error || !asset) {
      throw new ApiError("INTERNAL_ERROR", "Could not save architecture", {
        status: 500,
        details: error?.message,
      });
    }

    return jsonOk({
      id: asset.id,
      type: "architecture",
      ...architecture,
      events: [{ type: "generating_image", label: "Architecture generated" }],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid architecture request", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}

function fallbackArchitecture(companyName: string, stack: string[]) {
  const nodes = [
    { id: "prospect-channels", label: "Prospect Chat / Email / Call", type: "channel" },
    { id: "grok-fde", label: companyName, type: "product" },
    { id: "company-knowledge", label: "Company Knowledge (Collections)", type: "knowledge" },
    { id: "mcp-tools", label: "MCP Tools", type: "tools" },
    ...stack.map((s) => ({
      id: s.toLowerCase().replace(/\s+/g, "-"),
      label: s,
      type: "system",
    })),
  ];

  const edges = [
    { source: "prospect-channels", target: "grok-fde", label: "persistent memory" },
    { source: "grok-fde", target: "company-knowledge", label: "search" },
    { source: "grok-fde", target: "mcp-tools", label: "actions" },
    ...stack.map((s) => ({
      source: "grok-fde",
      target: s.toLowerCase().replace(/\s+/g, "-"),
      label: "integrates",
    })),
  ];

  return {
    title: `${stack.join(" + ") || "Prospect"} + ${companyName} Architecture`,
    summary: `${companyName} sits alongside the prospect stack as a persistent FDE layer with knowledge search and optional MCP actions.`,
    nodes,
    edges,
  };
}
