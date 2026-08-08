import type { SessionUser } from "../types";
import { getSupabase } from "./supabase";

/**
 * Resolve the current user from an Authorization bearer token.
 * Returns null when unauthenticated.
 */
export async function getSessionUser(authHeader: string | null): Promise<SessionUser | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return null;

  return { id: data.user.id, email: data.user.email };
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
