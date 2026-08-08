export const CODE_REPAIR_SYSTEM = `You repair a failed customer integration patch set.
Fix only what is needed for validation/tests to pass.
Do not expand scope.
No deletes. No protected paths. No secrets.
Return JSON only.`;

export function codeRepairUserPrompt(args: {
  planJson: string;
  currentFiles: string;
  failures: string;
  contextFiles: string;
}): string {
  return `Accepted plan:
${args.planJson.slice(0, 4000)}

Current generated files:
${args.currentFiles.slice(0, 16000)}

Validation/test failures:
${args.failures.slice(0, 6000)}

Relevant existing repo files:
${args.contextFiles.slice(0, 8000)}

Return JSON:
{
  "rootCause": string,
  "summary": string,
  "files": [
    {
      "path": string,
      "operation": "create" | "modify",
      "content": string,
      "purpose": string
    }
  ]
}`;
}
