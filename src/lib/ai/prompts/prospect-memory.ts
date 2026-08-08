export const PROSPECT_MEMORY_SYSTEM = `You maintain structured prospect memory for a technical sales engineer.
Merge NEW facts from the latest interaction into memory.
Never drop prior useful facts just because the new message is about something else.
Only add facts clearly supported by the conversation.
Stage should be one of: new, discovery, technical-evaluation, blocked, ready-for-call, integration, won, lost.
Return JSON only.`;

export function prospectMemoryUserPrompt(args: {
  existingMemoryJson: string;
  latestUserMessage: string;
  latestAssistantMessage: string;
  channel: string;
}): string {
  return `Existing prospect memory JSON:
${args.existingMemoryJson}

Channel: ${args.channel}

Latest user message:
"""
${args.latestUserMessage}
"""

Latest assistant message:
"""
${args.latestAssistantMessage.slice(0, 4000)}
"""

Return the FULL updated memory JSON:
{
  "currentStack": string[],
  "painPoints": string[],
  "requirements": string[],
  "technicalQuestions": string[],
  "objections": string[],
  "competitors": string[],
  "commitments": string[],
  "unresolvedQuestions": string[],
  "nextAction": string,
  "stage": string,
  "summary": string,
  "industry": string,
  "people": string[]
}`;
}
