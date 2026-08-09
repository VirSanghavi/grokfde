import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs, in this order.
 *
 * 1. Subdomain routing. A company shares exactly one link, acme.grokfde.com, and
 *    that host serves that company's prospect experience with no account and no
 *    visible /fde/acme path. The rewrite is invisible: the address bar keeps
 *    saying acme.grokfde.com, which is the whole point of the link.
 * 2. Auth. Unchanged behaviour for the apex and for localhost.
 *
 * Note on the filename: Next 16 renamed this convention to proxy.ts and marked
 * middleware.ts deprecated. The behaviour is identical, and the rename is left
 * as a separate change so it does not collide with concurrent work.
 */

/** Every operator surface. Anonymous visitors are sent to /login. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/knowledge",
  "/conversations",
  "/agent",
  "/accounts",
  "/field-signals",
  "/demos",
  "/onboarding",
  // Added with the routes themselves. A new operator page that is not on this
  // list answers 200 to a stranger and shows real customer data, which is
  // exactly how the console was left open once already.
  "/overview",
  "/threads",
  "/meet",
  "/deployments",
];

/**
 * Company-scoped API routes. Gating pages does not protect data: an anonymous
 * GET /api/conversations?companyId=... returned real prospect rows. These now
 * require a session.
 *
 * Everything not listed here stays open on purpose, because a prospect has no
 * account and must never hit an auth wall: /api/company, /api/bookings/**,
 * /api/voice/token, /api/health, /api/conversations/<id>/** (the prospect's own
 * chat), and POST /api/conversations, which is how a prospect session starts.
 */
const PROTECTED_API_PREFIXES = [
  "/api/knowledge",
  "/api/mcp",
  "/api/escalations",
  "/api/field-signals",
  "/api/accounts",
  "/api/workspaces",
  "/api/implementation-runs",
  "/api/prospects",
  "/api/demo",
  "/api/email",
  "/api/assets",
  // Operator-only, and the most sensitive of the set. These act as the connected
  // GitHub account: /api/github/repos returns every repository that account can
  // see, private ones included (43 repos, 31 private, when a token is present).
  // It is only harmless today because production has no GITHUB_TOKEN; the moment
  // one is set so the GitHub features work in production, an open endpoint would
  // publish the whole private repo list to anyone who asked.
  "/api/github",
];
// Deliberately NOT protected: /api/bookings/join/<token>. A guest who booked a call
// has no account by design, and the unguessable join token IS their credential.
// Gating it would lock every booked prospect out of their own meeting.

function isProtectedApi(path: string, method: string): boolean {
  if (PROTECTED_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }
  // The conversations LIST is an operator view. Creating one, and everything
  // under a specific conversation, is the prospect's own chat and stays open.
  return path === "/api/conversations" && method === "GET";
}

/**
 * Hosts that belong to the platform, never to a company. `www` is the marketing
 * site, `app` and `admin` are the console, `api` is the API surface.
 */
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "staging",
  "preview",
  "mail",
  "email",
  "cdn",
  "assets",
  "static",
  "status",
]);

/** Paths that only make sense on the console host, never on a company link. */
const CONSOLE_PREFIXES = [
  "/dashboard",
  "/knowledge",
  "/conversations",
  "/agent",
  "/accounts",
  "/field-signals",
  "/onboarding",
  "/demos",
  "/overview",
  "/threads",
  "/meet",
  "/deployments",
  "/login",
  "/signup",
];

const SUBDOMAIN_HEADER = "x-company-subdomain";

/**
 * Resolves the company label in front of the root domain, or null when this host
 * is not a company link.
 *
 * Returns null for: bare localhost and loopback (development must behave exactly
 * as it did before), raw IPs, Vercel preview hosts, the apex domain itself, and
 * anything reserved. `acme.localhost:3000` is honoured so the whole path can be
 * exercised locally without touching DNS.
 */
export function companySubdomain(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0]!.trim().toLowerCase();
  if (!host) return null;
  // A host with anything unexpected in it is not a company link. Never try to
  // read a slug out of a malformed Host header.
  if (!/^[a-z0-9.-]+$/.test(host)) return null;

  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return null;
  if (host === "::1" || host === "[::1]") return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (host.endsWith(".vercel.app")) return null;

  let label: string;
  if (host.endsWith(".localhost")) {
    label = host.slice(0, -".localhost".length);
  } else {
    const parts = host.split(".");
    // apex (grokfde.com) has two labels and is the marketing homepage.
    if (parts.length < 3) return null;
    label = parts.slice(0, parts.length - 2).join(".");
  }

  // Only a single label is a company. `a.b.grokfde.com` is not a company link.
  if (!label || label.includes(".")) return null;
  if (RESERVED_SUBDOMAINS.has(label)) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(label)) return null;

  return label;
}

/** The console host for a given company host: acme.grokfde.com to grokfde.com. */
function rootHost(hostHeader: string): string {
  const [hostname, port] = hostHeader.split(":");
  const host = (hostname ?? "").toLowerCase();
  const root = host.endsWith(".localhost")
    ? "localhost"
    : host.split(".").slice(-2).join(".");
  return port ? `${root}:${port}` : root;
}

