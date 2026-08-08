import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { connectRepository } from "@/lib/server/implementation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  provider: z.enum(["demo", "github"]).default("demo"),
  repository: z.string().optional(),
  repositoryUrl: z.string().optional(),
  defaultBranch: z.string().optional(),
  token: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = Schema.parse(await req.json().catch(() => ({})));
    const repo = await connectRepository({
      workspaceId: id,
      provider: body.provider,
      repository: body.repository,
      repositoryUrl: body.repositoryUrl,
      defaultBranch: body.defaultBranch,
      token: body.token,
    });
    return jsonOk(
      {
        id: repo.id,
        repositoryName: repo.repositoryName,
        defaultBranch: repo.defaultBranch,
        status: repo.status,
        provider: repo.provider,
        events: [
          {
            type: "repository_connected",
            label: `Connected ${repo.provider} repository ${repo.repositoryName}`,
          },
        ],
      },
      201,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid repository payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
