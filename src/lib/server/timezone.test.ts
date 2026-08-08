/**
 * Lightweight sanity checks for timezone wall-clock conversion.
 * Run: npx tsx src/lib/server/timezone.test.ts
 */
import { getTzParts, wallTimeToUtc, ymdInZone } from "./timezone";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Noon New York on a known date should round-trip
const ny = wallTimeToUtc(2026, 6, 15, 12, 0, "America/New_York");
const parts = getTzParts(ny, "America/New_York");
assert(parts.year === 2026 && parts.month === 6 && parts.day === 15, "NY date");
assert(parts.hour === 12 && parts.minute === 0, `NY noon got ${parts.hour}:${parts.minute}`);

// Tokyo evening
const tk = wallTimeToUtc(2026, 1, 1, 23, 30, "Asia/Tokyo");
const tkParts = getTzParts(tk, "Asia/Tokyo");
assert(tkParts.hour === 23 && tkParts.minute === 30, "Tokyo 23:30");

// ymd helper
assert(ymdInZone(ny, "America/New_York") === "2026-06-15", "ymd NY");

// Half-hour UTC slot uniqueness sanity
const a = wallTimeToUtc(2026, 8, 8, 0, 0, "UTC");
const b = wallTimeToUtc(2026, 8, 8, 0, 30, "UTC");
assert(b.getTime() - a.getTime() === 30 * 60_000, "30m delta");

console.log("timezone.test.ts: ok");
