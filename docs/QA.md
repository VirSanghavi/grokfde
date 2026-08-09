# QA suite

Proof that the demo will not break in front of a founder.

The suite runs against a live server, never a mock. It exercises the real xAI
realtime API, the real Supabase database, and a real Chromium browser, because
every failure this is meant to catch happens at exactly those boundaries.

```bash
npm run qa            # everything, one consolidated report
npm run qa:api        # API contracts
npm run qa:routes     # page routes over HTTP
npm run qa:auth       # anonymous visitor, auth gating, primary CTA
npm run qa:browser    # real browser: console, layout, design contract, a11y
npm run qa:voice      # the xAI realtime voice path
```

Point it anywhere with `BASE_URL`:

```bash
BASE_URL=https://grokfde.com npm run qa
BASE_URL=https://acme.grokfde.com npm run qa:routes
```

Everything exits non-zero on failure, so `npm run qa` is safe to gate a deploy
on. Raw results land in `scripts/qa/results/*.json` and screenshots in
`scripts/qa/screenshots/`.

## Setup

Playwright's Chromium is the one thing that is not installed by `npm install`:

```bash
npx playwright install chromium
```

The suite reads `.env.local` itself, so no `dotenv` wrapper is needed. It wants
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (cleanup only), and
`XAI_API_KEY` (voice only). Missing keys skip the affected checks with a stated
reason rather than failing quietly.

## What each suite covers

### `qa:api` - API contracts

Two layers. First, deep tests of the demo-critical path against real data:
company resolve by slug and by id, conversation open and resume, a real Grok
chat turn, booking availability by month and by day, booking creation, double
book rejection, join token resolution, knowledge paste ingestion, and voice
token minting. Each asserts the happy-path status, a 4xx on bad input, and the
response shape.

Second, a contract sweep over every route under `src/app/api`. The invariant is
the same everywhere: a bad request returns a JSON error envelope
(`{ error: { code, message } }`) with a 4xx status. **Never a 500, never an HTML
error page.** A prospect hitting a stale link must get a designed page, and the
route that produced the original "Company not found" crash is asserted
explicitly: a nonexistent slug returns a clean JSON 404 that names the slug that
missed.

### `qa:routes` - page routes over HTTP

Every user-facing route returns 200, serves a real HTML document, and contains
its expected real content. The homepage CTAs are asserted to point at
`/book/grok-fde` and `/fde/grok-fde`, because a slug with no company row is what
broke the demo before.

Placeholder leakage fails the run: `lorem`, `example.com`, `Your Company`, a
literal `undefined` or `NaN`, `[object Object]`, unrendered `{{tokens}}`, and
the placeholder name `Prospect` sitting where a real person's name belongs.
Script and JSON payloads are stripped before scanning, since Next.js flight data
legitimately contains the string "undefined" and no human ever sees it.

Several pages are client components that ship a shell and fetch in the browser,
so "did a human actually see content" is not answerable over HTTP. That
assertion lives in the browser suite, and this suite says so rather than
pretending.

### `qa:browser` - real Chromium

Every key route at **375x812 and 1440x900**, with a full-page screenshot per
route per viewport written to `scripts/qa/screenshots/` so a human can check
real pixels.

The most important assertion in the whole suite: **every console error, uncaught
exception, and unhandled promise rejection fails the run.** Rejections are
captured by a listener installed before any app code runs, because that is the
bug class that was actually reported. Failed network requests and any HTTP 4xx
or 5xx fired by the page fail too. Only dev-toolchain noise is ignored, and that
list is deliberately three entries long.

Also asserted:

- **Layout** - `document.scrollWidth` must not exceed the viewport, and no
  element may stick out past it.
- **Dead ends** - anchors with `href="#"`, an empty href, or no href and no
  click handler; React-owned buttons with no handler bound.
- **Tap targets** - every interactive element at least 44x44 CSS px at mobile
  width. Links inline within a sentence are exempt, per WCAG 2.5.5.
- **Accessibility** - images without alt, controls with no accessible name,
  focus styles removed with no replacement, plus an `@axe-core/playwright` scan
  at WCAG 2.0/2.1 A and AA. Serious and critical violations fail.
- **Contrast** - every text node's computed color against its resolved
  background, 4.5:1 (3:1 for large text). Text over an image or gradient is
  counted as unmeasurable and reported separately rather than guessed at.

**Design contract checks**, which carry the same weight as the functional ones.
Each is a literal ban from `docs/DESIGN.md`, asserted against computed style
rather than class names so a violation is caught however it was authored:

- **No pills, anywhere.** The rule is mechanical so there is nothing to argue
  with: an element whose computed radius resolves to a pill (at least half the
  smaller side, or the 9999px sentinel) fails **unless it has no text at all
  and its width equals its height within 1px**. That permits avatars, status
  dots, and spinner rings. Every button and every CTA uses the 4px control
  radius. Each failure is reported with a CSS selector path, the element's
  text, and its computed width, height, and radius, so it is findable in
  devtools immediately. The full list is printed, never a count.
