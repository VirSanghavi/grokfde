import { z } from "zod";
import { askGrok } from "@/lib/ai/grok";
import { buildFdeSystemPrompt } from "@/lib/ai/prompts/fde";
import { getCompanyById } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import {
  getConversationBundle,
  getProspectMemory,
  getRecentMessages,
  insertMessage,
} from "@/lib/server/prospect-context";
import { sendEmail } from "@/lib/email/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  conversationId: z.string().uuid(),
  to: z.string().email().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  generate: z.boolean().optional(),
  instruction: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const { conversation, prospect, companyId } = await getConversationBundle(
      body.conversationId,
    );
    const company = await getCompanyById(companyId);
    const memory = getProspectMemory(prospect);
    const recent = await getRecentMessages(conversation.id, 12);

    const to = body.to || prospect.email;
    if (!to) {
      throw new ApiError("BAD_REQUEST", "No recipient email on prospect; pass `to`", {
        status: 400,
      });
    }

    let emailBody = body.body;
    let subject = body.subject || `Follow-up from ${company.agent_name} at ${company.name}`;

    if (body.generate || !emailBody) {
      const system = buildFdeSystemPrompt({
        company,
        prospectMemory: memory,
        prospectName: prospect.person_name,
        prospectCompany: prospect.company_name,
        channel: "email",
        recentMessages: recent.map((m) => ({
          role: m.role,
          content: m.content,
          channel: m.channel,
        })),
      });

      const result = await askGrok({
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Draft a concise follow-up email to the prospect. ${
              body.instruction || "Continue the technical conversation helpfully."
            }\nReturn plain email body only (no subject line).`,
          },
        ],
        temperature: 0.4,
      });
      emailBody = result.content;
    }

    const signature =
      company.agent_email_signature ||
      `\n\n— ${company.agent_name}\nForward-Deployed Engineer, ${company.name}`;

    const fullBody = `${emailBody}${signature}`;

    const sent = await sendEmail({
      to,
      subject,
      text: fullBody,
    });

    const msg = await insertMessage({
      conversationId: conversation.id,
      channel: "email",
      role: "assistant",
      content: fullBody,
      metadata: { subject, to, providerId: sent.id, provider: sent.provider },
    });

    return jsonOk({
      email: {
        id: msg.id,
        to,
        subject,
        provider: sent.provider,
        providerId: sent.id,
      },
      message: {
        id: msg.id,
        role: "assistant",
        content: fullBody,
        createdAt: msg.created_at,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid email send payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
