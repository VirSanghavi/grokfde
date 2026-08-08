/**
 * Lightweight timezone helpers (no date-fns-tz).
 * All storage is UTC; display uses IANA zones from the browser.
 */

export type TzParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export function getTzParts(date: Date, timeZone: string): TzParts {
  const parts = formatter(timeZone).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second ?? 0),
    weekday: map.weekday ?? "",
  };
}

/** Wall-clock time in `timeZone` → UTC Date */
export function wallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = getTzParts(utcGuess, timeZone);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  const actual = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return new Date(utcGuess.getTime() + (desired - actual));
}

export function formatInZone(
  date: Date,
  timeZone: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...opts,
  }).format(date);
}

export function formatTimeInZone(date: Date, timeZone: string): string {
  return formatInZone(date, timeZone, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateLongInZone(date: Date, timeZone: string): string {
  return formatInZone(date, timeZone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ymdInZone(date: Date, timeZone: string): string {
  const p = getTzParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar days in a month in a timezone (for month grid labels we use local wall month). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
