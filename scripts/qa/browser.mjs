#!/usr/bin/env node
/**
 * Real browser checks with Playwright (chromium).
 *
 * Every key route is loaded at mobile (375x812) and desktop (1440x900) and
 * checked for the things that embarrass you in front of a founder: console
 * errors, unhandled promise rejections, failed network requests, horizontal
 * overflow, dead links, tap targets too small to hit, missing labels, invisible
 * focus, and unreadable contrast. A screenshot per route per viewport is saved
 * so a human can look at the real pixels.
 *
 * Read-only: this suite navigates and observes. It submits no forms and
 * creates nothing in the database.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { BASE_URL, DEMO, QA_DIR, RUN_ID, assert, createRun, findPlaceholders, request } from "./lib/harness.mjs";
import {
  CHECK_ACTIONS,
  CHECK_CONTRAST,
  CHECK_DESIGN,
  CHECK_FOCUS_VISIBLE,
  CHECK_LABELS,
  CHECK_OVERFLOW,
  CHECK_PLACEHOLDER_NAME,
  CHECK_TAP_TARGETS,
} from "./checks.mjs";

const SHOTS_DIR = join(QA_DIR, "screenshots");
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812, isMobile: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
];

/**
 * Console noise that is the dev toolchain talking, not the product failing.
 * Keep this list short and justified; anything else is a real finding.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /react-devtools/i,
];

/** Requests whose failure says nothing about the product. */
const IGNORED_REQUEST_FAILURES = [
  /\/_next\/static\/webpack\/.*\.hot-update\.json$/,
  /__nextjs_/,
  /\/_next\/webpack-hmr/,
];

const run = createRun("browser", "Browser checks");

/** Resolve dynamic ids so real URLs get exercised, not just static ones. */
async function resolveRoutes() {
  const routes = [
    { path: "/", label: "home", contains: ["Grok FDE"] },
    { path: `/fde/${DEMO.slug}`, label: "prospect FDE room", contains: ["Atlas"] },
    { path: `/book/${DEMO.slug}`, label: "booking", contains: ["Grok FDE"] },
    // The internal company surfaces (/dashboard, /onboarding, /demos,
    // /knowledge, /conversations, /accounts, /field-signals, /agent) are now
    // gated and redirect an anonymous visitor to /login. Rendering them here
    // would only screenshot the login page over and over, so the gating itself
    // is asserted in auth.mjs where it belongs.
    //
    // DESIGN.md permits a centred measure for "a genuinely single-focus
    // moment, such as the booking confirmation or a short auth form".
    { path: "/login", label: "login", singleFocus: true },
    { path: "/signup", label: "signup", singleFocus: true },
    // The reported crash: a slug with no company row. The page is a client
    // component, so the server cannot 404 it; whatever the prospect sees here
    // must still be a real screen and must not throw.
    //
    // Resolving the slug REQUIRES asking the server, and the honest answer is
    // a 404, so that one lookup failing is the page working correctly rather
    // than a defect. It is allowed here and nowhere else. This is also a
    // single-focus page, so a centred measure is the right composition.
    {
      path: `/fde/qa-missing-${RUN_ID}`,
      label: "unknown company FDE room",
      unknownTarget: true,
      singleFocus: true,
      expected404: /\/api\/company\?slug=/,
    },
  ];

  if (process.env.QA_ROUTES) {
    // Filter the known routes rather than replacing them, so a targeted run
    // keeps each route's configuration. Replacing them silently dropped
    // singleFocus and expected404, which made a focused re-run report
    // failures the full run does not have.
    return process.env.QA_ROUTES.split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((path) => {
        const known = routes.find((r) => r.path === path || (r.unknownTarget && path.startsWith("/fde/qa-missing")));
        return known ? { ...known, path } : { path, label: "custom" };
      });
  }

  const bookings = await request(`/api/bookings?slug=${DEMO.slug}`);
  const booking = bookings.status === 200 ? bookings.json?.bookings?.[0] : null;
  const token = booking?.joinToken || booking?.join_token;
  if (token) routes.push({ path: `/book/${DEMO.slug}/join/${token}`, label: "booking join" });
  if (booking?.id) {
    routes.push({ path: `/book/${DEMO.slug}/c/${booking.id}`, label: "booking confirmation", singleFocus: true });
  }

  return routes;
}

