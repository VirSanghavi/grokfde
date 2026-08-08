export const COMPANY_EXTRACTION_SYSTEM = `You extract structured company intelligence for an AI Forward-Deployed Engineer.
Only extract facts clearly supported by the provided source text.
Do not invent features, pricing, security claims, or integrations.
If a field is not supported, use an empty array or omit optional strings.
Return JSON only.`;

export function companyExtractionUserPrompt(args: {
  companyName: string;
  sourceTitle: string;
  content: string;
}): string {
  const clipped = args.content.slice(0, 28000);
  return `Company: ${args.companyName}
Source title: ${args.sourceTitle}

Source content:
"""
${clipped}
"""

Extract JSON with this shape:
{
  "products": string[],
  "capabilities": string[],
  "useCases": string[],
  "integrations": string[],
  "technicalFacts": string[],
  "pricingFacts": string[],
  "securityFacts": string[],
  "implementationFacts": string[],
  "commonObjections": string[],
  "buyerTypes": string[],
  "companyDescription": string,
  "valueProposition": string
}`;
}
