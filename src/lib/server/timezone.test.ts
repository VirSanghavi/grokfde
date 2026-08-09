/**
 * Timezone regression tests, with the DST cases that matter.
 * Run: npx tsx src/lib/server/timezone.test.ts
 *
 * The bug this guards against: a single-pass offset correction in
 * `wallTimeToUtc` silently shifted an eight hour band of every DST
 * spring-forward day by one hour, so a guest who picked 3:00 PM was booked at
 * 4:00 PM with no error anywhere. Nothing in the product surfaces that, which
 * is exactly why it needs a test.
 */
import {
  getTzParts,
  startOfDayInZone,
  todayInZone,
  wallTimeToUtc,
  wallTimeToUtcStrict,
  ymdInZone,
  zoneOffsetMs,
} from "./timezone";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${msg}`);
  }
}

function rendersAs(
  tz: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): boolean {
  const p = getTzParts(wallTimeToUtc(y, mo, d, h, mi, tz), tz);
  return (
    p.year === y && p.month === mo && p.day === d && p.hour === h && p.minute === mi
  );
}

/* ── Round trips on ordinary days ─────────────────────────────────────── */

const ny = wallTimeToUtc(2026, 6, 15, 12, 0, "America/New_York");
const nyParts = getTzParts(ny, "America/New_York");
assert(
  nyParts.year === 2026 && nyParts.month === 6 && nyParts.day === 15,
  "New York date round trip",
);
assert(nyParts.hour === 12 && nyParts.minute === 0, "New York noon round trip");
assert(ymdInZone(ny, "America/New_York") === "2026-06-15", "ymdInZone New York");

const tk = getTzParts(wallTimeToUtc(2026, 1, 1, 23, 30, "Asia/Tokyo"), "Asia/Tokyo");
assert(tk.hour === 23 && tk.minute === 30, "Tokyo 23:30 round trip");

const a = wallTimeToUtc(2026, 8, 8, 0, 0, "UTC");
const b = wallTimeToUtc(2026, 8, 8, 0, 30, "UTC");
assert(b.getTime() - a.getTime() === 30 * 60_000, "30 minute delta in UTC");

/* ── Offset-with-minutes zones ────────────────────────────────────────── */

assert(rendersAs("Asia/Kathmandu", 2026, 8, 20, 9, 30), "Kathmandu +5:45 round trip");
assert(rendersAs("Asia/Kolkata", 2026, 8, 20, 0, 0), "Kolkata +5:30 midnight");
assert(
  zoneOffsetMs(Date.UTC(2026, 7, 20), "Asia/Kathmandu") === 5 * 3600_000 + 45 * 60_000,
  "Kathmandu offset is +5:45",
);

/* ── The spring-forward band that used to shift by an hour ────────────── */

// America/Los_Angeles 2027-03-14: clocks jump 02:00 to 03:00.
// 02:00 and 02:30 do not exist. 03:00 through 09:59 is the band the
// single-pass implementation got wrong.
for (const [h, mi] of [
  [0, 0],
  [1, 30],
  [3, 0],
  [3, 30],
  [4, 0],
  [8, 0],
  [9, 30],
  [12, 0],
  [23, 30],
] as [number, number][]) {
  assert(
    rendersAs("America/Los_Angeles", 2027, 3, 14, h, mi),
    `Los Angeles spring forward day renders ${h}:${String(mi).padStart(2, "0")}`,
  );
}

assert(
  wallTimeToUtcStrict(2027, 3, 14, 2, 0, "America/Los_Angeles") === null,
  "02:00 does not exist on the Los Angeles spring forward day",
);
assert(
  wallTimeToUtcStrict(2027, 3, 14, 2, 30, "America/Los_Angeles") === null,
  "02:30 does not exist on the Los Angeles spring forward day",
);
assert(
  wallTimeToUtcStrict(2027, 3, 14, 3, 0, "America/Los_Angeles") !== null,
  "03:00 does exist on the Los Angeles spring forward day",
);

// Europe/London 2027-03-28: clocks jump 01:00 to 02:00.
assert(
  wallTimeToUtcStrict(2027, 3, 28, 1, 0, "Europe/London") === null,
  "01:00 does not exist on the London spring forward day",
);
for (const h of [0, 2, 3, 12, 23]) {
  assert(rendersAs("Europe/London", 2027, 3, 28, h, 0), `London renders ${h}:00`);
}

// Australia/Lord_Howe has a 30 minute DST shift, which breaks naive math.
assert(
  wallTimeToUtcStrict(2026, 10, 4, 2, 0, "Australia/Lord_Howe") === null,
  "02:00 does not exist on the Lord Howe spring forward day",
);
assert(rendersAs("Australia/Lord_Howe", 2026, 10, 4, 3, 0), "Lord Howe renders 03:00");

/* ── Fall back: the repeated hour must resolve, not error ─────────────── */

for (const [h, mi] of [
  [0, 30],
  [1, 0],
  [1, 30],
  [2, 0],
  [3, 0],
  [12, 0],
  [23, 30],
] as [number, number][]) {
  assert(
    rendersAs("America/Los_Angeles", 2026, 11, 1, h, mi),
    `Los Angeles fall back day renders ${h}:${String(mi).padStart(2, "0")}`,
  );
}

/* ── Day length: DST changes how many half hours a day holds ──────────── */

function halfHoursInDay(ymd: string, tz: string): number {
  const start = startOfDayInZone(ymd, tz).getTime();
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
  const next = startOfDayInZone(
    `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDate.getUTCDate()).padStart(2, "0")}`,
    tz,
  ).getTime();
  return (next - start) / (30 * 60_000);
}

assert(
  halfHoursInDay("2026-08-20", "America/Los_Angeles") === 48,
  "an ordinary day holds 48 half hours",
);
assert(
  halfHoursInDay("2027-03-14", "America/Los_Angeles") === 46,
  "a spring forward day holds 46 half hours",
);
assert(
  halfHoursInDay("2026-11-01", "America/Los_Angeles") === 50,
  "a fall back day holds 50 half hours",
);
assert(
  halfHoursInDay("2026-10-04", "Australia/Lord_Howe") === 47,
  "a 30 minute DST shift day holds 47 half hours",
);

/* ── Day boundaries, including a zone that skips midnight itself ──────── */

// America/Santiago springs forward AT midnight, so 00:00 never happens.
const santiago = startOfDayInZone("2026-09-06", "America/Santiago");
assert(
  ymdInZone(santiago, "America/Santiago") === "2026-09-06",
  "Santiago day start lands inside the right day",
);
assert(
  ymdInZone(new Date(santiago.getTime() - 60_000), "America/Santiago") === "2026-09-05",
  "the minute before Santiago day start is the previous day",
);

for (const tz of ["America/Los_Angeles", "Asia/Kathmandu", "Pacific/Chatham", "UTC"]) {
  const s = startOfDayInZone("2026-08-20", tz);
  assert(ymdInZone(s, tz) === "2026-08-20", `${tz} day start is inside the day`);
  assert(
    ymdInZone(new Date(s.getTime() - 60_000), tz) === "2026-08-19",
    `${tz} day start is the first instant of the day`,
  );
}

/* ── "Today" is the guest's date, not the server's ────────────────────── */

// 2026-08-09T06:00Z is still 2026-08-08 in Los Angeles and already
// 2026-08-09 in Auckland. One instant, two calendar dates.
const instant = new Date("2026-08-09T06:00:00Z");
assert(
  todayInZone("America/Los_Angeles", instant) === "2026-08-08",
  "Los Angeles is still on the previous date at 06:00 UTC",
);
assert(
  todayInZone("Pacific/Auckland", instant) === "2026-08-09",
  "Auckland is already on the next date at 06:00 UTC",
);

/* ── Exhaustive sweep: no wall time ever resolves to the wrong instant ── */

{
  const zones = [
    "America/Los_Angeles",
    "America/New_York",
    "America/Santiago",
    "America/St_Johns",
    "Europe/London",
    "Europe/Berlin",
    "Australia/Sydney",
    "Australia/Lord_Howe",
    "Pacific/Auckland",
    "Pacific/Chatham",
    "Asia/Kolkata",
    "Asia/Kathmandu",
    "Africa/Cairo",
    "UTC",
  ];
  let wrong = 0;
  let gaps = 0;
  for (const tz of zones) {
    for (let dayNum = 0; dayNum < 730; dayNum++) {
      const base = new Date(Date.UTC(2026, 0, 1) + dayNum * 86_400_000);
      const y = base.getUTCFullYear();
      const mo = base.getUTCMonth() + 1;
      const d = base.getUTCDate();
      for (let i = 0; i < 48; i++) {
        const h = Math.floor(i / 2);
        const mi = (i % 2) * 30;
        if (rendersAs(tz, y, mo, d, h, mi)) continue;
        // Not a bug if no instant can render it: the clock skipped that time.
        const r = wallTimeToUtc(y, mo, d, h, mi, tz);
        const reachable = [-90, -60, -45, -30, 30, 45, 60, 90].some((off) => {
          const p = getTzParts(new Date(r.getTime() + off * 60_000), tz);
          return (
            p.year === y && p.month === mo && p.day === d && p.hour === h && p.minute === mi
          );
        });
        if (reachable) {
          wrong += 1;
          if (wrong <= 5) {
            console.error(`  FAIL  ${tz} ${y}-${mo}-${d} ${h}:${mi} resolved wrong`);
          }
        } else {
          gaps += 1;
        }
      }
    }
  }
  assert(wrong === 0, `exhaustive sweep found ${wrong} wall times resolved to the wrong instant`);
  console.log(
    `  swept 14 zones x 730 days x 48 half hours, ${gaps} nonexistent wall times correctly unrepresentable`,
  );
}

if (failures > 0) {
  console.error(`\ntimezone.test.ts: ${failures} failure(s)`);
  process.exit(1);
}
console.log("timezone.test.ts: ok");
