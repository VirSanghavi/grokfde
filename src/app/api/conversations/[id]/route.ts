import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import {
  getConversationBundle,
  getProspectMemory,
  getRecentMessages,
  prospectToChatShape,
} from "@/lib/server/prospect-context";
import { getCompanyById, companyPublic } from "@/lib/server/company-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const { conversation, prospect, companyId } = await getConversationBundle(id);
    const company = await getCompanyById(companyId);
    const messages = await getRecentMessages(id, 100);
    const memory = getProspectMemory(prospect);

    return jsonOk({
      conversation: {
        id: conversation.id,
        companyId: conversation.company_id,
        prospectId: conversation.prospect_id,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      },
      company: companyPublic(company),
      prospect: {
        id: prospect.id,
        companyName: prospect.company_name,
        personName: prospect.person_name,
        email: prospect.email,
        ...prospectToChatShape(memory),
        memory,
      },
      messages: messages.map((m) => ({
        id: m.id,
        channel: m.channel,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        metadata: m.metadata_json,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
