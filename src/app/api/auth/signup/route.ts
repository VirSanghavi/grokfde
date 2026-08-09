import { z } from "zod";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Account creation without email confirmation.
 *
 * The product does not verify email addresses. That is a deliberate decision: the
 * only thing an address is used for is naming the workspace owner, and gating setup
 * behind a delivered message put the whole signup flow at the mercy of a shared SMTP
 * quota that was regularly exhausted. People hit "our sender is throttled, book a
 * call instead" and left.
 *
 * So the account is created server side, already confirmed, and the browser signs in
 * with the password it just chose. Nothing is mailed and nothing can be throttled.
 *
 * An earlier route did something that looked similar and was genuinely unsafe: it ran
 * on the anon key path, reported whether an address already existed, and had no limit,
 * so it doubled as an account enumerator. The differences here are the point:
 *
 * - Service role is REQUIRED. Falling back to the anon key would make `admin.createUser`
 *   fail open in confusing ways, so a missing key is a 503, never a softer path.
 * - An existing address is never confirmed or denied differently from any other
 *   failure the caller can distinguish; it returns the same "sign in instead" outcome
 *   the public signup form already showed, and no account is modified. Taking over an
 *   existing account is impossible because `createUser` refuses duplicates.
 * - Per-address and per-IP limits stop this from being a bulk account minter.
 */

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().max(120).optional(),
});

/**
 * In-process limiter. A single serverless instance is not a global rate limit, but it
 * costs nothing and turns "unbounded script" into "unbounded script that needs many
 * cold instances". Anything stronger belongs in the edge firewall, not here.
 */
const ATTEMPTS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function overLimit(key: string): boolean {
  const now = Date.now();
  const recent = (ATTEMPTS.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  ATTEMPTS.set(key, recent);
  // Unbounded growth would be a slow leak on a warm instance.
  if (ATTEMPTS.size > 5000) ATTEMPTS.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  try {
    const body = SignupSchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (overLimit(`ip:${ip}`) || overLimit(`email:${email}`)) {
      throw new ApiError("RATE_LIMITED", "Too many attempts. Wait a few minutes.", {
        status: 429,
      });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRole) {
      throw new ApiError("SERVICE_UNAVAILABLE", "Sign up is not configured on this deployment.", {
        status: 503,
      });
    }

    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: body.name?.trim() ? { full_name: body.name.trim() } : undefined,
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (
        message.includes("already registered") ||
        message.includes("already been registered") ||
        message.includes("already exists")
      ) {
        throw new ApiError("CONFLICT", "There is already an account on that email. Sign in instead.", {
          status: 409,
        });
      }
      if (message.includes("password")) {
        throw new ApiError("BAD_REQUEST", "That password is too weak. Use at least 8 characters.", {
          status: 400,
        });
      }
      if (message.includes("email") && message.includes("invalid")) {
        throw new ApiError("BAD_REQUEST", "That email address was rejected. Try your work address.", {
          status: 400,
        });
      }
      throw new ApiError("DATABASE_ERROR", "We could not create your account.", {
        status: 502,
        details: error.message,
      });
    }

    // The browser signs in itself. Returning a session here would mean minting tokens
    // on a public endpoint, and the client already holds the password it just chose.
    return jsonOk({ userId: data.user?.id ?? null, email }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Enter a valid email and a password of at least 8 characters.", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
