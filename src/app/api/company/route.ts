import { z } from "zod";
import { PERSONAS, personaForSlug } from "@/lib/personas";
import { companyPublic, createCompany, getCompanyById, getCompanyBySlug } from "@/lib/server/company-context";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sourceToPublic } from "@/lib/server/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A company slug is also a subdomain (acme.grokfde.com), so anything the router
 * or the platform already claims can never be handed to a company.
 */
const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "onboarding",
  "knowledge",
  "conversations",
  "accounts",
  "agent",
  "demos",
  "field-signals",
  "login",
  "signup",
  "book",
  "fde",
  "static",
  "assets",
  "cdn",
  "mail",
  "email",
  "status",
  "support",
  "help",
  "docs",
  "blog",
  "site-not-found",
]);

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  // Optional on purpose. Onboarding asks for one thing, the company name, and
  // the slug is derived from it here so a person never has to invent a URL.
  slug: z.string().trim().optional(),
  agentName: z.string().trim().optional(),
  agentVoice: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

/** "Acme Infrastructure, Inc." becomes "acme-infrastructure-inc". */
export function slugifyCompanyName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/**
 * Picks a slug nobody is using. A duplicate company name is a completely normal
 * thing to type, and it must never be the reason onboarding dies at the last
 * step, so the collision is resolved here instead of thrown at the person.
 */
async function pickAvailableSlug(base: string): Promise<string> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("companies")
    .select("slug")
    .like("slug", `${base}%`);

  if (error) {
    throw new ApiError("DATABASE_ERROR", "Could not reach the company database", {
      status: 503,
      details: error.message,
    });
  }

  const taken = new Set((data ?? []).map((row) => String((row as { slug: string }).slug)));
  for (const reserved of RESERVED_SLUGS) taken.add(reserved);

  if (!taken.has(base)) return base;
  for (let n = 2; n < 200; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json());

    const base =
      slugifyCompanyName(body.slug || body.name) || `company-${Date.now().toString(36)}`;

    // Two people can submit the same company name in the same second. The unique
    // index is the real arbiter, so a lost race retries with the next free slug
    // rather than surfacing a 409 the person cannot act on.
    let lastConflict: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = await pickAvailableSlug(base);
      // Every company used to be created as "Atlas" with the voice "eve", which is
      // female, so every customer got the same engineer AND a name that did not
      // match the voice. The persona is a coherent tuple, chosen from the slug so
      // two companies that never pick anything still meet different engineers.
      const persona = personaForSlug(slug);
      const chosenName = body.agentName?.trim() || persona.name;
      // A typed name keeps its own voice only if it IS a persona; otherwise it
      // borrows this persona's voice so name and voice can never drift apart.
      const namedPersona = PERSONAS.find(
        (p) => p.name.toLowerCase() === chosenName.toLowerCase(),
      );
      try {
        const company = await createCompany({
          ...body,
          slug,
          agentName: chosenName,
          agentVoice: body.agentVoice?.trim() || (namedPersona ?? persona).voice,
        });
        return jsonOk({ company: companyPublic(company) }, 201);
      } catch (err) {
        const isConflict = err instanceof ApiError && err.status === 409;
        if (!isConflict) throw err;
        lastConflict = err;
      }
    }

    throw new ApiError(
      "BAD_REQUEST",
      "That company name is already taken several times over. Add a word to make it unique.",
      { status: 409, details: lastConflict instanceof Error ? lastConflict.message : undefined },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Enter a company name to create your FDE.", {
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
      const { data: sources, error } = await db
        .from("knowledge_sources")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw new ApiError("DATABASE_ERROR", "Could not load this company's knowledge", {
          status: 503,
          details: error.message,
        });
      }

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

    // Oldest first, deliberately.
    //
    // The operator UI takes the first row of this list as the active company when
    // nothing is stored locally, and this used to be newest first. That meant the
    // most recently created company ANYWHERE, including any signup or test row,
    // silently hijacked the console for everyone. There is no user linkage to fix
    // it properly: the companies table has no owner column and company_members
    // cannot be created without DDL privileges on this project. Oldest first is
    // the deterministic, stable fallback, so the answer never changes because a
    // stranger signed up seconds earlier.
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("companies")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new ApiError("INTERNAL_ERROR", error.message, { status: 500 });

    // The canonical workspace leads the list, so the operator console lands on it
    // every time regardless of what anyone else created. Everything after it is
    // oldest first.
    const canonical = process.env.NEXT_PUBLIC_DEMO_COMPANY_SLUG || "grok-fde";
    const rows = (data ?? []) as Array<Parameters<typeof companyPublic>[0]>;
    const ordered = [
      ...rows.filter((c) => c.slug === canonical),
      ...rows.filter((c) => c.slug !== canonical),
    ];

    return jsonOk({ companies: ordered.map((c) => companyPublic(c)) });
  } catch (err) {
    return errorResponse(err);
  }
}
