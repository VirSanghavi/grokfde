"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * The real calendar, on the marketing page.
 *
 * Every time on this rail comes from the same availability endpoint the booking
 * page uses, in the visitor's own time zone, and every one of them is genuinely
 * open. Clicking one lands on the booking page with that exact slot already
 * chosen, so the path from "this looks interesting" to a confirmed meeting is a
 * single click plus a name and an email.
 *
 * It exists because the engineer taking the meeting does not sleep, which is a
 * claim best made by simply showing a Tuesday at 3am next to a Tuesday at 3pm.
 */

const SLUG = "grok-fde";
const DAYS_SHOWN = 5;

type Slot = {
  startsAt: string;
  label: string;
  zoneAbbrev: string;
  period: string;
};
type Group = { label: string; slots: Slot[] };
type DayMark = { date: string; availableCount: number };

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function todayInBrowserZone(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}

/** Calendar-date arithmetic in UTC, so no local offset can shift a day. */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Today", "Tomorrow", then a weekday and a date. Parsed as UTC on purpose:
 *  the string is a calendar date, not an instant, so a local parse would shift
 *  it a day for anyone west of Greenwich. */
function dayLabel(ymd: string, today: string): string {
  if (ymd === today) return "Today";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const [ty, tm, td] = today.split("-").map(Number);
  const base = new Date(Date.UTC(ty!, tm! - 1, td!));
  if (date.getTime() - base.getTime() === 86_400_000) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function AvailabilityRail() {
  const [timeZone, setTimeZone] = useState("UTC");
  const [today, setToday] = useState("");
  const [days, setDays] = useState<DayMark[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [dayState, setDayState] = useState<"loading" | "error" | "ready">("loading");
  const [slotState, setSlotState] = useState<"loading" | "error" | "ready">("loading");

  // Time zone and "today" are browser facts. Reading them during render would
  // disagree with the server's HTML and hydrate wrong, so they land after mount.
  useEffect(() => {
    setTimeZone(detectTimeZone());
    setToday(todayInBrowserZone());
  }, []);

  const loadDays = useCallback(async () => {
    if (!today) return;
    setDayState("loading");
    try {
      // A window of five days can straddle a month boundary, so ask for both
      // when it does rather than showing a short rail on the 30th.
      const months = [monthOf(today)];
      if (monthOf(addDays(today, DAYS_SHOWN)) !== months[0]) {
        months.push(nextMonth(months[0]!));
      }

      const responses = await Promise.all(
        months.map((month) =>
          fetch(
            `/api/bookings/availability?slug=${SLUG}&month=${month}&timeZone=${encodeURIComponent(timeZone)}`,
          ).then((res) => {
            if (!res.ok) throw new Error(`days ${res.status}`);
            return res.json();
          }),
        ),
      );

      const all: DayMark[] = responses.flatMap((body) => body?.days ?? []);
      const open = all
        .filter((day) => day.date >= today && day.availableCount > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, DAYS_SHOWN);

      setDays(open);
      setSelected((current) => current ?? open[0]?.date ?? null);
      setDayState("ready");
    } catch {
      setDays([]);
      setDayState("error");
    }
  }, [timeZone, today]);

  useEffect(() => {
    void loadDays();
  }, [loadDays]);

  const loadSlots = useCallback(
    async (date: string, signal?: AbortSignal) => {
      setSlotState("loading");
      try {
        const res = await fetch(
          `/api/bookings/availability?slug=${SLUG}&date=${date}&timeZone=${encodeURIComponent(timeZone)}`,
          { signal },
        );
        if (!res.ok) throw new Error(`slots ${res.status}`);
        const body = await res.json();
        setGroups(body?.groups ?? []);
        setSlotState("ready");
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setGroups([]);
        setSlotState("error");
      }
    },
    [timeZone],
  );

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void loadSlots(selected, controller.signal);
    return () => controller.abort();
  }, [selected, loadSlots]);

  const zoneAbbrev = useMemo(
    () => groups.flatMap((group) => group.slots)[0]?.zoneAbbrev ?? "",
    [groups],
  );

  const totalOpen = useMemo(
    () => groups.reduce((sum, group) => sum + group.slots.length, 0),
    [groups],
  );

  return (
    <div>
      {/* Days. Plain text on a hairline row, never a scatter of capsules. */}
      {dayState === "loading" && (
        <div className="flex gap-6 border-b border-rule pb-3" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-5 w-24" />
          ))}
        </div>
      )}

      {dayState === "error" && (
        <div className="border-b border-rule pb-4">
          <p className="text-body text-ink-2">The calendar did not load.</p>
          <button
            type="button"
            onClick={() => void loadDays()}
            className="mt-3 inline-flex h-11 items-center rounded-[var(--radius-control)] border border-rule-strong px-4 text-[15px] font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-hover active:scale-[0.99]"
          >
            Try again
          </button>
        </div>
      )}

      {dayState === "ready" && days.length === 0 && (
        <div className="border-b border-rule pb-4">
          <p className="max-w-[64ch] text-body text-ink-2">
            Nothing open in the next few days, which is unusual. The full calendar
            runs sixty days out.
          </p>
        </div>
      )}

      {dayState === "ready" && days.length > 0 && (
        <>
          <div
            role="tablist"
            aria-label="Day"
            className="flex gap-1 overflow-x-auto border-b border-rule"
          >
            {days.map((day) => {
              const active = day.date === selected;
              return (
                <button
                  key={day.date}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setSelected(day.date)}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-3 py-3 text-body font-medium",
                    "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                    active
                      ? "border-ink text-ink"
                      : "border-transparent text-ink-3 hover:text-ink",
                  )}
                >
                  {dayLabel(day.date, today)}
                  <span className="pl-2 font-mono text-[12px] tabular-nums text-ink-4">
                    {day.availableCount}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            {slotState === "loading" && (
              // `overflow-hidden` is load-bearing: without it the fixed-width
              // placeholders are wider than a phone and push the page sideways
              // for as long as the times take to arrive.
              <div className="h-[17rem] space-y-6 overflow-hidden" aria-hidden>
                {Array.from({ length: 3 }, (_, row) => (
                  <div key={row}>
                    <div className="skeleton h-4 w-20" />
                    <div className="mt-3 flex gap-2 overflow-hidden">
                      {Array.from({ length: 8 }, (_, i) => (
                        <div key={i} className="skeleton h-11 w-24 shrink-0" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {slotState === "error" && (
              <div>
                <p className="text-body text-ink-2">Those times did not load.</p>
                <button
                  type="button"
                  onClick={() => selected && void loadSlots(selected)}
                  className="mt-3 inline-flex h-11 items-center rounded-[var(--radius-control)] border border-rule-strong px-4 text-[15px] font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-hover active:scale-[0.99]"
                >
                  Try again
                </button>
              </div>
            )}

            {slotState === "ready" && totalOpen === 0 && (
              <p className="text-body text-ink-2">
                That day filled up. The next one over is open.
              </p>
            )}

            {slotState === "ready" && totalOpen > 0 && (
              // A day can hold nine open times or forty-eight. The list is a
              // fixed height that scrolls inside itself so switching days never
              // moves the rest of the page, and times wrap rather than run off
              // the right edge half-cut.
              <div className="h-[17rem] space-y-6 overflow-y-auto pr-1">
                {groups
                  .filter((group) => group.slots.length > 0)
                  .map((group) => (
                    <div key={group.label}>
                      <p className="text-[13px] text-ink-3">{group.label}</p>
                      <ul className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                        {group.slots.map((slot) => (
                          <li key={slot.startsAt}>
                            <Link
                              href={`/book/${SLUG}?date=${selected}&at=${encodeURIComponent(slot.startsAt)}`}
                              className={cn(
                                "flex h-11 items-center justify-center rounded-[var(--radius-control)]",
                                "border border-rule bg-surface px-2 font-mono text-[13px] tabular-nums text-ink",
                                "transition-[background-color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                                "hover:border-rule-strong hover:bg-hover active:scale-[0.99]",
                              )}
                            >
                              {slot.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Reserved height, so the line appearing does not nudge the section. */}
          <p className="mt-6 min-h-5 text-[13px] text-ink-3">
            {slotState === "ready" && totalOpen > 0
              ? `${totalOpen} open, shown in ${timeZone.replace(/_/g, " ")}${zoneAbbrev ? ` (${zoneAbbrev})` : ""}. Thirty minutes with the engineer.`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
