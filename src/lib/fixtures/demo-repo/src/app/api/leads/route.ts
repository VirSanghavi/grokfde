import { z } from "zod";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const LeadSchema = z.object({
  email: z.string().email(),
  company: z.string().min(1),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser(req.headers.get("authorization"));
  if (!user) return unauthorized();

  const body = LeadSchema.parse(await req.json());
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      email: body.email,
      company: body.company,
      notes: body.notes ?? null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ lead: data }, { status: 201 });
}

export async function GET(req: Request) {
  const user = await getSessionUser(req.headers.get("authorization"));
  if (!user) return unauthorized();

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ leads: data ?? [] });
}
