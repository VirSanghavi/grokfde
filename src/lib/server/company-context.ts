import { createCollection } from "@/lib/ai/grok";
import { ApiError } from "./errors";
import { companyPublic } from "./knowledge";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CompanyRow } from "./types";

export async function createCompany(args: {
  name: string;
  slug: string;
  agentName?: string;
  agentVoice?: string;
  description?: string;
}): Promise<CompanyRow> {
  const db = getSupabaseAdmin();
  const slug = args.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Invalid slug", { status: 400 });
  }

  const { data: existing } = await db
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    throw new ApiError("BAD_REQUEST", `Company slug '${slug}' already exists`, {
      status: 409,
    });
  }

  let collectionId: string | null = null;
  try {
    const collection = await createCollection(`${args.name} Knowledge`);
    collectionId = collection.collectionId;
  } catch (err) {
    // Management keys / Collections can fail in hackathon envs.
    // Still create the company; knowledge uses Files + structured summary.
    console.warn("[company] collection create failed; using local knowledge id", err);
    collectionId = `local_${crypto.randomUUID()}`;
  }

  const { data, error } = await db
    .from("companies")
    .insert({
      name: args.name,
      slug,
      description: args.description ?? null,
      agent_name: args.agentName ?? "Atlas",
      agent_voice: args.agentVoice ?? "eve",
      xai_collection_id: collectionId,
      knowledge_summary_json: {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not create company", {
      status: 500,
      details: error?.message,
    });
  }

  return data as CompanyRow;
}

export async function getCompanyById(id: string): Promise<CompanyRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("companies").select("*").eq("id", id).maybeSingle();
  // A database failure is not a missing company. Reporting it as 404 hides outages,
  // bad credentials, and RLS problems behind a message that sends you looking in the
  // wrong place.
  if (error) {
    throw new ApiError("DATABASE_ERROR", "Could not reach the company database", {
      status: 503,
      details: error.message,
    });
  }
  if (!data) {
    throw new ApiError("NOT_FOUND", "Company not found", { status: 404 });
  }
  return data as CompanyRow;
}

export async function getCompanyBySlug(slug: string): Promise<CompanyRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new ApiError("DATABASE_ERROR", "Could not reach the company database", {
      status: 503,
      details: error.message,
    });
  }
  if (!data) {
    throw new ApiError("NOT_FOUND", `No company is published at "${slug}"`, {
      status: 404,
    });
  }
  return data as CompanyRow;
}

export { companyPublic };
