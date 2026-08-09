import { z } from "zod";
import { runRepoTool } from "@/lib/server/agent-repo-tools";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Repository tools, executed for a live call.
 *
 * The browser owns the realtime socket, so every tool the model calls runs
 * client side. That is fine for anything harmless and unacceptable for anything
 * holding a credential, so the browser calls THIS instead, and the GitHub token
 * never leaves the server.
 *
 * The only thing the caller supplies is a conversation id, a tool name from a
 * fixed allowlist, and that tool's arguments. It cannot name a company and it
 * cannot name a repository: both are resolved server side from the conversation.
 * Everything else, the opt-in, the read budget, the one-pull-request limit, and
 * the protected-path guard, lives in `agent-repo-tools`.
 *
 * Deliberately open to an anonymous caller, because the prospect on the call IS
 * anonymous by design. Holding a conversation id is what stands in for identity
 * here, exactly as it does for the prospect's own chat endpoints.
 */

const Schema = z.object({
  conversationId: z.string().uuid(),
  tool: z.string().min(1).max(64),
  input: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const result = await runRepoTool({
      conversationId: body.conversationId,
      tool: body.tool,
      input: body.input ?? {},
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid tool call", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    // A tool that fails must come back as a RESULT the model can speak to, not
    // as a dead promise in the browser. Anything unexpected is reported as a
    // sentence the agent can read out.
    if (err instanceof ApiError) return errorResponse(err);
    console.error("[agent-tools] github tool failed", err);
    return jsonOk({
      error:
        err instanceof Error
          ? `That did not work: ${err.message}`
          : "The repository could not be reached just now.",
    });
  }
}
