#!/usr/bin/env node
/**
 * Page route tests, at the HTTP level.
 *
 * Every user-facing route under src/app must return 200 (or a redirect that
 * lands on a 200), serve a real HTML document, and contain no placeholder
 * leakage or rendered error text.
 *
 * Several routes are client components that ship a shell and fetch their data
 * in the browser, so "did it actually render something a human can read" is not
 * answerable from the HTML payload. That assertion lives in browser.mjs, which
 * runs a real browser. This suite owns what HTTP can prove, and says so.
 *
 * Read-only: this suite creates nothing and deletes nothing.
 */
import {
  DEMO,
  RUN_ID,
  assert,
  assertEqual,
  assertOneOf,
  createRun,
  findPlaceholders,
  request,
} from "./lib/harness.mjs";

const run = createRun("routes", "Page routes (HTTP)");

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve real ids so dynamic routes are tested against real URLs. */
async function resolveFixtures() {
  const out = {};
  const conversations = await request(`/api/conversations?companyId=${DEMO.id}`);
  if (conversations.status === 200 && conversations.json?.conversations?.length) {
    const withProspect =
      conversations.json.conversations.find((c) => c.prospectId) ?? conversations.json.conversations[0];
    out.conversationId = withProspect.id;
    out.prospectId = withProspect.prospectId;
  }
  const bookings = await request(`/api/bookings?slug=${DEMO.slug}`);
  if (bookings.status === 200 && bookings.json?.bookings?.length) {
    const booking = bookings.json.bookings[0];
    out.bookingId = booking.id;
    out.joinToken = booking.joinToken || booking.join_token;
  }
  return out;
}

const fx = await resolveFixtures();

const routes = [
  {
    path: "/",
    label: "marketing home",
    // DEMO-STATE.md, "do not regress": the homepage CTAs must point at the
    // real demo company. A slug with no company row is what produced the
    // original "Company not found" crash.
    containsRaw: [`/book/${DEMO.slug}`, `/fde/${DEMO.slug}`],
  },
  { path: "/book", label: "booking index", expectRedirectTo: `/book/${DEMO.slug}` },
  { path: `/book/${DEMO.slug}`, label: "booking page", containsRaw: ["Grok FDE"] },
  { path: `/fde/${DEMO.slug}`, label: "prospect FDE room" },
  { path: "/login", label: "login" },
  { path: "/signup", label: "signup" },
];

if (fx.conversationId) {
  routes.push(
    { path: `/conversations/${fx.conversationId}`, label: "conversation detail" },
    { path: `/conversations/${fx.conversationId}/workspace`, label: "conversation workspace" },
  );
} else {
  run.skip("GET /conversations/:id", "no conversation exists for the demo company yet");
}

if (fx.prospectId) {
  routes.push(
    { path: `/accounts/${fx.prospectId}`, label: "account detail" },
    { path: `/fde/${DEMO.slug}/p/${fx.prospectId}`, label: "prospect-scoped FDE room" },
  );
} else {
  run.skip("GET /accounts/:id", "no prospect exists for the demo company yet");
}

if (fx.bookingId) {
  routes.push({ path: `/book/${DEMO.slug}/c/${fx.bookingId}`, label: "booking confirmation" });
} else {
  run.skip("GET /book/:slug/c/:id", "no booking exists for the demo company yet");
}

if (fx.joinToken) {
  routes.push({ path: `/book/${DEMO.slug}/join/${fx.joinToken}`, label: "booking join page" });
} else {
  run.skip("GET /book/:slug/join/:token", "no booking join token available");
}

for (const route of routes) {
  await run.test(`GET ${route.path} - ${route.label}`, async () => {
    let res = await request(route.path, { timeoutMs: 60_000 });
    let via = "";

    if (route.expectRedirectTo) {
      assertOneOf(res.status, [301, 302, 307, 308], "redirect status");
      const redirectStatus = res.status;
      const location = res.headers.get("location");
      assertEqual(location, route.expectRedirectTo, "redirect location");
      res = await request(location, { timeoutMs: 60_000 });
      via = ` (via ${redirectStatus} redirect to ${location})`;
    }

    assertEqual(res.status, 200, "status");
    assert(res.contentType.includes("text/html"), `expected an HTML page, got content-type "${res.contentType}"`);
    assert(
      res.text.length > 1500,
      `document is only ${res.text.length} bytes, which is too small to be a real page`,
    );

    for (const needle of route.containsRaw || []) {
      assert(res.text.includes(needle), `page HTML does not contain "${needle}"`);
    }

    const text = visibleText(res.text);
    for (const bad of ["Company not found", "Application error", "Unhandled Runtime Error", "Internal Server Error"]) {
      assert(!text.includes(bad), `page renders the error text "${bad}"`);
    }

    const placeholders = findPlaceholders(res.text);
    assert(placeholders.length === 0, `placeholder leakage: ${placeholders.join(" | ")}`);

    // "Prospect" standing in for a real person's name is what the junk rows in
    // the database look like. A table header saying Prospect is legitimate, so
    // only an element whose entire content is the bare word is a finding.
    const nameHits = [...res.text.matchAll(/>\s*Prospect\s*</g)].length;
    assert(
      nameHits === 0,
      `${nameHits} element(s) render the placeholder name "Prospect" where a real person's name belongs`,
    );

    return `${res.text.length} bytes${via}, ${res.durationMs}ms`;
  });
}

// ---------------------------------------------------------------------------
// Operator surfaces are gated and redirect an anonymous visitor to sign in, so
// they are not rendered above. Asserting the redirect here is nearly free and
// keeps this suite honest about why those pages are absent from its list. The
// anonymous crawl in auth.mjs is what proves nothing public leads to them.
// ---------------------------------------------------------------------------

for (const path of [
  "/dashboard",
  "/onboarding",
  "/demos",
  "/knowledge",
  "/conversations",
  "/agent",
  "/field-signals",
]) {
  await run.test(`GET ${path} - gated, redirects to sign in`, async () => {
    const res = await request(path, { timeoutMs: 30_000 });
    assertOneOf(res.status, [302, 307, 308], "status");
    const location = res.headers.get("location") || "";
    assert(
      /\/login/.test(location),
      `redirects to "${location}" rather than the login page`,
    );
    return `${res.status} -> ${location.replace(/^https?:\/\/[^/]+/, "")}`;
  });
}

// ---------------------------------------------------------------------------
// Unknown company and unknown token must not blow up on the server. Whether
// they show a usable not-found screen is a rendering question, asserted in
// browser.mjs.
// ---------------------------------------------------------------------------

for (const path of [
  `/fde/qa-missing-${RUN_ID}`,
  `/book/qa-missing-${RUN_ID}`,
  `/book/${DEMO.slug}/join/qa-bad-token-${RUN_ID}`,
]) {
  await run.test(`GET ${path} - unknown target is handled server-side`, async () => {
    const res = await request(path, { timeoutMs: 60_000 });
    assert(res.status < 500, `returned HTTP ${res.status}; an unknown slug or token must never be a server error`);
    assertOneOf(res.status, [200, 404], "status");
    const text = visibleText(res.text);
    assert(
      !text.includes("Unhandled Runtime Error") && !text.includes("Application error"),
      "the server rendered a runtime error page",
    );
    return `HTTP ${res.status}${res.status === 200 ? " (resolved client-side; see browser suite)" : ""}`;
  });
}

run.finish();
