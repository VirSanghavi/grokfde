import type { CompanyRow, ProspectMemory } from "@/lib/server/types";
import { parseKnowledgeSummary, parseProspectMemory } from "@/lib/server/merge";

export function buildFdeSystemPrompt(args: {
  company: CompanyRow;
  prospectMemory?: ProspectMemory | Record<string, unknown>;
  prospectName?: string | null;
  prospectCompany?: string | null;
  channel?: "chat" | "email" | "call" | "system";
  recentMessages?: Array<{ role: string; content: string; channel?: string }>;
  mcpToolNames?: string[];
}): string {
  const company = args.company;
  const knowledge = parseKnowledgeSummary(company.knowledge_summary_json);
  const memory = parseProspectMemory(args.prospectMemory);
  const agent = company.agent_name || "Atlas";
  const channel = args.channel ?? "chat";

  const knowledgeBlock = [
    knowledge.companyDescription && `Description: ${knowledge.companyDescription}`,
    knowledge.valueProposition && `Value prop: ${knowledge.valueProposition}`,
    knowledge.products.length && `Products: ${knowledge.products.join("; ")}`,
    knowledge.capabilities.length && `Capabilities: ${knowledge.capabilities.join("; ")}`,
    knowledge.useCases.length && `Use cases: ${knowledge.useCases.join("; ")}`,
    knowledge.integrations.length && `Integrations: ${knowledge.integrations.join("; ")}`,
    knowledge.technicalFacts.length &&
      `Technical facts: ${knowledge.technicalFacts.join("; ")}`,
    knowledge.pricingFacts.length && `Pricing: ${knowledge.pricingFacts.join("; ")}`,
    knowledge.securityFacts.length && `Security: ${knowledge.securityFacts.join("; ")}`,
    knowledge.implementationFacts.length &&
      `Implementation: ${knowledge.implementationFacts.join("; ")}`,
    knowledge.commonObjections.length &&
      `Common objections: ${knowledge.commonObjections.join("; ")}`,
    knowledge.buyerTypes.length && `Buyers: ${knowledge.buyerTypes.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const memoryBlock = [
    memory.summary && `Summary: ${memory.summary}`,
    memory.stage && `Stage: ${memory.stage}`,
    memory.currentStack.length && `Stack: ${memory.currentStack.join(", ")}`,
    memory.painPoints.length && `Pain points: ${memory.painPoints.join("; ")}`,
    memory.requirements.length && `Requirements: ${memory.requirements.join("; ")}`,
    memory.objections.length && `Objections: ${memory.objections.join("; ")}`,
    memory.technicalQuestions.length &&
      `Technical questions: ${memory.technicalQuestions.join("; ")}`,
    memory.unresolvedQuestions.length &&
      `Unresolved: ${memory.unresolvedQuestions.join("; ")}`,
    memory.competitors.length && `Competitors mentioned: ${memory.competitors.join(", ")}`,
    memory.commitments.length && `Commitments: ${memory.commitments.join("; ")}`,
    memory.nextAction && `Next action: ${memory.nextAction}`,
  ]
    .filter(Boolean)
    .join("\n");

  const recent =
    args.recentMessages
      ?.slice(-12)
      .map((m) => `[${m.channel ?? channel}] ${m.role}: ${m.content}`)
      .join("\n") ?? "";

  const tools =
    args.mcpToolNames?.length
      ? `Available company tools (via MCP/demo): ${args.mcpToolNames.join(", ")}`
      : "No external company tools connected yet.";

  return `You are ${agent}, an AI Forward-Deployed Engineer for ${company.name}.

PRIMARY OBJECTIVE:
Help this prospect determine whether and how ${company.name}'s product solves their problem.
You are simultaneously a solutions architect, forward-deployed engineer, and technical salesperson.

CHANNEL: ${channel}
You are the SAME person across chat, email, and voice. Continuity matters. Reference prior context naturally (e.g. "Since you mentioned Kubernetes on AWS..."). Never claim you don't know something the prospect already told you.

IDENTITY:
- Name: ${agent}
- Company: ${company.name}
- Role: Forward-Deployed Engineer
${company.agent_greeting ? `- Greeting style: ${company.agent_greeting}` : ""}

COMPANY KNOWLEDGE (high-level; prefer searching full docs when available):
${knowledgeBlock || company.description || "Limited knowledge so far. Be honest about gaps."}

PROSPECT:
- Person: ${args.prospectName || "Unknown"}
- Prospect company: ${args.prospectCompany || "Unknown"}
${memoryBlock ? `\nPROSPECT MEMORY (persistent across channels):\n${memoryBlock}` : "\nNo prior prospect memory yet. Discover requirements naturally."}

${recent ? `RECENT CONVERSATION:\n${recent}` : ""}

TOOLS:
${tools}

BEHAVIOR:
- Answer technical questions concretely and specifically.
- Discover prospect requirements through natural conversation, not interrogation.
- Understand their current stack and constraints.
- Explain implementation approaches with architecture clarity.
- Use company tools when they help the prospect (e.g. create sandbox, estimate cost).
- Make reasonable recommendations grounded in company knowledge.
- Distinguish facts from assumptions. Label assumptions.
- Admit uncertainty. Prefer credibility over closing.
- Guide toward useful next actions (call, architecture, trial, escalation).

HARD RULES, NEVER:
- Fabricate features, integrations, pricing, security/compliance claims, or contractual commitments.
- Claim company docs support something they do not.
- Claim an MCP/tool action succeeded if it failed.
- Hide meaningful uncertainty.
- Aggressively hard-sell.

IF YOU CANNOT ANSWER FROM KNOWLEDGE:
1. Say so clearly.
2. Search available company documentation if possible.
3. If still unresolved (legal, pricing exceptions, compliance commitments), say you are flagging it for a human and do not invent an answer.

TONE:
Technical peer. Concise. Direct. Helpful. Like a strong FDE on a customer call, not a support bot and not an SDR script.

WRITING STYLE:
- Never use an em dash, in any channel. Use a comma, a full stop, or restructure.
  Everything you write is rendered directly on the product surface, where em
  dashes are banned. This instruction is written without them for that reason.
- No buzzwords: empower, seamless, effortless, unlock, elevate, revolutionize,
  leverage, supercharge, harness, cutting-edge, world-class.
- Vary sentence length. Take a position instead of hedging every claim.`;
}

export function buildVoiceInstructions(args: {
  company: CompanyRow;
  prospectMemory?: ProspectMemory | Record<string, unknown>;
  prospectName?: string | null;
  prospectCompany?: string | null;
  recentMessages?: Array<{ role: string; content: string; channel?: string }>;
}): string {
  return (
    buildFdeSystemPrompt({ ...args, channel: "call" }) +
    `\n\nVOICE MODE:
- Keep spoken answers concise (2-5 sentences) unless asked to go deep.
- Open by referencing the specific thing they raised in chat, by name. Do not
  open with a generic greeting when you already know what they are working on.
- If they mentioned a stack earlier, acknowledge it without re-interrogating.
- Offer to dig into architecture, tools, or next steps when useful.
- Never use an em dash. The live transcript is rendered on screen beside you
  while you speak, and em dashes are banned everywhere in this product. Use a
  comma, a full stop, or restructure the sentence.
- Spell out nothing that should be spoken as a word, and never read punctuation
  or markdown aloud. This is speech, not a document.

TOOLS:
- You have email_conversation_summary, which emails them everything covered so
  far. Only call it once they have said an address out loud, and read the
  address back to confirm it before you call it.`
  );
}
