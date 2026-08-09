#!/usr/bin/env node
/**
 * Remove QA rows left behind by an interrupted run.
 *
 * The suite cleans up after itself, including on SIGINT and SIGTERM, but a run
 * that is hard-killed (SIGKILL, a crashed machine) cannot. This is the manual
 * recovery: run it before a demo if a QA run was ever interrupted.
 *
 * It deletes ONLY the QA namespace, which is two shapes nothing else produces:
 * companies with a "qa-co-" slug, and bookings whose guest email is on the
 * reserved ".invalid" TLD. Nothing else is touched, ever.
 */
import { sweepOrphans } from "./lib/db.mjs";

console.log("\nSweeping orphaned QA rows\n");
const result = await sweepOrphans();

if (result.skipped) {
  console.error("\nCould not connect: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local\n");
  process.exit(2);
}
if (result.errors.length) {
  console.error(`\nFinished with errors: ${result.errors.join("; ")}\n`);
  process.exit(1);
}
console.log("");
