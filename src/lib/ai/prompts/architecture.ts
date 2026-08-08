export const ARCHITECTURE_SYSTEM = `You design integration architectures for prospects considering a vendor product.
Ground every node and edge in known company capabilities and prospect stack.
Do not invent unsupported integrations.
Return JSON only.`;

export function architectureUserPrompt(args: {
  companyName: string;
  companyKnowledgeJson: string;
  prospectMemoryJson: string;
  recentConversation: string;
}): string {
  return `Vendor company: ${args.companyName}

Company knowledge:
${args.companyKnowledgeJson}

Prospect memory:
${args.prospectMemoryJson}

Recent conversation excerpts:
${args.recentConversation.slice(0, 6000)}

Produce an architecture diagram as JSON:
{
  "title": string,
  "summary": string,
  "nodes": [{ "id": string, "label": string, "type": string }],
  "edges": [{ "source": string, "target": string, "label"?: string }]
}

Include prospect systems, the vendor product, knowledge/MCP layers where relevant.
Keep ids lowercase-kebab-case.`;
}
