export const CODE_GENERATION_SYSTEM = `You are a careful forward-deployed engineer implementing a small customer integration.
Match the customer's existing code style (imports, auth helpers, Response.json patterns).
Generate complete file contents for each change.
Do not invent unrelated features.
Do not include secrets.
Do not modify protected paths.
Max 8 files. No deletes.
Return JSON only.`;

export function codeGenerationUserPrompt(args: {
  vendorSummary: string;
  planJson: string;
  analysisJson: string;
  contextFiles: string;
  objective: string;
}): string {
  return `Vendor knowledge:
${args.vendorSummary.slice(0, 4000)}

Accepted plan:
${args.planJson.slice(0, 5000)}

Repo analysis:
${args.analysisJson.slice(0, 4000)}

Objective:
${args.objective}

Existing context files:
${args.contextFiles.slice(0, 18000)}

Return JSON:
{
  "summary": string,
  "files": [
    {
      "path": string,
      "operation": "create" | "modify",
      "content": string,
      "purpose": string
    }
  ]
}

For modify operations, return the FULL new file content.`;
}
