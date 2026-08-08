import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { connectMcpServer, listEnabledMcpServers, mcpServerPublic } from "@/lib/server/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  companyId: z.string().uuid(),
  label: z.string().min(1),
  serverUrl: z.string().min(1),
  auth: z.string().optional(),
  allowWrite: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const server = await connectMcpServer({
      companyId: body.companyId,
      label: body.label,
      serverUrl: body.serverUrl,
      auth: body.auth,
      allowWrite: body.allowWrite,
    });
    return jsonOk(
      {
        mcp: mcpServerPublic(server),
        tools: server.tools_json ?? [],
      },
      201,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid MCP payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!companyId) {
      throw new ApiError("BAD_REQUEST", "companyId is required", { status: 400 });
    }
    const servers = await listEnabledMcpServers(companyId);
    return jsonOk({
      servers: servers.map(mcpServerPublic),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
