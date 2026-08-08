export type ToolRisk = "READ" | "WRITE" | "HIGH_RISK";

const HIGH_RISK_PATTERNS = [
  /delete/i,
  /destroy/i,
  /drop/i,
  /purge/i,
  /remove_all/i,
  /wipe/i,
  /terminate/i,
  /revoke/i,
  /ban/i,
];

const WRITE_PATTERNS = [
  /create/i,
  /update/i,
  /set/i,
  /write/i,
  /deploy/i,
  /start/i,
  /provision/i,
  /send/i,
  /invite/i,
  /grant/i,
  /mutate/i,
  /post/i,
  /put/i,
  /patch/i,
  /insert/i,
];

/**
 * Local policy layer for MCP / demo tools.
 * READ may run automatically.
 * WRITE requires allowWrite on the MCP server or explicit confirmation.
 * HIGH_RISK never auto-executes in prospect conversations.
 */
export function classifyToolRisk(toolName: string): ToolRisk {
  if (HIGH_RISK_PATTERNS.some((p) => p.test(toolName))) return "HIGH_RISK";
  if (WRITE_PATTERNS.some((p) => p.test(toolName))) return "WRITE";
  return "READ";
}

export function filterAllowedTools(args: {
  toolNames: string[];
  allowWrite: boolean;
  confirmedWriteTools?: string[];
}): string[] {
  const confirmed = new Set((args.confirmedWriteTools ?? []).map((t) => t.toLowerCase()));
  return args.toolNames.filter((name) => {
    const risk = classifyToolRisk(name);
    if (risk === "HIGH_RISK") return false;
    if (risk === "WRITE") {
      return args.allowWrite || confirmed.has(name.toLowerCase());
    }
    return true;
  });
}

export function toolAllowedForAutoUse(
  toolName: string,
  allowWrite: boolean,
): { allowed: boolean; reason?: string } {
  const risk = classifyToolRisk(toolName);
  if (risk === "HIGH_RISK") {
    return { allowed: false, reason: "High-risk tools require a human" };
  }
  if (risk === "WRITE" && !allowWrite) {
    return {
      allowed: false,
      reason: "Write tools require company allowWrite or explicit confirmation",
    };
  }
  return { allowed: true };
}
