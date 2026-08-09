#!/usr/bin/env node
/**
 * API contract tests.
 *
 * Two layers:
 *   1. Deep tests of the demo-critical path (company resolve, conversation,
 *      chat, booking, join token, knowledge, voice token) against real data.
 *   2. A contract sweep over every route under src/app/api asserting that bad
 *      input produces a clean JSON error envelope with a 4xx status, never a
 *      500 and never an HTML error page.
 *
 * Reads go against the real demo company. Writes go against a QA-namespaced
 * company created and deleted by this run, so the demo tenant is never
 * polluted with test bookings or prospects.
 */
import {
  BASE_URL,
  DEMO,
  RUN_ID,
  assert,
  assertEqual,
  assertErrorEnvelope,
  assertOneOf,
  assertShape,
  createRun,
  postJson,
  qaEmail,
  qaName,
  request,
} from "./lib/harness.mjs";
import { cleanup, sweepOrphans, track, trackConversationMessages } from "./lib/db.mjs";

/**
 * Teardown must survive a kill, not just a clean finish.
 *
 * Anything this run creates is visible in the product while it exists: a
 * fixture company becomes the newest company, which the operator UI treats as
 * active, and its booking renders on /demos. A run killed by a timeout or a
 * Ctrl-C would otherwise leave that sitting in front of the next demo.
 */
let tornDown = false;
async function teardown(reason) {
  if (tornDown) return;
  tornDown = true;
  if (reason) console.log(`\n  interrupted (${reason}), cleaning up before exit`);
  await cleanup().catch((err) => console.error(`  cleanup failed: ${err.message}`));
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, async () => {
    await teardown(signal);
    process.exit(130);
  });
}
process.on("uncaughtException", async (err) => {
  console.error(`  uncaught: ${err.message}`);
  await teardown("uncaughtException");
  process.exit(1);
});

const TZ = "America/Los_Angeles";
const CHAT_TIMEOUT_MS = Number(process.env.QA_CHAT_TIMEOUT_MS || 120_000);

/** A well-formed UUID that will not exist, for clean not-found assertions. */
const ABSENT_UUID = "00000000-0000-4000-8000-0000000000aa";

