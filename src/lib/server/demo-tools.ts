/**
 * Built-in demo MCP-equivalent tools for the hackathon when no external MCP is connected.
 * Same behavioral surface as vendor MCP: create sandbox, estimate, inspect.
 */

export type DemoToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk: "READ" | "WRITE" | "HIGH_RISK";
};

export const DEMO_TOOLS: DemoToolDef[] = [
  {
    name: "create_sandbox",
    description: "Create a trial sandbox environment for the prospect",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sandbox name" },
        region: { type: "string", description: "Optional region" },
      },
      required: ["name"],
    },
    risk: "WRITE",
  },
  {
    name: "estimate_cost",
    description: "Estimate monthly cost for a given prospect usage profile",
    parameters: {
      type: "object",
      properties: {
        seats: { type: "number" },
        conversations_per_month: { type: "number" },
        include_voice: { type: "boolean" },
      },
    },
    risk: "READ",
  },
  {
    name: "list_capabilities",
    description: "List product capabilities relevant to the prospect stack",
    parameters: {
      type: "object",
      properties: {
        stack: { type: "array", items: { type: "string" } },
      },
    },
    risk: "READ",
  },
  {
    name: "generate_config",
    description: "Generate a starter integration config snippet",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string" },
        company_slug: { type: "string" },
      },
      required: ["platform"],
    },
    risk: "READ",
  },
];

const sandboxes = new Map<string, { name: string; endpoint: string; createdAt: string }>();

export function executeDemoTool(
  name: string,
  args: Record<string, unknown>,
): { ok: boolean; result: unknown; error?: string } {
  switch (name) {
    case "create_sandbox": {
      const sandboxName = String(args.name ?? "sandbox").trim() || "sandbox";
      const id = `sbx_${Math.random().toString(36).slice(2, 10)}`;
      const endpoint = `https://sandbox.grok-fde.demo/${sandboxName}`;
      const record = {
        name: sandboxName,
        endpoint,
        createdAt: new Date().toISOString(),
        id,
        region: String(args.region ?? "us-east-1"),
      };
      sandboxes.set(id, record);
      return { ok: true, result: record };
    }
    case "estimate_cost": {
      const seats = Number(args.seats ?? 5);
      const convos = Number(args.conversations_per_month ?? 500);
      const voice = Boolean(args.include_voice);
      const base = 499;
      const seatCost = seats * 49;
      const usage = Math.round(convos * 0.12);
      const voiceCost = voice ? 199 : 0;
      return {
        ok: true,
        result: {
          currency: "USD",
          monthly_estimate: base + seatCost + usage + voiceCost,
          breakdown: { base, seats: seatCost, usage, voice: voiceCost },
          note: "Indicative estimate for demo purposes, not a binding quote.",
        },
      };
    }
    case "list_capabilities": {
      const stack = Array.isArray(args.stack) ? args.stack.map(String) : [];
      return {
        ok: true,
        result: {
          capabilities: [
            "Persistent multi-channel FDE (chat, email, voice)",
            "Company knowledge via xAI Collections",
            "MCP tool actions during sales conversations",
            "Prospect memory across sessions",
            "Architecture and collateral generation",
          ],
          stack_fit: stack.length
            ? `Can integrate alongside ${stack.join(", ")} via docs and/or MCP`
            : "Share your stack for a tailored fit assessment",
        },
      };
    }
    case "generate_config": {
      const platform = String(args.platform ?? "generic");
      const slug = String(args.company_slug ?? "acme");
      return {
        ok: true,
        result: {
          platform,
          config: {
            fde_url: `https://app.example.com/fde/${slug}`,
            webhook: `https://api.example.com/hooks/${slug}`,
            mcp: platform.toLowerCase().includes("mcp")
              ? { mode: "remote", note: "Point Grok FDE at your MCP server URL" }
              : { mode: "docs", note: "Upload API docs if no MCP server yet" },
          },
        },
      };
    }
    default:
      return { ok: false, result: null, error: `Unknown demo tool: ${name}` };
  }
}

export function demoToolFunctionConfigs() {
  return DEMO_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
