import { z } from "zod";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";
import { getRepository, parseRepositoryName, unwrapGitHub } from "@/lib/server/github";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { createClient } from "@/lib/supabase/server";

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
  /**
   * Let the agent read this repository and open pull requests DURING a live
   * call. Off unless asked for, because tool results travel through the
   * visitor's browser and a live call is answered by anonymous strangers.
   */
  liveCallTools: z.boolean().optional(),
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
    liveCallTools: meta.liveCallTools === true,
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

/**
 * KNOWN GAP, stated rather than hidden.
 *
 * `companyId` arrives from the caller and is NOT an authorization signal. Any
 * signed-in operator can name any company here and read, replace, or remove its
 * repository connection. That is a cross-tenant write, and on this route it is
 * worse than a cross-tenant read, because it changes which repository the agent
 * will branch and commit against.
 *
 * The correct fix is a membership check: resolve the user from the session and
 * require a `company_members` row for the company before touching anything.
 * That table does not exist in this project and there is no DDL access to
 * create it, which is the same reason the whole operator console still resolves
 * its company from a client-supplied id. This route is not weaker than the
 * console around it, and it is not stronger either.
 *
 * What IS enforced here: a session, checked in the route rather than only in
 * middleware, so a change to the middleware matcher cannot silently turn this
 * into a public endpoint. Fail closed when auth is unavailable.
 */
async function requireOperator(req: Request): Promise<string> {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "Sign in to manage the repository", { status: 401 });
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId") ?? req.headers.get("x-company-id");
  if (!companyId) {
    throw new ApiError("BAD_REQUEST", "companyId is required", { status: 400 });
  }
  return companyId;
}

export async function GET(req: Request) {
  try {
    const row = await findConnection(await requireOperator(req));
    return jsonOk({ connection: row ? serialize(row) : null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (!user) {
      throw new ApiError("UNAUTHORIZED", "Sign in to manage the repository", { status: 401 });
    }

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
        // Preserved across a reconnect of the SAME repository, and reset to off
        // whenever the repository changes. Silently carrying an opt-in over to a
        // different repository would enable live access to something nobody
        // agreed to expose.
        liveCallTools:
          body.liveCallTools ??
          (existing && (existing.metadata_json ?? {}).fullName === repo.fullName
            ? (existing.metadata_json ?? {}).liveCallTools === true
            : false),
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
    const companyId = await requireOperator(req);
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