/** YYYY-MM-DD, `days` ahead, evaluated in the guest timezone. */
function ymdAhead(days, timeZone = TZ) {
  const at = new Date(Date.now() + days * 24 * 60 * 60_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

const run = createRun("api", "API contract");

/**
 * Hard guard: a QA booking may only ever be created against a company this run
 * created. Booking the real demo company would occupy a slot a founder might
 * want, and would put a "qa-" guest on the surface the user demos live.
 */
function assertSafeToBook(slug) {
  assert(
    slug !== DEMO.slug && slug.startsWith("qa-co-"),
    `refusing to create a booking on "${slug}": QA only books its own fixture company, never the demo company`,
  );
  return slug;
}

// Start from a clean slate: a previous run that was hard-killed may have left
// a fixture company behind, and a stray fixture is the newest company, which
// the operator UI treats as active.
await sweepOrphans();

/** Fixtures this run owns. Created once, deleted in cleanup. */
const fx = {
  companyId: null,
  companySlug: `qa-co-${RUN_ID}`,
  conversationId: null,
  prospectId: null,
  bookingSlotIso: null,
};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

await run.test("GET /api/health returns service status", async () => {
  const res = await request("/api/health");
  assertEqual(res.status, 200, "status");
  assertShape(res.json, {
    ok: "boolean",
    service: "string",
    time: "string",
    "models.text": "string",
    "models.voice": "string",
    xaiConfigured: "boolean",
    supabaseConfigured: "boolean",
  });
  assert(res.json.xaiConfigured, "xaiConfigured is false - XAI_API_KEY is not set on the server");
  assert(res.json.supabaseConfigured, "supabaseConfigured is false - Supabase env is not set on the server");
  return `${res.json.models.text} / ${res.json.models.voice}`;
});

// ---------------------------------------------------------------------------
// Company resolve - the demo's most load-bearing lookup
// ---------------------------------------------------------------------------

await run.test(`GET /api/company?slug=${DEMO.slug} resolves the demo company`, async () => {
  const res = await request(`/api/company?slug=${encodeURIComponent(DEMO.slug)}`);
  assertEqual(res.status, 200, "status");
  assertShape(res.json, {
    "company.id": "string",
    "company.name": "string",
    "company.slug": "string",
    "company.agentName": "string",
  });
  assertEqual(res.json.company.slug, DEMO.slug, "company.slug");
  assertEqual(res.json.company.id, DEMO.id, "company.id");
  return `${res.json.company.name} / agent ${res.json.company.agentName}`;
});

await run.test("GET /api/company?slug=<missing> is a clean JSON 404, not a 500 or HTML", async () => {
  const res = await request(`/api/company?slug=qa-no-such-company-${RUN_ID}`);
  const error = assertErrorEnvelope(res, 404);
  assertEqual(error.code, "NOT_FOUND", "error.code");
  assert(
    error.message.includes(RUN_ID),
    `error message should name the slug that missed, got "${error.message}"`,
  );
  return error.message;
});

await run.test("GET /api/company?id=<demo> includes knowledge sources", async () => {
  const res = await request(`/api/company?id=${DEMO.id}`);
  assertEqual(res.status, 200, "status");
  assertShape(res.json, { "company.id": "string", knowledgeSources: "array" });
  for (const source of res.json.knowledgeSources) {
    assertShape(source, { id: "string", title: "string", type: "string", status: "string" }, "knowledgeSource");
    assertOneOf(source.type, ["file", "paste", "url", "mcp"], "knowledgeSource.type");
    assertOneOf(source.status, ["processing", "ready", "error"], "knowledgeSource.status");
  }
  const ready = res.json.knowledgeSources.filter((s) => s.status === "ready").length;
  assert(ready > 0, "demo company has no knowledge source in status 'ready' - chat has nothing to retrieve");
  return `${res.json.knowledgeSources.length} sources, ${ready} ready`;
});

await run.test("POST /api/company rejects a payload with no name or slug", async () => {
  const res = await postJson("/api/company", { agentName: "Atlas" });
  const error = assertErrorEnvelope(res, 400);
  assertEqual(error.code, "BAD_REQUEST", "error.code");
  return error.message;
});

await run.test("POST /api/company creates the QA fixture company", async () => {
  const res = await postJson(
    "/api/company",
    { name: `QA Fixture ${RUN_ID}`, slug: assertSafeToBook(fx.companySlug), agentName: "Atlas" },
    { timeoutMs: 60_000 },
  );
  assertEqual(res.status, 201, "status");
  assertShape(res.json, { "company.id": "string", "company.slug": "string" });
  fx.companyId = track("companies", res.json.company.id);
  return `id ${fx.companyId}`;
});

/**
 * Two companies must never share one slug, because the slug IS the tenant
 * address: acme.grokfde.com and /fde/acme resolve through it. Rejecting the
 * duplicate and auto-suffixing it are both defensible; silently creating a
 * second row on the SAME slug is not, because the prospect link then resolves
 * to whichever row the query happens to return first.
 *
 * The route currently auto-suffixes (it answered 201 with "<slug>-2"), which is
 * undocumented in docs/API.md but safe as long as the original slug still
 * resolves to the original company. That is what this asserts.
 */
await run.test("POST /api/company never lets two companies share one slug", async () => {
  if (!fx.companyId) throw new Error("fixture company was not created");
  const res = await postJson("/api/company", { name: `QA Duplicate ${RUN_ID}`, slug: fx.companySlug });

  if (res.status >= 400) {
    const error = assertErrorEnvelope(res, 409);
    return `rejected cleanly: ${res.status} ${error.code}`;
  }

  assertEqual(res.status, 201, "status");
  assertShape(res.json, { "company.id": "string", "company.slug": "string" });
  // Track it before asserting anything, so a later failure cannot leak the row.
  track("companies", res.json.company.id);

  assert(
    res.json.company.slug !== fx.companySlug,
    `a second company was created on the SAME slug "${fx.companySlug}", so /fde/${fx.companySlug} is now ambiguous`,
  );

  const resolved = await request(`/api/company?slug=${encodeURIComponent(fx.companySlug)}`);
  assertEqual(resolved.status, 200, "original slug still resolves");
  assertEqual(
    resolved.json.company.id,
    fx.companyId,
    `the original slug now resolves to a different company, so an already-shared link changed tenant`,
  );

  return `auto-suffixed to "${res.json.company.slug}", original slug still resolves`;
});

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

await run.test("POST /api/knowledge/paste ingests text and returns a frozen source shape", async () => {
  if (!fx.companyId) throw new Error("fixture company was not created");
  const res = await postJson(
    "/api/knowledge/paste",
    {
      companyId: fx.companyId,
      title: `QA Overview ${RUN_ID}`,
      content:
        "Grok FDE deploys an AI forward-deployed engineer named Atlas. It meets prospects in chat, live voice, email, and Slack, and remembers their stack across sessions. It is a hackathon preview and is currently free.",
    },
    { timeoutMs: 90_000 },
  );
  assertEqual(res.status, 201, "status");
  assertShape(res.json, {
    "source.id": "string",
    "source.title": "string",
    "source.type": "string",
    "source.status": "string",
  });
  assertEqual(res.json.source.type, "paste", "source.type");
  assertOneOf(res.json.source.status, ["processing", "ready", "error"], "source.status");
  track("knowledge_sources", res.json.source.id);
  return `status ${res.json.source.status}`;
});

await run.test("POST /api/knowledge/paste rejects a non-uuid companyId", async () => {
  const res = await postJson("/api/knowledge/paste", { companyId: "not-a-uuid", title: "x", content: "y" });
  assertErrorEnvelope(res, 400);
  return "400 BAD_REQUEST";
});

await run.test("POST /api/knowledge/paste rejects empty content", async () => {
  const res = await postJson("/api/knowledge/paste", { companyId: fx.companyId || ABSENT_UUID, title: "x", content: "" });
  assertErrorEnvelope(res, 400);
  return "400 BAD_REQUEST";
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

await run.test("POST /api/conversations opens a session by companySlug", async () => {
  if (!fx.companyId) throw new Error("fixture company was not created");
  const res = await postJson("/api/conversations", {
    companySlug: fx.companySlug,
    companyName: qaName("prospect-co"),
    personName: qaName("prospect"),
  });
  assertEqual(res.status, 201, "status");
  assertShape(res.json, {
    "conversation.id": "string",
    "conversation.companyId": "string",
    "conversation.prospectId": "string",
    "prospect.id": "string",
    "prospect.stage": "string",
    "prospect.currentStack": "array",
  });
  fx.conversationId = track("conversations", res.json.conversation.id);
  fx.prospectId = track("prospects", res.json.prospect.id);
  trackConversationMessages(fx.conversationId);
  return `conversation ${fx.conversationId}`;
});

await run.test("POST /api/conversations resumes rather than duplicating for the same prospect", async () => {
  if (!fx.prospectId) throw new Error("fixture conversation was not created");
  const res = await postJson("/api/conversations", {
    companySlug: fx.companySlug,
    prospectId: fx.prospectId,
  });
  assertEqual(res.status, 201, "status");
  assertEqual(
    res.json.conversation.id,
    fx.conversationId,
    "conversation.id (a returning prospect must reuse their conversation, not start a new one)",
  );
  return "reused existing conversation";
});

await run.test("POST /api/conversations with neither companyId nor companySlug is a 400", async () => {
  const res = await postJson("/api/conversations", { personName: qaName("nobody") });
  const error = assertErrorEnvelope(res, 400);
  assertEqual(error.code, "BAD_REQUEST", "error.code");
  return error.message;
});

await run.test("POST /api/conversations with an unknown slug is a clean 404", async () => {
  const res = await postJson("/api/conversations", { companySlug: `qa-missing-${RUN_ID}` });
  assertErrorEnvelope(res, 404);
  return "404 NOT_FOUND";
});

await run.test("GET /api/conversations?companyId= lists conversations", async () => {
  const res = await request(`/api/conversations?companyId=${DEMO.id}`);
  assertEqual(res.status, 200, "status");
  assertShape(res.json, { conversations: "array" });
  for (const c of res.json.conversations.slice(0, 5)) {
    assertShape(c, { id: "string", companyId: "string" }, "conversation");
  }
  return `${res.json.conversations.length} conversations`;
});

await run.test("GET /api/conversations without companyId is a 400", async () => {
  const res = await request("/api/conversations");
  assertErrorEnvelope(res, 400);
  return "400 BAD_REQUEST";
});

await run.test("GET /api/conversations/:id returns the conversation bundle", async () => {
  if (!fx.conversationId) throw new Error("fixture conversation was not created");
  const res = await request(`/api/conversations/${fx.conversationId}`);
  assertEqual(res.status, 200, "status");
  assert(res.json != null, "response did not parse as JSON");
  return "200 OK";
});

await run.test("GET /api/conversations/:id for an absent id is a clean 404", async () => {
  const res = await request(`/api/conversations/${ABSENT_UUID}`);
  assertErrorEnvelope(res, 404);
  return "404 NOT_FOUND";
});

// ---------------------------------------------------------------------------
// Chat - the frozen response contract
// ---------------------------------------------------------------------------

await run.test(
  "POST /api/conversations/:id/message returns the frozen chat shape",
  async () => {
    if (!fx.conversationId) throw new Error("fixture conversation was not created");
    const res = await postJson(
      `/api/conversations/${fx.conversationId}/message`,
      { message: "We run a Django monolith on Heroku with Postgres. Would this fit our stack?" },
      { timeoutMs: CHAT_TIMEOUT_MS },
    );
    assertEqual(res.status, 200, "status");
    assertShape(res.json, {
      "message.id": "string",
      "message.role": "string",
      "message.content": "string",
      "message.createdAt": "string",
      "prospect.stage": "string",
      "prospect.summary": "string",
      "prospect.currentStack": "array",
      "prospect.painPoints": "array",
      "prospect.requirements": "array",
      "prospect.objections": "array",
      "prospect.nextAction": "string",
      events: "array",
    });
    assertEqual(res.json.message.role, "assistant", "message.role");
    assert(res.json.message.content.trim().length > 0, "assistant returned an empty message");
    const eventTypes = [
      "searching_knowledge",
      "searching_web",
      "using_tool",
      "generating_image",
      "prospect_updated",
      "needs_human",
    ];
    for (const ev of res.json.events) {
      assertShape(ev, { type: "string", label: "string" }, "event");
      assertOneOf(ev.type, eventTypes, "event.type");
    }
    return `${res.durationMs}ms, ${res.json.message.content.length} chars, stack=${JSON.stringify(res.json.prospect.currentStack)}`;
  },
);

await run.test("POST /api/conversations/:id/message rejects an empty message", async () => {
  if (!fx.conversationId) throw new Error("fixture conversation was not created");
  const res = await postJson(`/api/conversations/${fx.conversationId}/message`, { message: "" });
  const error = assertErrorEnvelope(res, 400);
  assertEqual(error.code, "BAD_REQUEST", "error.code");
  return error.message;
});

await run.test("POST /api/conversations/:id/message for an absent conversation is a clean 404", async () => {
  const res = await postJson(
    `/api/conversations/${ABSENT_UUID}/message`,
    { message: "hello" },
    { timeoutMs: CHAT_TIMEOUT_MS },
  );
  assertErrorEnvelope(res, 404);
  return "404 NOT_FOUND";
});

// ---------------------------------------------------------------------------
// Booking availability - read-only against the real demo company
// ---------------------------------------------------------------------------

await run.test("GET /api/bookings/availability?month= returns day markers for the demo company", async () => {
  const month = ymdAhead(7).slice(0, 7);
  const res = await request(
    `/api/bookings/availability?slug=${DEMO.slug}&timeZone=${encodeURIComponent(TZ)}&month=${month}`,
  );
  assertEqual(res.status, 200, "status");
  assertShape(res.json, {
    "company.slug": "string",
    month: "string",
    timeZone: "string",
    durationMinutes: "number",
    days: "array",
  });
  assert(res.json.days.length > 0, `no bookable days returned for ${month} - the booking page calendar would be empty`);
  for (const day of res.json.days) {
    assertShape(day, { date: "string", availableCount: "number" }, "day");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(day.date), `day.date "${day.date}" is not YYYY-MM-DD`);
    assert(day.availableCount > 0, `day ${day.date} was returned with availableCount ${day.availableCount}`);
  }
  return `${res.json.days.length} bookable days in ${month}`;
});

await run.test("GET /api/bookings/availability?date= returns slots for a day", async () => {
  const date = ymdAhead(7);
  const res = await request(
    `/api/bookings/availability?slug=${DEMO.slug}&timeZone=${encodeURIComponent(TZ)}&date=${date}`,
  );
  assertEqual(res.status, 200, "status");
  assertShape(res.json, { date: "string", timeZone: "string", slots: "array" });
  assert(res.json.slots.length > 0, `no slots on ${date} - a guest 7 days out could not book`);
  for (const slot of res.json.slots) {
    assertShape(slot, { startsAt: "string", endsAt: "string", label: "string" }, "slot");
    assert(!Number.isNaN(Date.parse(slot.startsAt)), `slot.startsAt "${slot.startsAt}" is not a parseable date`);
    assert(slot.label.trim().length > 0, "slot.label is empty");
  }
  return `${res.json.slots.length} slots on ${date}`;
});

await run.test("GET /api/bookings/availability rejects an invalid timezone", async () => {
  const res = await request(`/api/bookings/availability?slug=${DEMO.slug}&timeZone=Nowhere/Fake&month=${ymdAhead(7).slice(0, 7)}`);
  const error = assertErrorEnvelope(res, 400);
  assertEqual(error.code, "BAD_REQUEST", "error.code");
  return error.message;
});

await run.test("GET /api/bookings/availability with neither date nor month is a 400", async () => {
  const res = await request(`/api/bookings/availability?slug=${DEMO.slug}&timeZone=${encodeURIComponent(TZ)}`);
  assertErrorEnvelope(res, 400);
  return "400 BAD_REQUEST";
});

await run.test("GET /api/bookings/availability for an unknown company is a clean 404", async () => {
  const res = await request(
    `/api/bookings/availability?slug=qa-missing-${RUN_ID}&timeZone=${encodeURIComponent(TZ)}&date=${ymdAhead(7)}`,
  );
  assertErrorEnvelope(res, 404);
  return "404 NOT_FOUND";
});

// ---------------------------------------------------------------------------
// Booking creation - writes go to the QA fixture company
// ---------------------------------------------------------------------------

await run.test("POST /api/bookings creates a demo booking on a real free slot", async () => {
  if (!fx.companyId) throw new Error("fixture company was not created");
  const date = ymdAhead(7);
  const avail = await request(
    `/api/bookings/availability?slug=${fx.companySlug}&timeZone=${encodeURIComponent(TZ)}&date=${date}`,
  );
  assertEqual(avail.status, 200, "availability status");
  assert(avail.json.slots.length > 0, `no free slot on ${date} to book against`);
  const slot = avail.json.slots[Math.floor(avail.json.slots.length / 2)];
  fx.bookingSlotIso = slot.startsAt;

  const res = await postJson("/api/bookings", {
    slug: assertSafeToBook(fx.companySlug),
    startsAt: slot.startsAt,
    timeZone: TZ,
    guestName: qaName("guest"),
    guestEmail: qaEmail("guest"),
    guestCompany: qaName("guest-co"),
    notes: "QA suite booking - safe to delete.",
  }, { timeoutMs: 60_000 });

  assertEqual(res.status, 201, "status");
  assertShape(res.json, {
    "booking.id": "string",
    "booking.startsAt": "string",
    "booking.status": "string",
  });
  const b = res.json.booking;
  track("demo_bookings", b.id);
  if (b.prospectId) track("prospects", b.prospectId);
  if (b.conversationId) {
    track("conversations", b.conversationId);
    trackConversationMessages(b.conversationId);
  }
  assertEqual(b.status, "confirmed", "booking.status");
  assertEqual(new Date(b.startsAt).toISOString(), new Date(slot.startsAt).toISOString(), "booking.startsAt");
  const token = b.joinToken || b.join_token;
  assert(typeof token === "string" && token.length > 0, "booking has no join token, so the guest gets no join link");
  fx.joinToken = token;
  return `${b.id} at ${slot.label}`;
});

await run.test("POST /api/bookings rejects double-booking the same slot", async () => {
  if (!fx.bookingSlotIso) throw new Error("no booking was created to collide with");
  const res = await postJson("/api/bookings", {
    slug: assertSafeToBook(fx.companySlug),
    startsAt: fx.bookingSlotIso,
    timeZone: TZ,
    guestName: qaName("guest-double"),
    guestEmail: qaEmail("guest-double"),
  }, { timeoutMs: 60_000 });
  const error = assertErrorEnvelope(res, 409);
  // A double book that silently succeeds puts two founders in one slot.
  assert(!res.json.booking, "double booking returned a booking object");
  return `${res.status} ${error.message}`;
});

await run.test("POST /api/bookings rejects an invalid email", async () => {
  const res = await postJson("/api/bookings", {
    slug: assertSafeToBook(fx.companySlug),
    startsAt: fx.bookingSlotIso || new Date(Date.now() + 86_400_000).toISOString(),
    timeZone: TZ,
    guestName: qaName("bad-email"),
    guestEmail: "not-an-email",
  });
  assertErrorEnvelope(res, 400);
  return "400 BAD_REQUEST";
});

await run.test("POST /api/bookings rejects a start time in the past", async () => {
  const res = await postJson("/api/bookings", {
    slug: assertSafeToBook(fx.companySlug),
    startsAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    timeZone: TZ,
    guestName: qaName("past"),
    guestEmail: qaEmail("past"),
  });
  assertErrorEnvelope(res, [400, 409]);
  return "rejected";
});

/**
 * The definitive PII check, run while a booking this suite created actually
 * exists. auth.mjs asserts the same thing, but cannot prove it when the table
 * is empty; here there is guaranteed to be a row with a known guest email.
 */
await run.test("GET /api/bookings?slug= does not hand guest PII to an anonymous caller", async () => {
  if (!fx.companyId) throw new Error("fixture company was not created");
  const res = await request(`/api/bookings?slug=${fx.companySlug}`);
  if (res.status === 401 || res.status === 403) return `HTTP ${res.status}, gated`;

  assertEqual(res.status, 200, "status");
  const bookings = res.json?.bookings ?? [];
  assert(bookings.length > 0, "no bookings came back, so this proves nothing");

  const leaking = bookings.filter((b) => b.guestEmail || b.guest_email || b.guestName || b.guest_name);
  assert(
    leaking.length === 0,
    `${leaking.length} of ${bookings.length} booking(s) expose guest identity without a session, e.g. ` +
      `${JSON.stringify(leaking[0].guestName ?? leaking[0].guest_name)} <${leaking[0].guestEmail ?? leaking[0].guest_email}>. ` +
      "These are real people who booked a call, and this is the data behind /demos.",
  );
  return `${bookings.length} booking(s), no guest identity exposed`;
});

await run.test("GET /api/bookings?slug= lists bookings for a company", async () => {
  const res = await request(`/api/bookings?slug=${fx.companySlug}`);
  assertEqual(res.status, 200, "status");
  assertShape(res.json, { bookings: "array" });
  return `${res.json.bookings.length} bookings`;
});

await run.test("GET /api/bookings without slug or company header is a 400", async () => {
  const res = await request("/api/bookings");
  assertErrorEnvelope(res, 400);
  return "400 BAD_REQUEST";
});

await run.test("GET /api/bookings/:id for an absent booking is a clean 404", async () => {
  const res = await request(`/api/bookings/${ABSENT_UUID}`);
  assertErrorEnvelope(res, 404);
  return "404 NOT_FOUND";
});

// ---------------------------------------------------------------------------
// Join token
// ---------------------------------------------------------------------------

await run.test("GET /api/bookings/join/:token resolves the booking and join window", async () => {
  if (!fx.joinToken) throw new Error("no booking join token was captured");
  const res = await request(`/api/bookings/join/${fx.joinToken}`);
  assertEqual(res.status, 200, "status");
  assertShape(res.json, {
    "booking.id": "string",
    "join.canJoin": "boolean",
    fdePath: "string",
  });
  assert(
    res.json.fdePath.startsWith(`/fde/${fx.companySlug}`),
    `fdePath should point at the company FDE room, got "${res.json.fdePath}"`,
  );
  return `canJoin=${res.json.join.canJoin} -> ${res.json.fdePath}`;
});

await run.test("GET /api/bookings/join/:token for an unknown token is a clean 404", async () => {
  const res = await request(`/api/bookings/join/qa-nonexistent-${RUN_ID}`);
  const error = assertErrorEnvelope(res, 404);
  assertEqual(error.code, "NOT_FOUND", "error.code");
  return error.message;
});

await run.test("POST /api/bookings/join/:token outside the join window is refused, not a 500", async () => {
  if (!fx.joinToken) throw new Error("no booking join token was captured");
  // The fixture booking is a week out, so the join window is closed.
  const res = await postJson(`/api/bookings/join/${fx.joinToken}`, {});
  assertErrorEnvelope(res, [400, 403]);
  return `${res.status} refused early join`;
});

// ---------------------------------------------------------------------------
// Voice token
// ---------------------------------------------------------------------------

await run.test("GET /api/voice/token mints a realtime credential with session context", async () => {
  if (!fx.conversationId) throw new Error("fixture conversation was not created");
  const res = await request(`/api/voice/token?conversationId=${fx.conversationId}`, { timeoutMs: 45_000 });
  assertEqual(res.status, 200, "status");
  assertShape(res.json, {
    token: "string",
    model: "string",
    realtimeUrl: "string",
    "session.instructions": "string",
    "session.voice": "string",
    "session.turn_detection.type": "string",
    "context.agentName": "string",
    "context.prospect.currentStack": "array",
  });
  assert(
    res.json.realtimeUrl.startsWith("wss://api.x.ai/v1/realtime"),
    `realtimeUrl should be the xAI realtime endpoint, got "${res.json.realtimeUrl}"`,
  );
  assert(
    res.json.session.instructions.length > 100,
    `session.instructions is only ${res.json.session.instructions.length} chars - the agent would have no identity on the call`,
  );
  assert(res.json.mock !== true, "voice token is a MOCK credential - the real xAI call would not connect");
  assert(
    Array.isArray(res.json.websocketProtocols) && res.json.websocketProtocols[0]?.startsWith("xai-client-secret."),
    "websocketProtocols must carry the xai-client-secret subprotocol the browser connects with",
  );
  return `${res.json.model}, voice=${res.json.session.voice}, ${res.json.session.instructions.length} chars of instructions`;
});

await run.test("GET /api/voice/token without conversationId is a 400", async () => {
  const res = await request("/api/voice/token");
  const error = assertErrorEnvelope(res, 400);
  assertEqual(error.code, "BAD_REQUEST", "error.code");
  return error.message;
});

await run.test("GET /api/voice/token for an absent conversation is a clean 404", async () => {
  const res = await request(`/api/voice/token?conversationId=${ABSENT_UUID}`, { timeoutMs: 45_000 });
  assertErrorEnvelope(res, 404);
  return "404 NOT_FOUND";
});

await run.test("POST /api/voice/token accepts a JSON body", async () => {
  if (!fx.conversationId) throw new Error("fixture conversation was not created");
  const res = await postJson("/api/voice/token", { conversationId: fx.conversationId }, { timeoutMs: 45_000 });
  assertEqual(res.status, 200, "status");
  assertShape(res.json, { token: "string", realtimeUrl: "string" });
  return "200 OK";
});

// ---------------------------------------------------------------------------
// Prospects
// ---------------------------------------------------------------------------

await run.test("GET /api/prospects?companyId= lists prospects", async () => {
  const res = await request(`/api/prospects?companyId=${DEMO.id}`);
  assertEqual(res.status, 200, "status");
  assertShape(res.json, { prospects: "array" });
  return `${res.json.prospects.length} prospects`;
});

await run.test("GET /api/prospects without companyId is a 400", async () => {
  const res = await request("/api/prospects");
  assertErrorEnvelope(res, 400);
  return "400 BAD_REQUEST";
});

await run.test("GET /api/prospects/:id returns the fixture prospect", async () => {
  if (!fx.prospectId) throw new Error("fixture prospect was not created");
  const res = await request(`/api/prospects/${fx.prospectId}`);
  assertEqual(res.status, 200, "status");
  assertShape(res.json, { "prospect.id": "string" });
  return "200 OK";
});

await run.test("GET /api/prospects/:id for an absent prospect is a clean 404", async () => {
  const res = await request(`/api/prospects/${ABSENT_UUID}`);
  assertErrorEnvelope(res, 404);
  return "404 NOT_FOUND";
});

await run.test("PATCH /api/prospects/:id rejects an invalid payload", async () => {
  const res = await request(`/api/prospects/${fx.prospectId || ABSENT_UUID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage: 12345 }),
  });
  assertErrorEnvelope(res, [400, 404]);
  return `${res.status}`;
});

// ---------------------------------------------------------------------------
// Contract sweep - every remaining route rejects bad input cleanly
// ---------------------------------------------------------------------------

/**
 * Each entry asserts the same invariant: an unhappy request returns a JSON
 * error envelope with a 4xx status. A 500 or an HTML page here is a real bug,
 * because these responses are what a broken client sees.
 */
const sweep = [
  { name: "POST /api/mcp (invalid payload)", path: "/api/mcp", method: "POST", body: {}, expect: 400 },
  { name: "GET /api/mcp (missing companyId)", path: "/api/mcp", expect: 400 },
  { name: "GET /api/mcp?companyId= (happy)", path: `/api/mcp?companyId=${DEMO.id}`, expect: 200, shape: { servers: "array" } },
  { name: "POST /api/knowledge/url (invalid payload)", path: "/api/knowledge/url", method: "POST", body: {}, expect: 400 },
  { name: "POST /api/knowledge/upload (no body)", path: "/api/knowledge/upload", method: "POST", body: {}, expect: 400 },
  { name: "POST /api/calls/complete (invalid payload)", path: "/api/calls/complete", method: "POST", body: {}, expect: 400 },
  { name: "POST /api/assets/architecture (invalid payload)", path: "/api/assets/architecture", method: "POST", body: {}, expect: 400 },
  { name: "POST /api/assets/image (invalid payload)", path: "/api/assets/image", method: "POST", body: {}, expect: 400 },
  { name: "POST /api/assets/video (invalid payload)", path: "/api/assets/video", method: "POST", body: {}, expect: 400 },
  { name: "POST /api/email/send (invalid payload)", path: "/api/email/send", method: "POST", body: {}, expect: 400 },
  { name: "POST /api/email/inbound (invalid payload)", path: "/api/email/inbound", method: "POST", body: {}, expect: 400 },
  { name: "GET /api/escalations (missing companyId)", path: "/api/escalations", expect: 400 },
  { name: "GET /api/escalations?companyId= (happy)", path: `/api/escalations?companyId=${DEMO.id}`, expect: 200, shape: { escalations: "array" } },
  { name: "PATCH /api/escalations (invalid payload)", path: "/api/escalations", method: "PATCH", body: {}, expect: [400, 404] },
  { name: "GET /api/field-signals (happy)", path: `/api/field-signals?companyId=${DEMO.id}`, expect: 200 },
  { name: "POST /api/field-signals (invalid payload)", path: "/api/field-signals", method: "POST", body: {}, expect: 400 },
  { name: "GET /api/accounts?companyId= (happy)", path: `/api/accounts?companyId=${DEMO.id}`, expect: 200 },
  { name: "POST /api/accounts (invalid payload)", path: "/api/accounts", method: "POST", body: {}, expect: 400 },
  { name: "GET /api/accounts/:id (absent)", path: `/api/accounts/${ABSENT_UUID}`, expect: [400, 404] },
  { name: "GET /api/accounts/:id/status (absent)", path: `/api/accounts/${ABSENT_UUID}/status`, expect: [400, 404] },
  { name: "GET /api/accounts/:id/timeline (absent)", path: `/api/accounts/${ABSENT_UUID}/timeline`, expect: [400, 404] },
  { name: "GET /api/accounts/:id/slack (absent)", path: `/api/accounts/${ABSENT_UUID}/slack`, expect: [400, 404] },
  { name: "POST /api/accounts/:id/blockers (invalid payload)", path: `/api/accounts/${ABSENT_UUID}/blockers`, method: "POST", body: {}, expect: [400, 404] },
  { name: "POST /api/accounts/:id/decisions (invalid payload)", path: `/api/accounts/${ABSENT_UUID}/decisions`, method: "POST", body: {}, expect: [400, 404] },
  { name: "POST /api/accounts/:id/issues (invalid payload)", path: `/api/accounts/${ABSENT_UUID}/issues`, method: "POST", body: {}, expect: [400, 404] },
  { name: "POST /api/accounts/:id/deployment (invalid payload)", path: `/api/accounts/${ABSENT_UUID}/deployment`, method: "POST", body: {}, expect: [400, 404] },
  { name: "GET /api/workspaces (missing params)", path: "/api/workspaces", expect: 400 },
  { name: "POST /api/workspaces (invalid payload)", path: "/api/workspaces", method: "POST", body: {}, expect: 400 },
  { name: "GET /api/workspaces/:id (absent)", path: `/api/workspaces/${ABSENT_UUID}`, expect: [400, 404] },
  { name: "POST /api/workspaces/:id/repositories (invalid payload)", path: `/api/workspaces/${ABSENT_UUID}/repositories`, method: "POST", body: {}, expect: [400, 404] },
  { name: "POST /api/workspaces/:id/plan (absent workspace)", path: `/api/workspaces/${ABSENT_UUID}/plan`, method: "POST", body: {}, expect: [400, 404] },
  { name: "POST /api/workspaces/:id/build (missing planId)", path: `/api/workspaces/${ABSENT_UUID}/build`, method: "POST", body: {}, expect: [400, 404] },
  { name: "POST /api/workspaces/:id/analyze (absent workspace)", path: `/api/workspaces/${ABSENT_UUID}/analyze`, method: "POST", body: {}, expect: [400, 404] },
  { name: "GET /api/implementation-runs/:id (absent)", path: `/api/implementation-runs/${ABSENT_UUID}`, expect: [400, 404] },
  { name: "POST /api/implementation-runs/:id/pull-request (absent)", path: `/api/implementation-runs/${ABSENT_UUID}/pull-request`, method: "POST", body: {}, expect: [400, 404] },
  { name: "POST /api/demo/slack-message (invalid payload)", path: "/api/demo/slack-message", method: "POST", body: {}, expect: [400, 403] },
  { name: "POST /api/slack/connect-channel (invalid payload)", path: "/api/slack/connect-channel", method: "POST", body: {}, expect: 400 },
  { name: "GET /api/slack/oauth/callback (missing code)", path: "/api/slack/oauth/callback", expect: 400 },
  { name: "GET /api/slack/install", path: "/api/slack/install", expect: [200, 302, 307, 400, 500], allowAnyStatus: true },
];

for (const entry of sweep) {
  await run.test(entry.name, async () => {
    const res = entry.method && entry.method !== "GET"
      ? await request(entry.path, {
          method: entry.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entry.body ?? {}),
          timeoutMs: 45_000,
        })
      : await request(entry.path, { timeoutMs: 45_000 });

    assert(
      !res.text.trimStart().startsWith("<"),
      `returned an HTML page (status ${res.status}) instead of JSON: ${res.text.slice(0, 100)}`,
    );

    if (entry.allowAnyStatus) {
      assertOneOf(res.status, entry.expect, "status");
      return `status ${res.status}`;
    }

    const expected = Array.isArray(entry.expect) ? entry.expect : [entry.expect];
    if (expected.every((s) => s >= 400)) {
      const error = assertErrorEnvelope(res, expected);
      return `${res.status} ${error.code}`;
    }
    assertOneOf(res.status, expected, "status");
    if (entry.shape) assertShape(res.json, entry.shape);
    return `status ${res.status}`;
  });
}

// ---------------------------------------------------------------------------
// Account sub-resources for an account that does not exist.
//
// These are collection endpoints, so 200 with an empty collection is a
// legitimate answer and 404 is equally legitimate. What is never acceptable is
// inventing rows for an unknown account, or falling over with a 500. Note that
// the sibling endpoints (/, /status, /timeline, /slack) do return 404 here, so
// the API is internally inconsistent about it.
// ---------------------------------------------------------------------------

const accountCollections = [
  { path: "deployment", key: "deployment" },
  { path: "blockers", key: "blockers" },
  { path: "decisions", key: "decisions" },
  { path: "issues", key: "issues" },
];

for (const { path, key } of accountCollections) {
  await run.test(`GET /api/accounts/:id/${path} for an absent account returns nothing, not junk`, async () => {
    const res = await request(`/api/accounts/${ABSENT_UUID}/${path}`, { timeoutMs: 45_000 });
    assert(!res.text.trimStart().startsWith("<"), `returned an HTML page (status ${res.status})`);
    assert(res.status < 500, `returned ${res.status}; a missing account must never be a server error`);
    if (res.status >= 400) {
      assertErrorEnvelope(res, [400, 404]);
      return `${res.status} error envelope`;
    }
    assertEqual(res.status, 200, "status");
    const value = res.json?.[key];
    const empty = value == null || (Array.isArray(value) && value.length === 0);
    assert(empty, `returned ${JSON.stringify(value).slice(0, 120)} for an account that does not exist`);
    return "200 with an empty collection";
  });
}

// ---------------------------------------------------------------------------
// Slack events - this endpoint accepts writes from the public internet
// ---------------------------------------------------------------------------

await run.test("POST /api/slack/events answers the url_verification challenge", async () => {
  const challenge = `qa-challenge-${RUN_ID}`;
  const res = await postJson("/api/slack/events", { type: "url_verification", challenge });
  assertEqual(res.status, 200, "status");
  assertEqual(res.json?.challenge, challenge, "challenge echo");
  return "challenge echoed";
});

await run.test("POST /api/slack/events rejects an unsigned forged event", async () => {
  // Slack signs every request with x-slack-signature over the raw body. Without
  // verifying it, anyone who knows the URL can forge an event_callback and make
  // the agent post into a connected customer channel.
  const res = await postJson("/api/slack/events", {
    type: "event_callback",
    team_id: `T_QA_${RUN_ID}`,
    event: {
      type: "app_mention",
      channel: `C_QA_${RUN_ID}`,
      user: `U_QA_${RUN_ID}`,
      text: `<@atlas> qa forged event ${RUN_ID}`,
      ts: `${Date.now() / 1000}`,
    },
  }, { timeoutMs: 60_000 });

  assert(
    res.status === 401 || res.status === 403,
    `an unsigned forged Slack event was accepted with status ${res.status} (body: ${res.text.slice(0, 160)}). ` +
      "The route never reads x-slack-signature, so this endpoint takes writes from anyone on the internet.",
  );
  return `${res.status} rejected`;
});

// ---------------------------------------------------------------------------

console.log("");
await teardown();
run.finish();