const routes = await resolveRoutes();

rmSync(SHOTS_DIR, { recursive: true, force: true });
mkdirSync(SHOTS_DIR, { recursive: true });

const browser = await chromium.launch();
const slug = (path) => (path === "/" ? "home" : path.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60));

for (const route of routes) {
  for (const viewport of VIEWPORTS) {
    const where = `${route.path} @${viewport.name}`;

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
      // Deterministic: never depend on the runner machine's locale or zone.
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
      // The FDE room asks for a microphone; granting it keeps a permission
      // prompt from masking real errors.
      permissions: ["microphone"],
    });

    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];

    const page = await context.newPage();

    // page.on('pageerror') covers uncaught exceptions. Unhandled promise
    // rejections are the bug the user actually reported, so they are captured
    // explicitly in the page before any app code runs.
    await page.addInitScript(() => {
      window.__qaRejections = [];
      window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        window.__qaRejections.push(
          reason && reason.stack ? String(reason.stack).split("\n").slice(0, 3).join(" | ") : String(reason),
        );
      });
    });

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
      consoleErrors.push(text.slice(0, 300));
    });
    page.on("pageerror", (err) => {
      pageErrors.push(`${err.name}: ${err.message}`.slice(0, 300));
    });
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (IGNORED_REQUEST_FAILURES.some((re) => re.test(url))) return;
      const failure = req.failure()?.errorText || "failed";
      if (failure === "net::ERR_ABORTED") return; // navigation or media abort
      failedRequests.push(`${req.method()} ${url.replace(BASE_URL, "")} - ${failure}`);
    });
    page.on("response", async (res) => {
      if (res.status() < 400) return;
      const url = res.url();
      if (IGNORED_REQUEST_FAILURES.some((re) => re.test(url))) return;
      failedRequests.push(`${res.request().method()} ${url.replace(BASE_URL, "")} - HTTP ${res.status()}`);
    });

    let loaded = true;
    let navStatus = null;
    await run.test(`${where} - loads`, async () => {
      const response = await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      navStatus = response?.status() ?? 0;
      assert(navStatus === 200, `navigation returned HTTP ${navStatus}`);
      // Let client effects, data fetches, and any late rejection actually happen.
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const bodyText = await page.evaluate(() => document.body?.innerText?.trim() ?? "");
      assert(bodyText.length > 100, `page rendered only ${bodyText.length} characters of visible text`);
      return `HTTP ${navStatus}, ${bodyText.length} chars visible`;
    }).then((ok) => {
      loaded = ok;
    });

    if (!loaded) {
      await context.close();
      continue;
    }

    // Screenshot first, so a human has the pixels even if later checks throw.
    const shotPath = join(SHOTS_DIR, `${slug(route.path)}--${viewport.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

    await run.test(`${where} - renders real content, no placeholder leakage`, async () => {
      const bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

      for (const needle of route.contains || []) {
        assert(bodyText.includes(needle), `rendered page does not contain "${needle}"`);
      }

      const placeholders = findPlaceholders(bodyText);
      assert(placeholders.length === 0, `placeholder leakage: ${placeholders.join(" | ")}`);

      for (const bad of ["Application error", "Unhandled Runtime Error", "Internal Server Error"]) {
        assert(!bodyText.includes(bad), `page shows the error text "${bad}"`);
      }

      if (route.unknownTarget) {
        // A prospect who follows a stale link must be told what happened, not
        // shown a blank screen or a raw error string. Naming the address that
        // failed counts as an explanation, and is the clearest form of one, so
        // that satisfies this rather than a fixed list of phrasings.
        const slug = route.path.split("/").pop();
        const explained =
          bodyText.includes(slug) ||
          /not found|no longer|does ?n[o']?t exist|unavailable|expired|check the link|mistyped|not published|no engineer/i.test(
            bodyText,
          );
        assert(
          explained,
          `an unknown company rendered a page with no explanation of what went wrong: "${bodyText.slice(0, 160)}"`,
        );
        assert(
          !/^Error:/m.test(bodyText) && !bodyText.includes("Company not found."),
          `an unknown company rendered a raw error string: "${bodyText.slice(0, 160)}"`,
        );
      }

      return `${bodyText.length} chars rendered`;
    });

    // --- the single most important assertion in the suite -------------------
    await run.test(`${where} - no console errors or unhandled rejections`, async () => {
      const rejections = await page.evaluate(() => window.__qaRejections || []);
      // A route that exists to prove a not-found state has to ask the server
      // and be told no. Chromium logs that answer as a console error with no
      // URL attached, so on those routes the generic resource-404 line is the
      // expected outcome rather than a defect. The request itself is still
      // asserted below, against the specific URL that is allowed to 404.
      const consoleNoise = route.expected404
        ? consoleErrors.filter((e) => !/Failed to load resource[\s\S]*404/i.test(e))
        : consoleErrors;
      const all = [
        ...pageErrors.map((e) => `uncaught ${e}`),
        ...rejections.map((r) => `unhandled promise rejection: ${r}`),
        ...consoleNoise.map((e) => `console.error ${e}`),
      ];
      assert(all.length === 0, all.slice(0, 5).join("\n        "));
      return route.expected404 && consoleErrors.length > consoleNoise.length
        ? `clean console (${consoleErrors.length - consoleNoise.length} expected 404 log(s) allowed)`
        : "clean console";
    });

    await run.test(`${where} - no failed network requests`, async () => {
      const unique = [...new Set(failedRequests)].filter(
        (r) => !(route.expected404 && route.expected404.test(r) && /HTTP 404/.test(r)),
      );
      assert(unique.length === 0, unique.slice(0, 5).join("\n        "));
      return route.expected404 ? "no unexpected failed requests" : "no failed requests";
    });

    await run.test(`${where} - no horizontal overflow`, async () => {
      const result = await page.evaluate(CHECK_OVERFLOW);
      assert(
        result.docScrollWidth <= result.viewport + 1,
        `document scrollWidth is ${result.docScrollWidth} against a ${result.viewport}px viewport, so the page scrolls sideways`,
      );
      assert(
        result.offenderCount === 0,
        `${result.offenderCount} element(s) stick out past the viewport: ` +
          result.offenders.map((o) => `${o.el} (+${o.overflowPx}px)`).join("; "),
      );
      return `scrollWidth ${result.docScrollWidth} <= ${result.viewport}`;
    });

    await run.test(`${where} - links and buttons have real destinations`, async () => {
      const result = await page.evaluate(CHECK_ACTIONS);
      const problems = [];
      if (result.deadLinks.length) {
        problems.push(`dead anchors: ${result.deadLinks.map((l) => `${l.el} href=${l.href}`).join("; ")}`);
      }
      if (result.deadButtons.length) {
        problems.push(`buttons with no handler: ${result.deadButtons.map((b) => b.el).join("; ")}`);
      }
      assert(problems.length === 0, problems.join(" | "));
      return result.reactSeen ? "all actionable (React handlers inspected)" : "all anchors have destinations";
    });

    if (viewport.isMobile) {
      await run.test(`${where} - tap targets are at least 44x44`, async () => {
        const result = await page.evaluate(CHECK_TAP_TARGETS);
        assert(
          result.count === 0,
          `${result.count} interactive element(s) below 44x44: ` +
            result.small.map((s) => `${s.el} (${s.size})`).join("; "),
        );
        return "all tap targets >= 44px";
      });
    }

    await run.test(`${where} - images and controls are labelled`, async () => {
      const result = await page.evaluate(CHECK_LABELS);
      const problems = [];
      if (result.imagesWithoutAltCount) {
        problems.push(
          `${result.imagesWithoutAltCount} image(s) with no alt attribute: ${result.imagesWithoutAlt.map((i) => i.src || i.el).join("; ")}`,
        );
      }
      if (result.unnamedCount) {
        problems.push(
          `${result.unnamedCount} control(s) with no accessible name: ${result.unnamed.map((u) => u.el).join("; ")}`,
        );
      }
      assert(problems.length === 0, problems.join(" | "));
      return "all labelled";
    });

    await run.test(`${where} - focus is visible on interactive elements`, async () => {
      const result = await page.evaluate(CHECK_FOCUS_VISIBLE);
      assert(
        result.invisibleCount === 0,
        `${result.invisibleCount} of ${result.sampled} sampled element(s) show no visual change on focus: ` +
          result.invisible.map((i) => i.el).join("; "),
      );
      return `${result.sampled} elements sampled`;
    });

    await run.test(`${where} - text contrast meets 4.5:1`, async () => {
      const result = await page.evaluate(CHECK_CONTRAST);
      assert(
        result.failureCount === 0,
        `${result.failureCount} of ${result.checked} text node(s) below the required ratio: ` +
          result.failures
            .map(
              (f) =>
                `${f.el} "${f.text}" ${f.ratio}:1 (needs ${f.required}:1, ${f.color} on ${f.background} @${f.fontSize}px)`,
            )
            .join("; "),
      );
      return `${result.checked} text nodes checked, ${result.skippedForImage} skipped over image backgrounds`;
    });

    // --- design contract ----------------------------------------------------
    // Computed once per page, asserted as separate named checks so a failure
    // says which rule broke. These carry the same weight as the functional
    // checks: docs/DESIGN.md is binding, and the bans below are literal.
    const design = await page.evaluate(CHECK_DESIGN).catch((err) => ({ evalError: err.message }));

    // No pills anywhere. A pill radius is legal ONLY on a perfect circle with
    // no text, which is avatars, status dots, and spinner rings. Every failure
    // is listed in full with a selector, because a count is not actionable.
    await run.test(`${where} - design: no pills, only textless circles may be round`, async () => {
      assert(!design.evalError, `design check could not run: ${design.evalError}`);
      assert(
        design.pillCount === 0,
        `${design.pillCount} pill(s):\n        ` +
          design.pills
            .map(
              (p) =>
                `${p.selector}\n            text=${JSON.stringify(p.text)} ${p.width}x${p.height} radius=${p.radius} (${p.reason})`,
            )
            .join("\n        "),
      );
      return "no pills";
    });

    if (!viewport.isMobile) {
      await run.test(`${where} - design: no page-width cap, the layout is full width`, async () => {
        assert(!design.evalError, `design check could not run: ${design.evalError}`);
        if (route.singleFocus) {
          // A centred measure is the correct composition here, so a cap is not
          // a violation. Report it rather than asserting on it.
          return design.widthCaps.length
            ? `single-focus route, centred measure allowed (${design.widthCaps[0].maxWidth})`
            : "single-focus route, no cap";
        }
        assert(
          design.widthCaps.length === 0,
          `content is capped narrower than the ${design.viewport}px viewport: ` +
            design.widthCaps.map((c) => `${c.el} max-width:${c.maxWidth}`).join("; "),
        );
        return "full width";
      });
    }

    await run.test(`${where} - design: no third typeface`, async () => {
      assert(!design.evalError, `design check could not run: ${design.evalError}`);
      assert(
        design.fonts.length === 0,
        `${design.fonts.length} foreign typeface(s): ` +
          design.fonts.map((f) => `"${f.family}" on ${f.el} ${JSON.stringify(f.text)}`).join("; "),
      );
      return "one typeface family";
    });

    // "Uppercase is not a substitute for a shape." BLOCKED in a capsule is two
    // tells in one. The mono label tier is the contract's only sanctioned
    // uppercase, so it is allowed and reported rather than failed.
    await run.test(`${where} - design: no shouty all-caps text`, async () => {
      assert(!design.evalError, `design check could not run: ${design.evalError}`);
      assert(
        design.shouty.length === 0,
        `${design.shouty.length} all-caps string(s):\n        ` +
          design.shouty
            .map((s) => `${s.selector}\n            ${JSON.stringify(s.text)} @${s.fontSize}px text-transform:${s.transform}`)
            .join("\n        "),
      );
      const allowed = design.shoutyAllowed.length;
      return allowed
        ? `clean, ${allowed} label-tier caps allowed: ${design.shoutyAllowed.map((s) => JSON.stringify(s.text)).join(", ")}`
        : "no all-caps";
    });

    await run.test(`${where} - design: all color comes through tokens, no hardcoded hex`, async () => {
      assert(!design.evalError, `design check could not run: ${design.evalError}`);
      assert(
        design.hardcodedHex.length === 0,
        `${design.hardcodedHex.length} hardcoded color(s):\n        ` +
          design.hardcodedHex
            .map((h) => `${h.selector}\n            ${h.value} (${h.where})`)
            .join("\n        "),
      );
      return "no hardcoded hex";
    });

    await run.test(`${where} - design: no em dashes in visible copy`, async () => {
      assert(!design.evalError, `design check could not run: ${design.evalError}`);
      assert(
        design.emDashes.length === 0,
        `${design.emDashes.length} em dash(es): ` + design.emDashes.map((d) => `${d.el} "${d.text}"`).join("; "),
      );
      return "no em dashes";
    });

    await run.test(`${where} - design: no gradients, animate-pulse, or transition-all`, async () => {
      assert(!design.evalError, `design check could not run: ${design.evalError}`);
      const problems = [];
      if (design.gradients.length) {
        problems.push(
          `decorative colour gradient(s): ${design.gradients.map((g) => `${g.el} ${g.value}`).join("; ")}`,
        );
      }
      if (design.animations.length) {
        problems.push(
          `decorative infinite animation(s): ${design.animations.map((a) => `${a.el} ${a.animation} x${a.iterations}`).join("; ")}`,
        );
      }
      if (design.transitionAll.length) {
        problems.push(
          `transition-all: ${design.transitionAll.map((t) => `${t.el} (${t.duration})`).join("; ")}`,
        );
      }
      assert(problems.length === 0, problems.join(" | "));
      // Report what the exceptions covered, so an allowance stays visible
      // instead of quietly becoming a loophole.
      const allowed = [];
      const scrims = design.scrims || [];
      const other = design.otherMotion || [];
      if (scrims.length) allowed.push(`${scrims.length} alpha scrim(s) over video`);
      if (other.length) allowed.push(`${other.length} infinite animation(s): ${[...new Set(other.map((o) => o.animation))].join(", ")}`);
      return allowed.length ? `no banned decoration, allowed: ${allowed.join("; ")}` : "no banned decoration";
    });

    await run.test(`${where} - no placeholder person name "Prospect"`, async () => {
      const result = await page.evaluate(CHECK_PLACEHOLDER_NAME);
      assert(
        result.count === 0,
        `${result.count} element(s) render "Prospect" as a person's name: ` +
          result.hits.map((h) => `${h.el} in "${h.context}"`).join("; "),
      );
      return "no placeholder names";
    });

    await run.test(`${where} - axe accessibility scan`, async () => {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const minor = results.violations.length - serious.length;
      assert(
        serious.length === 0,
        serious
          .map((v) => `${v.id} (${v.impact}, ${v.nodes.length} node(s)): ${v.help} - e.g. ${v.nodes[0]?.target?.join(" ")}`)
          .join("\n        "),
      );
      return `no serious violations${minor ? `, ${minor} minor` : ""}`;
    });

    await context.close();
  }
}

await browser.close();

console.log(`  screenshots written to ${SHOTS_DIR}\n`);
run.finish();