- No page-width cap. A main content container whose computed `max-width` is
  narrower than the desktop viewport fails, since the contract demands full
  width. Routes the contract calls "a genuinely single-focus moment" (login,
  signup, booking confirmation) are exempt and report their cap instead.
- No third typeface. `docs/DESIGN.md` says to keep the face the product ships
  on, which is **Geist** (Geist Sans for UI, Geist Mono for machine data), so
  anything else is the violation. The hashed family names `next/font` generates
  (`__Geist_a1b2c3`) are recognised. The allowlist is a regex in
  `ALLOWED_FONT_PATTERN` and is overridable with `QA_ALLOWED_FONTS`, so a future
  change of face is a config edit rather than a code change.
- **No shouty all-caps.** Visible text that renders entirely uppercase fails
  when it runs to more than one word, or when it sits on a status, badge, tag,
  or chip element. `text-transform` is resolved first, so lowercase source that
  renders uppercase is caught too. Two exceptions, both reported rather than
  silently ignored: a short acronym allowlist (FDE, API, MCP, SLA and similar),
  and the mono `label` type tier, which the contract names as the only
  sanctioned uppercase. Allowed matches are listed in the PASS detail so nobody
  has to guess what the exception covered.
- **No hardcoded hex.** A `#rrggbb` in an inline `style` attribute, or an
  arbitrary Tailwind value such as `text-[#13110F]` or `bg-[#fff]`, fails. All
  color comes through the tokens in `globals.css`.
- No em dashes in visible copy.
- No gradient backgrounds.
- No `animate-pulse`, and no infinite `ping` / `bounce` / `spin`. Other infinite
  animations are reported but not failed, because the contract allows exactly
  one earned signature moment (the hero film pan, which is already gated behind
  `prefers-reduced-motion`). The report names them so the exception stays
  visible rather than becoming a loophole.
- No `transition-all`. Note that `all` is the *initial* value of
  `transition-property`, so an element with no transition at all reports it;
  only a transition with a non-zero duration is counted. Checking this naively
  flags every `<div>` on the page.

Every one of these reads computed style rather than class names, so a refactor
that renames a utility class cannot dodge the assertion.

### `qa:auth` - the anonymous visitor

A stranger must never be dumped into an auth wall by clicking something on a
public page, and must never land on an internal company surface. This suite
crawls as a real anonymous browser with no session, no cookies, and no local
storage.

It starts from `/`, `/fde/grok-fde`, and `/book/grok-fde`, collects every
same-origin link from those pages and from everything they link to, then visits
each destination fresh and asserts where it landed. It also clicks the
navigational buttons on the public pages for real, since a Next.js button may
call `router.push` instead of rendering an anchor.

Two failures:

- **Redirected into an auth wall.** Following a destination that is not itself
  `/login` or `/signup` and landing there anyway. A link that points *at* the
  auth page is the visitor choosing to sign in, and passes.
- **Linking into a gated surface.** A public page linking to `/dashboard`,
  `/knowledge`, `/conversations`, `/demos`, `/agent`, `/accounts`,
  `/field-signals`, `/onboarding`, or a workspace. Each failure names the source
  page, the exact control, and the destination.

It then asserts the complement by **direct navigation**, which is the part that
matters most. A link-following crawl structurally cannot reach an unlinked
route, so a crawl alone gives false confidence: deleting the nav link to
`/dashboard` makes the crawl green while the URL stays wide open. Nobody links
to `/admin` either.

So the gated routes are **enumerated from the filesystem**, not hardcoded:
every `page.tsx` under `src/app/(company)` becomes a route, dynamic segments
filled with an id that deliberately does not exist (auth must be enforced
*before* the page looks at data, so a missing record is no excuse). Each must
redirect an anonymous visitor to `/login?next=<path>`. Because the list is
derived, a new page cannot be added without being covered.

The same enumeration runs over the API: every `route.ts` whose handler reads a
`companyId` and exports a `GET`, minus an explicit prospect-facing allowlist.
**Middleware protecting a page does not protect the data behind it.** A `400`
is reported distinctly from a `401` so "it rejected my parameters" can never
masquerade as "it is gated".

One assertion is called out on its own because it is a privacy question rather
than an access-control one: `/api/bookings?slug=` is what `/demos` calls, and
`demo_bookings` rows carry the name and email of real people who booked a call.
That endpoint must not hand guest identity to an anonymous caller. When the
table is empty the check says it could not prove either way rather than banking
a green tick; `qa:api` runs the same assertion while a booking it created
definitely exists.

A prefix with no route behind it is reported as a SKIP, not a pass, which is
what catches a route that quietly disappeared.

It also asserts the primary call to action: the homepage must carry a link to
`/book/` above the fold at both 375px and 1440px.

The internal surfaces are therefore NOT in the browser suite's render list.
Loading them anonymously would only screenshot the login page repeatedly.

**This crawl cannot write.** Every non-GET request is aborted at the network
layer, so clicking a button can never submit a form, create a booking, or write
a row. That is enforced by `context.route`, not by choosing which buttons to
click.

### `qa:voice` - the realtime path

