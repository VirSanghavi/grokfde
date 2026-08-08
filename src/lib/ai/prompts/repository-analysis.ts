export const REPO_ANALYSIS_SYSTEM = `You are a senior forward-deployed engineer analyzing a customer repository to integrate a vendor product.
Be precise. Only claim what the file tree and file contents support.
Prefer targeted integration points over rewrites.
Return JSON only.`;

export function repoAnalysisUserPrompt(args: {
  vendorSummary: string;
  prospectMemory: string;
  objective: string;
  fileTree: string;
  fileContents: string;
}): string {
  return `Vendor / product knowledge:
${args.vendorSummary.slice(0, 6000)}

Prospect memory:
${args.prospectMemory.slice(0, 3000)}

Integration objective:
${args.objective}

Repository file tree (partial):
${args.fileTree.slice(0, 8000)}

Selected file contents:
${args.fileContents.slice(0, 20000)}

Return JSON:
{
  "stack": string[],
  "importantFiles": [{ "path": string, "reason": string }],
  "architectureSummary": string,
  "integrationPoints": [{ "location": string, "reason": string }],
  "constraints": string[],
  "risks": string[],
  "questions": string[],
  "filesToReadNext": string[]
}`;
}

export const REPO_FILE_PICK_SYSTEM = `You select the most relevant repository files to read for an integration.
Return JSON only. Prefer existing API routes, auth, data clients, config, and env examples.
Max 8 paths.`;

export function repoFilePickUserPrompt(args: {
  objective: string;
  fileTree: string;
}): string {
  return `Objective: ${args.objective}

File tree:
${args.fileTree.slice(0, 10000)}

Return JSON:
{ "paths": string[] }`;
}
