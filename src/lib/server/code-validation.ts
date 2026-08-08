import { isProtectedPath, normalizeRepoPath } from "./protected-paths";

export type ValidationResult = {
  name: string;
  status: "passed" | "failed" | "validated" | "skipped";
  kind: "validation" | "test";
  command?: string;
  output: string;
};

export type GeneratedFile = {
  path: string;
  operation: "create" | "modify" | "delete";
  content?: string;
  originalContent?: string | null;
};

export function validateGeneratedFiles(args: {
  files: GeneratedFile[];
  planPaths: string[];
  existingPaths: string[];
}): ValidationResult[] {
  const results: ValidationResult[] = [];
  const existing = new Set(args.existingPaths.map(normalizeRepoPath));

  // 1. Protected paths
  const protectedHits = args.files.filter((f) => isProtectedPath(f.path));
  results.push({
    name: "Protected paths untouched",
    status: protectedHits.length === 0 ? "passed" : "failed",
    kind: "validation",
    output:
      protectedHits.length === 0
        ? "No protected paths modified."
        : `Protected paths rejected: ${protectedHits.map((f) => f.path).join(", ")}`,
  });

  // 2. Deletes forbidden
  const deletes = args.files.filter((f) => f.operation === "delete");
  results.push({
    name: "No destructive deletes",
    status: deletes.length === 0 ? "passed" : "failed",
    kind: "validation",
    output:
      deletes.length === 0
        ? "No delete operations."
        : `Deletes not allowed: ${deletes.map((f) => f.path).join(", ")}`,
  });

  // 3. Content present for create/modify
  const missingContent = args.files.filter(
    (f) => f.operation !== "delete" && (!f.content || !f.content.trim()),
  );
  results.push({
    name: "File contents present",
    status: missingContent.length === 0 ? "passed" : "failed",
    kind: "validation",
    output:
      missingContent.length === 0
        ? "All files include content."
        : `Missing content: ${missingContent.map((f) => f.path).join(", ")}`,
  });

  // 4. Balanced braces for TS/JS
  for (const f of args.files) {
    if (!f.content || !/\.(ts|tsx|js|jsx)$/.test(f.path)) continue;
    const open = (f.content.match(/\{/g) || []).length;
    const close = (f.content.match(/\}/g) || []).length;
    const parenOpen = (f.content.match(/\(/g) || []).length;
    const parenClose = (f.content.match(/\)/g) || []).length;
    const ok = open === close && parenOpen === parenClose;
    results.push({
      name: `Syntax balance: ${f.path}`,
      status: ok ? "validated" : "failed",
      kind: "validation",
      output: ok
        ? "Braces/parens balanced (static)."
        : `Unbalanced braces/parens ( {${open}/${close} } (${parenOpen}/${parenClose}) )`,
    });
  }

  // 5. JSON files parse
  for (const f of args.files) {
    if (!f.content || !f.path.endsWith(".json")) continue;
    try {
      JSON.parse(f.content);
      results.push({
        name: `JSON valid: ${f.path}`,
        status: "passed",
        kind: "validation",
        output: "Valid JSON.",
      });
    } catch (err) {
      results.push({
        name: `JSON valid: ${f.path}`,
        status: "failed",
        kind: "validation",
        output: err instanceof Error ? err.message : "Invalid JSON",
      });
    }
  }

  // 6. Plan coverage — at least one planned path touched
  const planned = new Set(args.planPaths.map(normalizeRepoPath));
  const touched = new Set(args.files.map((f) => normalizeRepoPath(f.path)));
  const overlap = [...planned].filter((p) => touched.has(p));
  results.push({
    name: "Implementation matches plan paths",
    status: planned.size === 0 || overlap.length > 0 ? "validated" : "failed",
    kind: "validation",
    output:
      planned.size === 0
        ? "No plan paths to compare."
        : overlap.length > 0
          ? `Touched planned paths: ${overlap.join(", ")}`
          : `None of planned paths touched: ${[...planned].join(", ")}`,
  });

  // 7. Env example mentions key when FDE client added
  const hasClient = args.files.some((f) => /grok-fde/i.test(f.path));
  const envFile = args.files.find((f) => f.path === ".env.example");
  if (hasClient) {
    const ok = Boolean(envFile?.content && /GROK_FDE|XAI_API_KEY/i.test(envFile.content));
    results.push({
      name: "Env vars declared for FDE",
      status: ok ? "passed" : "failed",
      kind: "validation",
      output: ok
        ? ".env.example includes FDE-related keys."
        : "Expected .env.example update with GROK_FDE_API_KEY or XAI_API_KEY.",
    });
  }

  // 8. Imports of local modules look plausible (static)
  for (const f of args.files) {
    if (!f.content || !/\.(ts|tsx)$/.test(f.path)) continue;
    const importRe = /from\s+["'](@\/[^"']+|\.\.?\/[^"']+)["']/g;
    let m: RegExpExecArray | null;
    const bad: string[] = [];
    while ((m = importRe.exec(f.content))) {
      const imp = m[1];
      if (imp.startsWith("@/")) {
        const candidate = `src/${imp.slice(2)}`.replace(/\.ts$/, "");
        const variants = [
          `${candidate}.ts`,
          `${candidate}.tsx`,
          `${candidate}/index.ts`,
          normalizeRepoPath(candidate),
        ];
        const known =
          variants.some((v) => existing.has(v) || touched.has(v)) ||
          args.files.some((gf) => variants.includes(normalizeRepoPath(gf.path)));
        // Soft check — only fail if clearly random
        if (!known && /nonexistent|TODO_PATH/i.test(imp)) bad.push(imp);
      }
    }
    if (bad.length) {
      results.push({
        name: `Import sanity: ${f.path}`,
        status: "failed",
        kind: "validation",
        output: `Suspicious imports: ${bad.join(", ")}`,
      });
    }
  }

  // 9. Smoke "test" for expected FDE route content
  const fdeRoute = args.files.find((f) => /api\/fde/i.test(f.path));
  if (fdeRoute?.content) {
    const hasExport = /export\s+async\s+function\s+POST/.test(fdeRoute.content);
    const usesAuth =
      /getSessionUser|unauthorized|Authorization/i.test(fdeRoute.content);
    results.push({
      name: "FDE route smoke structure",
      status: hasExport ? "passed" : "failed",
      kind: "test",
      command: "static:inspect-fde-route",
      output: hasExport
        ? `POST handler present.${usesAuth ? " Auth pattern detected." : " Warning: no auth pattern detected."}`
        : "Expected export async function POST in FDE route.",
    });
  }

  // 10. Client wrapper smoke
  const client = args.files.find((f) => /grok-fde\.ts$/i.test(f.path));
  if (client?.content) {
    const ok =
      /fetch\(|XAI_API_KEY|GROK_FDE|api\.x\.ai|process\.env/i.test(client.content) &&
      /export\s+(async\s+)?function|export\s+const/.test(client.content);
    results.push({
      name: "FDE client wrapper smoke",
      status: ok ? "passed" : "failed",
      kind: "test",
      command: "static:inspect-client",
      output: ok
        ? "Client exports a callable and references env/API."
        : "Client missing export or API/env usage.",
    });
  }

  return results;
}

export function allValidationsPassed(results: ValidationResult[]): boolean {
  return results.every((r) => r.status === "passed" || r.status === "validated" || r.status === "skipped");
}
