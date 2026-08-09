import { z } from "zod";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";
import { getRepository, parseRepositoryName, unwrapGitHub } from "@/lib/server/github";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The company's repository, connected once instead of once per conversation.
 *
 * Until this existed the only place to attach a repository was inside a single
 * prospect's implementation workspace, four clicks into a conversation and
 * labelled "Start implementation". So there was no answer to "connect our
 * GitHub" at the company level at all, and every new conversation started from
 * nothing. The agent is supposed to have the repository in hand on every chat
 * and every call, which means the connection belongs to the company.
 *
 * WHERE IT IS STORED, AND WHY IT LOOKS LIKE THIS. A repository is recorded as a
 * `url` knowledge source carrying `metadata_json.kind = "github_repository"`.
 * That is not a workaround dressed up: the repository genuinely is one of the
 * things the agent has read, it belongs beside the docs and the API reference
 * on the knowledge page, and it needs no column that this database does not
 * already have. `repository_connections` was not usable, because every row on
 * it requires a workspace, and every workspace requires a prospect.
 */

const KIND = "github_repository";

const ConnectSchema = z.object({
  companyId: z.string().uuid(),
  /** "owner/repo". Validated against GitHub before anything is written. */
  repository: z.string().min(3).max(200),
});

type ConnectionRow = {
  id: string;
  title: string;
  source_url: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

function serialize(row: ConnectionRow) {
  const meta = row.metadata_json ?? {};
  return {
    id: row.id,
    fullName: String(meta.fullName ?? row.title),
    url: row.source_url,
    defaultBranch: String(meta.defaultBranch ?? "main"),
    private: Boolean(meta.private),
    connectedAt: row.created_at,
  };
}

async function findConnection(companyId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("knowledge_sources")
    .select("id,title,source_url,metadata_json,created_at")
    .eq("company_id", companyId)
    .eq("type", "url")
    .order("created_at", { ascending: false });
  if (error) {
    throw new ApiError("DATABASE_ERROR", "Could not read the repository connection", {
      status: 503,
      details: error.message,
    });
  }
  const rows = (data ?? []) as ConnectionRow[];
  return rows.find((row) => (row.metadata_json ?? {}).kind === KIND) ?? null;
}

function requireCompanyId(req: Request): string {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId") ?? req.headers.get("x-company-id");
  if (!companyId) {
    throw new ApiError("BAD_REQUEST", "companyId is required", { status: 400 });
  }
  return companyId;
}

export async function GET(req: Request) {
  try {
    const row = await findConnection(requireCompanyId(req));
    return jsonOk({ connection: row ? serialize(row) : null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = ConnectSchema.parse(await req.json());
    const ref = unwrapGitHub(parseRepositoryName(body.repository));

    // Confirmed against GitHub before it is stored. Recording a name nobody
    // checked means the failure surfaces later, in the middle of a call, as a
    // 404 the agent cannot explain.
    const repo = unwrapGitHub(await getRepository(ref));

    const db = getSupabaseAdmin();
    const existing = await findConnection(body.companyId);
    const payload = {
      company_id: body.companyId,
      type: "url" as const,
      title: repo.fullName,
      source_url: repo.htmlUrl ?? `https://github.com/${repo.fullName}`,
      status: "ready" as const,
      metadata_json: {
        kind: KIND,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        private: repo.private,
      },
    };

    // One repository per company. Reconnecting replaces, so the list cannot
    // silently accumulate three repositories the agent might pick between.
    const { data, error } = existing
      ? await db
          .from("knowledge_sources")
          .update(payload)
          .eq("id", existing.id)
          .select("id,title,source_url,metadata_json,created_at")
          .single()
      : await db
          .from("knowledge_sources")
          .insert(payload)
          .select("id,title,source_url,metadata_json,created_at")
          .single();

    if (error || !data) {
      throw new ApiError("DATABASE_ERROR", "Could not save the repository connection", {
        status: 503,
        details: error?.message,
      });
    }

    return jsonOk({ connection: serialize(data as ConnectionRow) }, existing ? 200 : 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Provide a companyId and an owner/repo name", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const companyId = requireCompanyId(req);
    const existing = await findConnection(companyId);
    if (!existing) return jsonOk({ connection: null });

    const { error } = await getSupabaseAdmin()
      .from("knowledge_sources")
      .delete()
      .eq("id", existing.id);
    if (error) {
      throw new ApiError("DATABASE_ERROR", "Could not disconnect the repository", {
        status: 503,
        details: error.message,
      });
    }
    return jsonOk({ connection: null });
  } catch (err) {
    return errorResponse(err);
  }
}
