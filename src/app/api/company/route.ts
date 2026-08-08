import { z } from "zod";
import { companyPublic, createCompany, getCompanyById, getCompanyBySlug } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sourceToPublic } from "@/lib/server/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  agentName: z.string().optional(),
  agentVoice: z.string().optional(),
  description: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json());
    const company = await createCompany(body);
    return jsonOk({ company: companyPublic(company) }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid company payload", {
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
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const slug = url.searchParams.get("slug");

    if (id) {
      const company = await getCompanyById(id);
      const db = getSupabaseAdmin();
      const { data: sources } = await db
        .from("knowledge_sources")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });

      return jsonOk({
        company: companyPublic(company),
        knowledgeSources: (sources ?? []).map((s) =>
          sourceToPublic(s as Parameters<typeof sourceToPublic>[0]),
        ),
      });
    }

    if (slug) {
      const company = await getCompanyBySlug(slug);
      return jsonOk({ company: companyPublic(company) });
    }

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new ApiError("INTERNAL_ERROR", error.message, { status: 500 });
    return jsonOk({
      companies: (data ?? []).map((c) => companyPublic(c as Parameters<typeof companyPublic>[0])),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
