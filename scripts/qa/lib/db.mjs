/**
 * Cleanup registry for QA artifacts.
 *
 * Every row a suite creates is registered here by id, and only those ids are
 * ever deleted. Nothing is deleted by pattern match, so data the suite did not
 * create cannot be touched even if a QA name collides with a real one.
 */
import { createClient } from "@supabase/supabase-js";
// Loads .env.local as a side effect. Imported here so this module works no
// matter which suite pulls it in first, or whether one does at all.
import { loadEnv } from "./harness.mjs";

let client = null;

export function supabaseAdmin() {
  if (client) return client;
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** Child rows first, parents last. */
const DELETE_ORDER = [
  "demo_bookings",
  "messages",
  "conversations",
  "prospects",
  "knowledge_sources",
  "companies",
];

const registry = new Map(DELETE_ORDER.map((t) => [t, new Set()]));

export function track(table, id) {
  if (!id) return id;
  if (!registry.has(table)) registry.set(table, new Set());
  registry.get(table).add(id);
  return id;
}

/**
 * Track everything created underneath a conversation so its messages go too.
 * Messages are deleted by conversation_id rather than by message id, which is
 * still scoped strictly to conversations this run created.
 */
const conversationsForMessages = new Set();
export function trackConversationMessages(conversationId) {
  if (conversationId) conversationsForMessages.add(conversationId);
}

/**
 * The QA namespace. Nothing outside these two patterns is ever swept, and both
 * are shapes only this suite produces: fixture companies are created with a
 * "qa-co-" slug, and guests are booked on a ".invalid" address, which is a
 * reserved TLD that can never belong to a real person.
 */
const ORPHAN_COMPANY_SLUG = "qa-co-%";
const ORPHAN_GUEST_EMAIL = "qa-%@qa.invalid";

/**
 * Remove QA rows left behind by an EARLIER run.
 *
 * A run that is killed mid-flight (a timeout, a Ctrl-C, a pkill) never reaches
 * its own cleanup, and the fixture company it created then sits in the
 * companies table. That matters more than it sounds: GET /api/company returns
 * companies newest-first, so a stray fixture becomes the "active" company for
 * the operator UI and its booking shows up on /demos.
 *
 * Deleting the company is enough on its own, because company_id cascades to
 * prospects, conversations, messages, knowledge_sources, and demo_bookings.
 */
export async function sweepOrphans({ verbose = true } = {}) {
  const db = supabaseAdmin();
  if (!db) {
    if (verbose) console.log("  sweep skipped: no SUPABASE_SERVICE_ROLE_KEY in env");
    return { skipped: true, deleted: {}, errors: [] };
  }

  const deleted = {};
  const errors = [];

  // Bookings first, in case a QA guest was ever booked outside a QA company.
  const bookings = await db
    .from("demo_bookings")
    .delete({ count: "exact" })
    .like("guest_email", ORPHAN_GUEST_EMAIL);
  if (bookings.error) errors.push(`demo_bookings: ${bookings.error.message}`);
  else deleted.demo_bookings = bookings.count || 0;

  // Then the fixture companies, which cascade to everything beneath them.
  const companies = await db
    .from("companies")
    .delete({ count: "exact" })
    .like("slug", ORPHAN_COMPANY_SLUG);
  if (companies.error) errors.push(`companies: ${companies.error.message}`);
  else deleted.companies = companies.count || 0;

  const total = Object.values(deleted).reduce((a, b) => a + b, 0);
  if (verbose) {
    console.log(
      total > 0
        ? `  swept ${total} orphaned QA row(s) from earlier runs: ${Object.entries(deleted)
            .filter(([, n]) => n > 0)
            .map(([t, n]) => `${t}=${n}`)
            .join(" ")}`
        : "  no orphaned QA rows from earlier runs",
    );
  }
  if (errors.length && verbose) console.log(`  sweep errors: ${errors.join("; ")}`);

  return { skipped: false, deleted, errors };
}

export async function cleanup({ verbose = true } = {}) {
  const db = supabaseAdmin();
  if (!db) {
    if (verbose) console.log("  cleanup skipped: no SUPABASE_SERVICE_ROLE_KEY in env");
    return { skipped: true, deleted: {}, errors: [] };
  }

  const deleted = {};
  const errors = [];

  for (const convId of conversationsForMessages) {
    const { error, count } = await db
      .from("messages")
      .delete({ count: "exact" })
      .eq("conversation_id", convId);
    if (error) errors.push(`messages(conversation ${convId}): ${error.message}`);
    else deleted.messages = (deleted.messages || 0) + (count || 0);
  }

  for (const table of DELETE_ORDER) {
    if (table === "messages") continue;
    const ids = [...(registry.get(table) || [])];
    if (ids.length === 0) continue;
    const { error, count } = await db.from(table).delete({ count: "exact" }).in("id", ids);
    if (error) errors.push(`${table}: ${error.message}`);
    else deleted[table] = (deleted[table] || 0) + (count || 0);
  }

  if (verbose) {
    const summary = Object.entries(deleted)
      .map(([t, n]) => `${t}=${n}`)
      .join(" ");
    console.log(`  cleanup: ${summary || "nothing to remove"}${errors.length ? ` (errors: ${errors.join("; ")})` : ""}`);
  }

  return { skipped: false, deleted, errors };
}
