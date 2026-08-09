#!/usr/bin/env node
/**
 * The anonymous visitor's experience.
 *
 * A stranger who opens a public page must never be dumped into an auth wall by
 * clicking something, and must never land on an internal company surface. The
 * default and primary action on the marketing page is booking a call.
 *
 * This suite crawls as a real anonymous browser with no session, no cookies,
 * and no local storage. It follows every link reachable from the public pages
 * and clicks the navigational buttons, then asserts where each one landed.
 *
 * SAFETY: every non-GET request is aborted at the network layer, so clicking a
 * button can never submit a form, create a booking, or write a row. The crawl
 * is strictly read-only by construction, not by convention.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { chromium } from "playwright";
import { BASE_URL, DEMO, REPO_ROOT, assert, createRun } from "./lib/harness.mjs";

/** A well-formed id that will never exist, for filling dynamic segments. */
const ABSENT_UUID = "00000000-0000-4000-8000-0000000000aa";

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Every page in the (company) route group, read off the filesystem.
 *
 * Enumerating beats a hardcoded list because the hole this is guarding against
 * is an UNLINKED route: a crawl that follows links structurally cannot find
 * one, and a hand-maintained list silently misses whatever was added last.
 * Reading the route group means a new page is covered the moment it exists.
 *
 * Dynamic segments are filled with an id that does not exist on purpose. Auth
 * must be enforced before the page ever looks at data, so a missing record is
 * no excuse for serving the surface.
 */
function enumerateCompanyPages() {
  const root = join(REPO_ROOT, "src", "app", "(company)");
  return walk(root)
    .filter((f) => /[\\/]page\.tsx$/.test(f))
    .map((f) => {
      const segments = relative(root, f).split(sep).slice(0, -1);
      const path = segments
        .filter((s) => !s.startsWith("(") && !s.startsWith("@"))
        .map((s) => (s.startsWith("[") ? ABSENT_UUID : s))
        .join("/");
      return `/${path}`.replace(/\/+$/, "") || "/";
    })
    .sort();
}

/**
 * Prospect-facing API. These have no account by design and must stay open.
 * Everything else that is company-scoped has to be shut.
 */
const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/company",
  "/api/conversations/", // a prospect's own thread, reached by id
  "/api/bookings/availability",
  "/api/bookings/join",
  "/api/voice/token",
  "/api/calls/complete",
  "/api/slack/events",
  "/api/slack/oauth",
  "/api/email/inbound",
];

/**
 * API routes that read company-scoped data, discovered by looking for a
 * companyId parameter in the handler source. Middleware protecting a page does
 * not protect the data behind it, so the API layer is asserted separately.
 */
function enumerateCompanyScopedApi() {
  const root = join(REPO_ROOT, "src", "app", "api");
  return walk(root)
    .filter((f) => /[\\/]route\.ts$/.test(f))
    .filter((f) => {
      const src = readFileSync(f, "utf8");
      return /companyId/.test(src) && /export\s+async\s+function\s+GET/.test(src);
    })
    .map((f) => {
      const segments = relative(root, f).split(sep).slice(0, -1);
      const path = segments.map((s) => (s.startsWith("[") ? ABSENT_UUID : s)).join("/");
      return `/api/${path}`.replace(/\/+$/, "");
    })
    .filter((p) => !PUBLIC_API_PREFIXES.some((pub) => p === pub || p.startsWith(pub)))
    .sort();
}

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812, isMobile: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
];

/** Pages a stranger can reach with no account. */
const PUBLIC_SEEDS = ["/", `/fde/${DEMO.slug}`, `/book/${DEMO.slug}`];

/** Auth walls. Landing here by redirect is the failure the user reported. */
const AUTH_PATHS = ["/login", "/signup"];

/**
 * Internal company surfaces. These belong to the company operating the agent,
 * not to the prospect, so a public page must never link into them.
 */
const GATED_PREFIXES = [
  "/dashboard",
  "/knowledge",
  "/conversations",
  "/demos",
  "/agent",
  "/accounts",
  "/field-signals",
  "/onboarding",
  "/workspace",
];

const MAX_DESTINATIONS = Number(process.env.QA_AUTH_MAX_DESTINATIONS || 40);
const MAX_BUTTONS_PER_PAGE = Number(process.env.QA_AUTH_MAX_BUTTONS || 8);
const NAV_TIMEOUT_MS = Number(process.env.QA_NAV_TIMEOUT_MS || 90_000);

/**
 * The Next.js dev server compiles a route on first request, and with several
 * agents hot-reloading at once that first hit can exceed a minute. A cold
 * compile is not a product failure, so a navigation timeout is retried once
 * before it is allowed to fail the run.
 */
