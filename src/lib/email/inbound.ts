import { handleChatMessage } from "@/lib/server/chat-agent";
import { getCompanyById, getCompanyBySlug } from "@/lib/server/company-context";
import { ApiError } from "@/lib/server/errors";
import {
  createConversation,
  createProspect,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sendEmail } from "./outbound";

export async function processInboundEmail(args: {
  to: string;
  from: string;
  subject?: string;
  text: string;
  companyId?: string;
  companySlug?: string;
}): Promise<{
  conversationId: string;
  messageId: string;
  replyPreview: string;
}> {
  const db = getSupabaseAdmin();

  let companyId = args.companyId;
  if (!companyId && args.companySlug) {
    companyId = (await getCompanyBySlug(args.companySlug)).id;
  }
  if (!companyId) {
    // Parse slug from address like atlas@fde.example.com or fde+slug@...
    const local = args.to.split("@")[0] ?? "";
    const plus = local.split("+")[1];
    if (plus) {
      try {
        companyId = (await getCompanyBySlug(plus)).id;
      } catch {
        /* continue */
      }
    }
  }
  if (!companyId) {
    throw new ApiError("BAD_REQUEST", "Could not resolve company for inbound email", {
      status: 400,
    });
  }

  const company = await getCompanyById(companyId);

  // Find or create prospect by email
  const { data: existingProspect } = await db
    .from("prospects")
    .select("*")
    .eq("company_id", companyId)
    .eq("email", args.from)
    .maybeSingle();

  let prospectId = existingProspect?.id as string | undefined;
  let conversationId: string | undefined;

  if (prospectId) {
    const { data: conv } = await db
      .from("conversations")
      .select("id")
      .eq("prospect_id", prospectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    conversationId = conv?.id;
  }

  if (!prospectId || !conversationId) {
    if (!prospectId) {
      const prospect = await createProspect({
        companyId,
        email: args.from,
        personName: args.from.split("@")[0],
        companyName: args.from.split("@")[1],
      });
      prospectId = prospect.id;
    }
    const conversation = await createConversation({
      companyId,
      prospectId,
    });
    conversationId = conversation.id;
  }

  // Persist inbound as user email message is done inside handleChatMessage
  // but we want channel=email — handleChatMessage supports that.
  const response = await handleChatMessage({
    conversationId,
    message: args.subject ? `Subject: ${args.subject}\n\n${args.text}` : args.text,
    channel: "email",
  });

  const signature =
    company.agent_email_signature ||
    `\n\n— ${company.agent_name}\nForward-Deployed Engineer, ${company.name}`;

  const replyBody = `${response.message.content}${signature}`;

  await sendEmail({
    to: args.from,
    subject: args.subject?.startsWith("Re:")
      ? args.subject
      : `Re: ${args.subject || company.name}`,
    text: replyBody,
    from: process.env.EMAIL_FROM,
  });

  return {
    conversationId,
    messageId: response.message.id,
    replyPreview: response.message.content.slice(0, 200),
  };
}