Proves the demo centerpiece from Node before anyone walks into an office. It
mints an ephemeral client secret directly from `api.x.ai`, opens the WebSocket
with the `xai-client-secret.<value>` subprotocol, sends `session.update`, sends
`response.create`, and asserts that real audio deltas and a real transcript come
back inside a timeout.

It then does the same thing again using a token minted by our own
`/api/voice/token`, so a failure points at one side or the other: the xAI key
and service, or our token route. A mock token fails the run outright, because a
mock is exactly the thing that looks fine until the founder is watching.

Protocol details follow `docs/VOICE-PROTOCOL.md`. Both the GA event names and
the beta aliases are accepted on the read side.

## Reading the output

Each suite prints one row per check:

```
  PASS  GET /api/company?slug=grok-fde resolves the demo company    412ms  Grok FDE / agent Atlas
  FAIL  / @mobile - tap targets are at least 44x44                   10ms  13 interactive element(s) below 44x44: ...
  SKIP  realtime voice                                                  -  XAI_API_KEY is not set
```

`PASS` rows carry a detail worth reading, not just a tick: the model that
answered, how many slots came back, how many bytes of audio arrived. A failure
names the element, the measured value, and the required one, so it is actionable
without re-running anything.

`npm run qa` ends with a consolidated report listing every failure across all
four suites and a final PASS/FAIL.

A `SKIP` is never a pass. It means a precondition was absent and says which one.

### Gated endpoints and the one real coverage gap

The operator API (conversations, prospects, accounts, knowledge, escalations,
field signals and their neighbours) now requires a session. The suite runs
anonymously, so those endpoints answer 401 and their tests report:

```
  SKIP  GET /api/prospects?companyId= lists prospects   gated: needs an operator session
```

That is deliberate. A 401 is the auth contract working, not a broken route, so
it must not read as a failure. **But a skip is not coverage**, and roughly 49
API assertions are currently skipped rather than run. The gate being genuinely
shut is asserted directly in `qa:auth`, so a *missing* gate still fails loudly
and cannot hide behind a skip. What is not currently verified is the behaviour
*behind* the gate.

Closing that gap means giving the suite a real operator session (a seeded test
account, then reusing its cookie via a Playwright `storageState`). Until then,
read a large skip count on `qa:api` as unverified surface, not as a clean run.

## Test data and cleanup

No test depends on another's leftover state, and nothing is asserted against
wall-clock dates that expire tomorrow: dates are computed relative to now, in a
fixed timezone (`America/Los_Angeles`), and the browser context pins its locale
and timezone so results do not change with the runner machine.

Writes never touch the demo company. Each run creates its own QA fixture company
and books against that, so `/demos` never fills with test bookings. Everything
created is namespaced with a `qa-` prefix and the run id, on company slugs, guest
names, and guest emails (`qa-<runid>-guest@qa.invalid`), so a stray row is
trivially identifiable and can never be mistaken for a real prospect.

Cleanup deletes **by tracked id only**. Every row a suite creates is registered
in `scripts/qa/lib/db.mjs` as it is created, and only those ids are ever removed.
Nothing is deleted by pattern match, so data the suite did not create cannot be
touched even if a name collides. The routes, browser, and voice suites are
read-only and create nothing at all.

## Layout

```
scripts/qa/
  all.mjs        every suite, one consolidated report
  api.mjs        API contracts
  routes.mjs     page routes over HTTP
  auth.mjs       anonymous crawl, auth gating, primary CTA
  browser.mjs    real Chromium, both viewports
  voice.mjs      xAI realtime
  checks.mjs     in-page check functions, evaluated in the browser
  lib/harness.mjs  env, HTTP, assertions, result table
  lib/db.mjs       tracked-id cleanup registry
  results/       JSON per suite, consumed by all.mjs
  screenshots/   one per route per viewport
```

Three things to know before editing `checks.mjs`, each of which silently breaks
a check rather than erroring loudly:

1. Playwright evaluates a string argument as an **expression**, so a bare
   `function` declaration at the top of the source is a SyntaxError that kills
   the check before it runs. Every check is wrapped by `inPage()` into a single
   arrow IIFE. Keep it that way.
2. The source passes through a template literal on its way to the page, so
   regex backslashes are escaped twice (`\\s`, `\\b`). Writing `\s` yields a
   bare `s` in the page and the regex silently matches the wrong thing. A
   backtick inside a comment closes the template early.
3. Assert on computed style, but know what the *initial* value is before you
   treat it as a violation. `transition-property` defaults to `all` and
   `border-radius` on a 1px hairline is trivially "half the smaller side".
   Both produce a page full of false positives if taken at face value.

## Selecting suites

```bash
node scripts/qa/all.mjs api routes     # a subset
QA_SUITES=browser node scripts/qa/all.mjs
QA_ROUTES=/,/fde/grok-fde npm run qa:browser   # only these routes
```

Timeouts are tunable for a slow network or a cold dev server:
`QA_CHAT_TIMEOUT_MS`, `QA_VOICE_TIMEOUT_MS`, `QA_VOICE_CONNECT_MS`.

To point the suite at a different tenant, set `QA_COMPANY_SLUG` and
`QA_COMPANY_ID`.
