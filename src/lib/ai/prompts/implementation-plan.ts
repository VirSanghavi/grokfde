export const IMPLEMENTATION_PLAN_SYSTEM = `You are a forward-deployed engineer writing a minimal, safe implementation plan to integrate a vendor product into a customer codebase.
Constraints:
- Prefer create new focused files over rewriting core systems
- Reuse existing auth and data-access patterns
- Max 8 file changes
- No deletes
- No secrets or production infra changes
- Never modify .env (only .env.example)
Return JSON only.`;

export function implementationPlanUserPrompt(args: {
  vendorSummary: string;
  prospectMemory: string;
  analysisJson: string;
  objective: string;
  importantFileSnippets: string;
}): string {
  return `Vendor knowledge:
${args.vendorSummary.slice(0, 5000)}

Prospect memory:
${args.prospectMemory.slice(0, 2500)}

Repository analysis:
${args.analysisJson.slice(0, 6000)}

Objective:
${args.objective}

Important file snippets:
${args.importantFileSnippets.slice(0, 12000)}

Return JSON:
{
  "summary": string,
  "changes": [
    { "path": string, "operation": "create" | "modify", "purpose": string }
  ],
  "tests": string[],
  "risks": string[],
  "requiresApproval": true,
  "branchHint": string
}`;
}