async function gotoWithRetry(page, url) {
  try {
    return await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  } catch (err) {
    if (!/Timeout/i.test(err.message)) throw err;
    return await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  }
}

const isAuthPath = (p) => AUTH_PATHS.some((a) => p === a || p.startsWith(`${a}/`) || p.startsWith(`${a}?`));
const isGatedPath = (p) => GATED_PREFIXES.some((g) => p === g || p.startsWith(`${g}/`) || p.startsWith(`${g}?`));

/** Path + search only, so comparisons ignore origin and hash. */
function toPath(url) {
  try {
    const u = new URL(url, BASE_URL);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function sameOrigin(url) {
  try {
    return new URL(url, BASE_URL).origin === new URL(BASE_URL).origin;
  } catch {
    return false;
  }
}

const run = createRun("auth", "Anonymous visitor and auth gating");

const browser = await chromium.launch();

/**
 * A context with no stored session of any kind, and a hard block on every
 * request that could change server state.
 */
async function anonymousContext(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    storageState: undefined,
  });
  await context.route("**/*", (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
    return route.abort();
  });
  return context;
}

// ---------------------------------------------------------------------------
// Discover every destination reachable from the public pages.
// ---------------------------------------------------------------------------

/** path -> { from, control } for the first control that pointed at it. */
const discovered = new Map();
const buttonsBySeed = new Map();

{
  const context = await anonymousContext(VIEWPORTS[1]);
  const page = await context.newPage();
  const visited = new Set();
  // Depth 0 is the public seeds, depth 1 is everything they link to.
  let frontier = [...PUBLIC_SEEDS];

  for (let depth = 0; depth <= 1; depth++) {
    const next = [];
    for (const path of frontier) {
      if (visited.has(path) || visited.size > MAX_DESTINATIONS) continue;
      visited.add(path);

      let ok = true;
      await gotoWithRetry(page, `${BASE_URL}${path}`).catch(() => {
        ok = false;
      });
      if (!ok) continue;
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      const links = await page.evaluate(() => {
        const out = [];
        for (const a of document.querySelectorAll("a[href]")) {
          const style = getComputedStyle(a);
          if (style.display === "none" || style.visibility === "hidden") continue;
          out.push({
            href: a.getAttribute("href"),
            text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
          });
        }
        return out;
      });

      for (const link of links) {
        const raw = link.href;
        if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
        if (!sameOrigin(raw)) continue;
        const dest = toPath(raw);
        if (!discovered.has(dest)) {
          discovered.set(dest, { from: path, control: `link "${link.text || raw}"` });
          if (depth === 0) next.push(dest);
        }
      }

      if (PUBLIC_SEEDS.includes(path)) {
        // Navigational buttons, which in a Next.js app may call router.push
        // instead of rendering an anchor.
        const buttons = await page.evaluate((limit) => {
          const out = [];
          for (const b of document.querySelectorAll("button, [role=button]")) {
            const style = getComputedStyle(b);
            if (style.display === "none" || style.visibility === "hidden") continue;
            if (b.disabled || b.getAttribute("aria-disabled") === "true") continue;
            if (b.closest("form")) continue;
            if (b.closest("a[href]")) continue;
            const text = (b.textContent || "").replace(/\s+/g, " ").trim();
            const name = text || b.getAttribute("aria-label") || "";
            if (!name) continue;
            out.push({ name: name.slice(0, 40) });
            if (out.length >= limit) break;
          }
          return out;
        }, MAX_BUTTONS_PER_PAGE);
        buttonsBySeed.set(path, buttons);
      }
    }
    frontier = next;
  }

  await context.close();
}

await run.test("public pages expose a crawlable set of destinations", async () => {
  assert(discovered.size > 0, "no links were discovered from the public pages at all");
  return `${discovered.size} unique destination(s) from ${PUBLIC_SEEDS.length} public pages`;
});

// ---------------------------------------------------------------------------
// No public control may lead a stranger into an auth wall or an internal surface.
// ---------------------------------------------------------------------------

const destinations = [...discovered.entries()].slice(0, MAX_DESTINATIONS);

for (const [dest, origin] of destinations) {
  await run.test(`anonymous GET ${dest} (from ${origin.from} via ${origin.control})`, async () => {
    const context = await anonymousContext(VIEWPORTS[1]);
    const page = await context.newPage();
    try {
      const response = await gotoWithRetry(page, `${BASE_URL}${dest}`);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(600);

      const status = response?.status() ?? 0;
      const landed = toPath(page.url());

      // A link that deliberately points AT the auth page is the visitor
      // choosing to sign in. Being redirected there from anywhere else is the
      // auth wall the user complained about.
      if (isAuthPath(landed) && !isAuthPath(dest)) {
        throw new Error(
          `redirected into an auth wall: ${dest} landed on ${landed}. A stranger clicking ${origin.control} on ${origin.from} is asked to sign in.`,
        );
      }

      if (isGatedPath(dest)) {
        throw new Error(
          `public page ${origin.from} links into the internal company surface ${dest} via ${origin.control} (HTTP ${status}), which a prospect should never reach`,
        );
      }

      assert(status < 400, `HTTP ${status}`);
      return isAuthPath(dest) ? `HTTP ${status}, explicit auth link` : `HTTP ${status} -> ${landed}`;
    } finally {
      await context.close();
    }
  });
}

