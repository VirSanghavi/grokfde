import type { McpToolConfig } from "@/lib/ai/grok";
import { ApiError } from "./errors";
import { filterAllowedTools } from "./permissions";
import { getSupabaseAdmin } from "./supabase-admin";
import type { McpServerRow } from "./types";
import { demoToolFunctionConfigs } from "./demo-tools";

export function mcpServerPublic(row: McpServerRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    label: row.label,
    serverUrl: row.server_url,
    allowWrite: row.allow_write,
    enabled: row.enabled,
    tools: row.tools_json ?? [],
    createdAt: row.created_at,
    // never return auth_token
  };
}

/**
 * Best-effort tool discovery via MCP HTTP JSON-RPC tools/list.
 */
export async function discoverMcpTools(args: {
  serverUrl: string;
  auth?: string;
}): Promise<Array<{ name: string; description?: string }>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (args.auth) headers.Authorization = `Bearer ${args.auth}`;

    const res = await fetch(args.serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // Some MCP servers need initialize first — return empty, still connectable via xAI
      return [];
    }

    const data = (await res.json()) as {
      result?: { tools?: Array<{ name: string; description?: string }> };
      tools?: Array<{ name: string; description?: string }>;
    };

    const tools = data.result?.tools ?? data.tools ?? [];
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
    }));
  } catch {
    return [];
  }
}

export async function connectMcpServer(args: {
  companyId: string;
  label: string;
  serverUrl: string;
  auth?: string;
  allowWrite?: boolean;
}): Promise<McpServerRow> {
  const db = getSupabaseAdmin();

  const { data: company } = await db
    .from("companies")
    .select("id")
    .eq("id", args.companyId)
    .maybeSingle();

  if (!company) {
    throw new ApiError("NOT_FOUND", "Company not found", { status: 404 });
  }

  let tools = await discoverMcpTools({
    serverUrl: args.serverUrl,
    auth: args.auth,
  });

  // Demo shortcut: special URL registers built-in tools
  if (
    args.serverUrl.includes("demo://") ||
    args.serverUrl.includes("grok-fde-demo") ||
    tools.length === 0
  ) {
    if (args.serverUrl.includes("demo") || args.serverUrl.startsWith("demo://")) {
      tools = demoToolFunctionConfigs().map((t) => ({
        name: t.name,
        description: t.description,
      }));
    }
  }

  const { data, error } = await db
    .from("mcp_servers")
    .insert({
      company_id: args.companyId,
      label: args.label,
      server_url: args.serverUrl,
      auth_token: args.auth ?? null,
      allow_write: Boolean(args.allowWrite),
      enabled: true,
      tools_json: tools,
      metadata_json: {
        discoveredAt: new Date().toISOString(),
        isDemo: args.serverUrl.startsWith("demo://") || args.serverUrl.includes("grok-fde-demo"),
      },
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("MCP_FAILED", "Could not store MCP connection", {
      status: 500,
      details: error?.message,
    });
  }

  return data as McpServerRow;
}

export async function listEnabledMcpServers(companyId: string): Promise<McpServerRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("mcp_servers")
    .select("*")
    .eq("company_id", companyId)
    .eq("enabled", true);

  if (error) {
    throw new ApiError("MCP_FAILED", "Could not load MCP servers", {
      status: 500,
      details: error.message,
    });
  }
  return (data ?? []) as McpServerRow[];
}

export function buildMcpToolConfigs(
  servers: McpServerRow[],
  options?: { confirmedWriteTools?: string[] },
): McpToolConfig[] {
  const configs: McpToolConfig[] = [];

  for (const server of servers) {
    // Skip local demo URLs — handled via function tools
    if (
      server.server_url.startsWith("demo://") ||
      server.server_url.includes("grok-fde-demo")
    ) {
      continue;
    }

    const toolNames = (server.tools_json ?? []).map((t) => t.name);
    const allowed = toolNames.length
      ? filterAllowedTools({
          toolNames,
          allowWrite: server.allow_write,
          confirmedWriteTools: options?.confirmedWriteTools,
        })
      : undefined;

    configs.push({
      server_url: server.server_url,
      server_label: server.label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "mcp",
      server_description: `Company MCP: ${server.label}`,
      ...(server.auth_token ? { authorization: server.auth_token } : {}),
      ...(allowed?.length ? { allowed_tools: allowed } : {}),
    });
  }

  return configs;
}

export function companyHasDemoMcp(servers: McpServerRow[]): boolean {
  return servers.some(
    (s) =>
      s.server_url.startsWith("demo://") ||
      s.server_url.includes("grok-fde-demo") ||
      Boolean((s.metadata_json as { isDemo?: boolean })?.isDemo),
  );
}
