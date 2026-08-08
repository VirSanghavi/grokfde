import { z } from "zod";
import {
  createBlocker,
  listOpenBlockers,
  resolveBlocker,
} from "@/lib/server/blockers";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { updateAccount } from "@/lib/server/accounts";
import { upsertDeployment } from "@/lib/server/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const blockers = await listOpenBlockers(id);
    return jsonOk({ blockers });
  } catch (err) {
    return errorResponse(err);
  }
}

const PostSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  ownerType: z.enum(["customer", "vendor", "fde", "unknown"]).optional(),
  ownerName: z.string().optional(),
  impact: z.string().optional(),
});

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = PostSchema.parse(await req.json());
    const blocker = await createBlocker({
      accountId: id,
      ...body,
      source: "api",
    });
    await updateAccount(id, { stage: "blocked" });
    return jsonOk({ blocker }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid blocker", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}

const PatchSchema = z.object({
  blockerId: z.string().uuid().optional(),
  title: z.string().optional(),
  resolve: z.boolean().default(true),
  advanceDeployment: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = PatchSchema.parse(await req.json());
    const resolved = await resolveBlocker({
      accountId: id,
      blockerId: body.blockerId,
      title: body.title,
    });
    const remaining = await listOpenBlockers(id);
    if (!remaining.length) {
      await updateAccount(id, { stage: "staging" });
      if (body.advanceDeployment !== false) {
        await upsertDeployment({
          accountId: id,
          status: "ready_for_production",
          environment: "staging",
        });
      }
    }
    return jsonOk({ resolved, openBlockers: remaining });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid blocker update", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