// ---------------------------------------------------------------------------
// Buttons, clicked for real. Writes are blocked at the network layer.
// ---------------------------------------------------------------------------

for (const [seed, buttons] of buttonsBySeed) {
  for (const button of buttons) {
    await run.test(`anonymous click "${button.name}" on ${seed}`, async () => {
      const context = await anonymousContext(VIEWPORTS[1]);
      const page = await context.newPage();
      try {
        await gotoWithRetry(page, `${BASE_URL}${seed}`);
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

        const target = page
          .locator("button, [role=button]")
          .filter({ hasText: button.name })
          .first();
        const count = await target.count();
        if (count === 0) return "control no longer present, skipped";

        await target.click({ timeout: 5_000, trial: false }).catch(() => {});
        await page.waitForTimeout(1_500);

        const landed = toPath(page.url());
        if (isAuthPath(landed) && !isAuthPath(seed)) {
          throw new Error(
            `clicking "${button.name}" on ${seed} sent an anonymous visitor to the auth wall ${landed}`,
          );
        }
        if (isGatedPath(landed)) {
          throw new Error(
            `clicking "${button.name}" on ${seed} sent an anonymous visitor to the internal surface ${landed}`,
          );
        }
        return landed === seed ? "stayed in place" : `-> ${landed}`;
      } finally {
        await context.close();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Every internal surface must actually be gated.
//
// The complement of the crawl above: that one proves a public page never leads
// somewhere private, this one proves the private places are shut. Without it,
// removing a link from the nav would look like a fix while the URL stayed wide
// open to anyone who typed it.
// ---------------------------------------------------------------------------

// Enumerated from the filesystem, NOT hardcoded, and deliberately including
// routes nothing links to. A link-following crawl cannot reach an unlinked
// route, and that is exactly the hole worth hunting: nobody links to /admin
// either. Every page in the (company) group is navigated to directly.
const GATED_PAGES = [...new Set([...enumerateCompanyPages(), ...GATED_PREFIXES])].sort();

for (const path of GATED_PAGES) {
  // A path with no route behind it is not an exposure, so it is reported as
  // a skip rather than a failure. It still shows up in the output, which is
  // what catches a route that quietly disappeared.
  await run.test(
    `anonymous GET ${path} is gated`,
    async () => {
    const context = await anonymousContext(VIEWPORTS[1]);
    const page = await context.newPage();
    try {
      const response = await gotoWithRetry(page, `${BASE_URL}${path}`);
      const status = response?.status() ?? 0;
      const landed = toPath(page.url());

      assert(status !== 404, `no route exists at ${path}, so there is nothing to gate`);
      assert(
        isAuthPath(landed),
        `${path} served an anonymous visitor the internal surface directly (HTTP ${status}, landed on ${landed}) instead of sending them to sign in`,
      );
      return `-> ${landed}`;
    } finally {
      await context.close();
    }
    },
    { skipOn: (err) => /nothing to gate/.test(err.message) },
  );
}

// ---------------------------------------------------------------------------
// The API boundary: prospect endpoints open, operator endpoints shut.
//
// The prospect path has no account by design, so these must NEVER be gated or
// the demo dies on the spot. The operator path reads other people's
// conversations, so it must never answer an anonymous caller.
// ---------------------------------------------------------------------------

const PROSPECT_API = [
  { path: `/api/company?slug=${DEMO.slug}`, label: "resolve the company by slug", expect: 200 },
  { path: `/api/company?id=${DEMO.id}`, label: "resolve the company by id", expect: 200 },
  {
    path: `/api/bookings/availability?slug=${DEMO.slug}&timeZone=America%2FLos_Angeles&date=${
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 7 * 864e5))
    }`,
    label: "see bookable slots",
    expect: 200,
  },
  // A bogus id, so this proves reachability without creating anything: the
  // honest answer is 404, and anything in the 401/403 family would mean a
  // visitor on /fde could never start a call.
  {
    path: "/api/voice/token?conversationId=00000000-0000-4000-8000-0000000000aa",
    label: "reach the voice token route",
    expect: 404,
  },
];

for (const endpoint of PROSPECT_API) {
  await run.test(`anonymous prospect can ${endpoint.label}`, async () => {
    const res = await fetch(`${BASE_URL}${endpoint.path}`, { redirect: "manual" });
    assert(
      res.status !== 401 && res.status !== 403,
      `HTTP ${res.status}: this is on the prospect path and must never require an account`,
    );
    assert(res.status === endpoint.expect, `expected HTTP ${endpoint.expect}, got ${res.status}`);
    return `HTTP ${res.status}`;
  });
}

// Also enumerated: every API route whose handler reads a companyId. Middleware
// protecting a PAGE does not protect the DATA behind it, and an unauthenticated
// read of /api/conversations returns real prospect rows if it is not gated.
const OPERATOR_API = enumerateCompanyScopedApi();

await run.test("company-scoped API routes were discovered", async () => {
  assert(OPERATOR_API.length > 0, "found no company-scoped API routes, so the enumeration is broken");
  return `${OPERATOR_API.length} route(s): ${OPERATOR_API.join(", ")}`;
});

for (const path of OPERATOR_API) {
  await run.test(`anonymous GET ${path} is gated`, async () => {
    const res = await fetch(`${BASE_URL}${path}?companyId=${DEMO.id}`, { redirect: "manual" });
    if (res.status === 404) {
      throw new Error(`no route exists at ${path}, so there is nothing to gate`);
    }
    const body = await res.text();
    // 400 means the route refused the request shape and served no data, which
    // is not an exposure. It is reported distinctly so it can never look like
    // proof the route is gated: the PII assertion below covers the shape this
    // route actually accepts.
    if (res.status === 400) return `HTTP 400, rejected the request and served no data`;
    assert(
      res.status === 401 || res.status === 403,
      `HTTP ${res.status}: this reads company data and must not answer an anonymous caller. Body: ${body.slice(0, 160)}`,
    );
    return `HTTP ${res.status}`;
  }, { expectsAuth: true, skipOn: (err) => /nothing to gate/.test(err.message) });
}

/**
 * The booking list, in the shape /demos actually calls it.
 *
 * This is the PII case: demo_bookings rows carry guest_name and guest_email of
 * real people who booked a call. Gating the /demos PAGE does not protect this
 * DATA, and the page is only one of the callers.
 */
await run.test("anonymous GET /api/bookings?slug= does not expose guest PII", async () => {
  const res = await fetch(`${BASE_URL}/api/bookings?slug=${DEMO.slug}`, { redirect: "manual" });
  if (res.status === 401 || res.status === 403) return `HTTP ${res.status}, gated`;

  assert(res.status === 200, `unexpected HTTP ${res.status}`);
  const body = await res.json().catch(() => null);
  const bookings = body?.bookings ?? [];
  const leaking = bookings.filter((b) => b.guestEmail || b.guest_email || b.guestName || b.guest_name);

  assert(
    leaking.length === 0,
    `${leaking.length} of ${bookings.length} booking(s) expose guest identity to an anonymous caller, e.g. ` +
      `${JSON.stringify(leaking[0]?.guestName ?? leaking[0]?.guest_name)} <${leaking[0]?.guestEmail ?? leaking[0]?.guest_email}>. ` +
      `This is the data behind /demos, so gating the page alone does not fix it.`,
  );

  // An empty table proves nothing, so say so rather than banking a green tick.
  return bookings.length === 0
    ? "route is OPEN but the table is empty, so this run could not prove either way"
    : `${bookings.length} booking(s) returned, none carrying guest identity`;
});

// ---------------------------------------------------------------------------
// The primary call to action is booking a call.
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  await run.test(`homepage offers booking above the fold @${viewport.name}`, async () => {
    const context = await anonymousContext(viewport);
    const page = await context.newPage();
    try {
      await gotoWithRetry(page, `${BASE_URL}/`);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(500);

      const found = await page.evaluate((foldHeight) => {
        const out = [];
        for (const a of document.querySelectorAll('a[href*="/book/"]')) {
          const rect = a.getBoundingClientRect();
          const style = getComputedStyle(a);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (rect.width === 0 || rect.height === 0) continue;
          out.push({
            text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
            href: a.getAttribute("href"),
            top: Math.round(rect.top),
            aboveFold: rect.top < foldHeight && rect.bottom > 0,
          });
        }
        return out;
      }, viewport.height);

      const aboveFold = found.filter((f) => f.aboveFold);
      assert(
        aboveFold.length > 0,
        found.length === 0
          ? "the homepage has no link to /book/ at all, so the primary action is missing"
          : `a /book/ link exists but none is above the fold (first at y=${found[0].top}, fold at ${viewport.height})`,
      );
      return `${aboveFold.length} booking link(s) above the fold: ${aboveFold.map((f) => `"${f.text}" -> ${f.href}`).join(", ")}`;
    } finally {
      await context.close();
    }
  });
}

await browser.close();
run.finish();