/**
 * Does a company own this slug? Answered straight from PostgREST rather than
 * through our own API so a company link costs one request, not two.
 *
 * Cached in module memory for a minute. A middleware instance handles many
 * requests, so this keeps a shared link from becoming a database read per hit,
 * and one minute is short enough that a company created during the demo shows up
 * while you are still talking.
 */
const slugCache = new Map<string, { exists: boolean; at: number }>();
const SLUG_TTL_MS = 60_000;

async function companyExists(slug: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cached = slugCache.get(slug);
  if (cached && Date.now() - cached.at < SLUG_TTL_MS) return cached.exists;

  try {
    const res = await fetch(
      `${url}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=slug&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    const exists = Array.isArray(rows) && rows.length > 0;
    slugCache.set(slug, { exists, at: Date.now() });
    return exists;
  } catch {
    // A lookup failure is not proof the company is missing, and telling a real
    // prospect "no such site" because our database blinked is the worst possible
    // answer. Unknown means: carry on and let the page show its own error state.
    return null;
  }
}

/**
 * Maps a path on a company host onto the real route.
 *   /            -> /fde/acme
 *   /p/<id>      -> /fde/acme/p/<id>      (a returning prospect's own thread)
 *   /book...     -> /book/acme...         (the booking flow)
 */
function subdomainRewrite(slug: string, path: string): string | null {
  if (path === "/" || path === "") return `/fde/${slug}`;
  if (path === "/p" || path.startsWith("/p/")) {
    return `/fde/${slug}${path}`;
  }
  if (path === "/book" || path.startsWith("/book/")) {
    const rest = path.slice("/book".length);
    return `/book/${slug}${rest}`;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const slug = companySubdomain(host);
  const path = request.nextUrl.pathname;

  // A company host must not become a way around the API gate, so gated API calls
  // skip subdomain handling entirely and fall through to the session check.
  if (slug && !isProtectedApi(path, request.method)) {
    // The console never answers on a company link. Send it to the apex instead of
    // 404ing, so a bookmark still lands somewhere real.
    if (CONSOLE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      // Built from the root host rather than cloned, so the dev server's port
      // cannot leak into a production redirect.
      const root = rootHost(host!);
      const scheme = root.startsWith("localhost") ? "http" : "https";
      return NextResponse.redirect(
        new URL(`${scheme}://${root}${path}${request.nextUrl.search}`),
      );
    }

    const known = await companyExists(slug);
    if (known === false) {
      const notFound = request.nextUrl.clone();
      notFound.pathname = "/site-not-found";
      notFound.search = "";
      notFound.searchParams.set("host", host ?? slug);
      return NextResponse.rewrite(notFound);
    }

    const rewritten = subdomainRewrite(slug, path);
    if (rewritten) {
      const target = request.nextUrl.clone();
      target.pathname = rewritten;
      const response = NextResponse.rewrite(target);
      response.headers.set(SUBDOMAIN_HEADER, slug);
      return response;
    }

    // Anything else on a company host (assets, unknown paths) passes through.
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthPage = path.startsWith("/login") || path.startsWith("/signup");
  const gatedApi = isProtectedApi(path, request.method);

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Nothing here needs a session, so do not pay for one. This keeps the
  // marketing page and the whole prospect experience off the auth path.
  if (!isProtected && !isAuthPage && !gatedApi) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Auth optional when Supabase not configured (local API-only demos)
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // A thrown auth call here would take down every page at once, including the
  // marketing homepage and the prospect chat, neither of which needs a session.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ? { id: data.user.id } : null;
  } catch {
    user = null;
  }

  // An API caller gets a JSON 401 with a sentence, never an HTML login page.
  if (gatedApi && !user) {
    return Response.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in to your workspace to read this.",
          recoverable: true,
        },
      },
      { status: 401 },
    );
  }

  // Always enforced. This used to be opt-in behind REQUIRE_AUTH, which was never
  // set, so the entire operator console answered 200 to a stranger: /dashboard,
  // /conversations, /knowledge, /demos, /field-signals, /agent. The marketing nav
  // linked straight into it. A flag that defaults to "wide open" is not a gate.
  //
  // The public surfaces stay public and are simply not in PROTECTED_PREFIXES:
  // /, /fde/**, /book/**, and every company subdomain, which returns above this
  // block before any session is looked at.
  if (isProtected && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    redirect.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(redirect);
  }

  if (isAuthPage && user) {
    const redirect = request.nextUrl.clone();
    // Honour where they were heading. Without this, someone bounced to /login on
    // the way to /onboarding lands on /dashboard, which they have no company for.
    const next = request.nextUrl.searchParams.get("next");
    const safeNext =
      next &&
      next.startsWith("/") &&
      !next.startsWith("//") &&
      !next.startsWith("/login") &&
      !next.startsWith("/signup")
        ? next
        : "/dashboard";
    const [nextPath, nextQuery] = safeNext.split("?");
    redirect.pathname = nextPath!;
    redirect.search = nextQuery ? `?${nextQuery}` : "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  // /api is deliberately INSIDE the matcher now. Excluding it is what left the
  // company-scoped endpoints readable by anyone.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|ico|woff2?)$).*)",
  ],
};
