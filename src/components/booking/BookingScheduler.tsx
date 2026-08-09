"use client";

import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconVideo,
} from "@/components/icons";
import { TimeZonePicker } from "@/components/booking/TimeZonePicker";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SlotPeriod = "overnight" | "morning" | "afternoon" | "evening";

type Slot = {
  startsAt: string;
  endsAt: string;
  label: string;
  zoneAbbrev: string;
  period: SlotPeriod;
};

type SlotGroup = { period: SlotPeriod; label: string; slots: Slot[] };
type DayMark = { date: string; availableCount: number };
type CompanyInfo = { slug: string; name: string; agentName: string };

const WEEKDAYS = [
  { short: "Sun", full: "Sunday" },
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
];

const HOUR_CYCLE_KEY = "grok_fde_hour_cycle";
const TZ_KEY = "grok_fde_timezone";

/* ── Pure YYYY-MM-DD helpers. No Date locals, so nothing drifts by a zone. ── */

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}
function utcToYmd(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDays(ymd: string, days: number): string {
  return utcToYmd(ymdToUtc(ymd) + days * 86_400_000);
}
function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}
function dayOfWeek(ymd: string): number {
  return new Date(ymdToUtc(ymd)).getUTCDay();
}
function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function monthName(ym: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(ymdToUtc(`${ym}-01`)),
  );
}
function yearOf(ym: string): string {
  return ym.slice(0, 4);
}
function longDate(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(ymdToUtc(ymd)));
}

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
function todayInBrowserZone(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** Slot times are formatted client side, so the 12h/24h toggle is instant. */
function formatTime(iso: string, timeZone: string, hour12: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12,
  }).format(new Date(iso));
}

const EASE = "duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]";
const CTRL = `rounded-[8px] transition-[color,background-color,border-color] ${EASE}`;

export function BookingScheduler({
  company,
  durationMinutes = 30,
  initialDate,
  initialSlotIso,
}: {
  company: CompanyInfo;
  durationMinutes?: number;
  /** Day to open on, from a link that already chose one. */
  initialDate?: string;
  /**
   * Slot to select on arrival. Matched against the times this browser actually
   * loads rather than trusted: the link could name a slot that has since been
   * taken, or one that does not exist in this visitor's time zone at all.
   */
  initialSlotIso?: string;
}) {
  const router = useRouter();

  const [timeZone, setTimeZone] = useState(detectTimeZone);
  const [hour12, setHour12] = useState(true);
  const [today, setToday] = useState(todayInBrowserZone);
  const [maxDaysAhead, setMaxDaysAhead] = useState(60);

  const [cursor, setCursor] = useState(() => monthOf(initialDate ?? todayInBrowserZone()));
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null);
  const [focusedDate, setFocusedDate] = useState(() => initialDate ?? todayInBrowserZone());
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<"pick" | "details">("pick");

  const [days, setDays] = useState<DayMark[]>([]);
  const [groups, setGroups] = useState<SlotGroup[]>([]);
  const [slotCount, setSlotCount] = useState(0);

  const [monthState, setMonthState] = useState<"loading" | "error" | "ready">("loading");
  const [slotState, setSlotState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [monthError, setMonthError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestCompany, setGuestCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  // A link that named a day has already made this choice; landing on "the
  // soonest open day" instead would silently ignore it.
  const autoPicked = useRef(Boolean(initialDate));
  /** The incoming slot is consumed once, so re-picking a day does not fight it. */
  const pendingSlot = useRef(initialSlotIso ?? null);

  // Restore the visitor's own preferences before the first paint of real data.
  useEffect(() => {
    try {
      const savedCycle = localStorage.getItem(HOUR_CYCLE_KEY);
      if (savedCycle === "24") setHour12(false);
      const savedZone = localStorage.getItem(TZ_KEY);
      if (savedZone) setTimeZone(savedZone);
    } catch {
      /* storage unavailable, defaults are fine */
    }
  }, []);

  function chooseHourCycle(next12: boolean) {
    setHour12(next12);
    try {
      localStorage.setItem(HOUR_CYCLE_KEY, next12 ? "12" : "24");
    } catch {
      /* ignore */
    }
  }

  function chooseTimeZone(zone: string) {
    setTimeZone(zone);
    autoPicked.current = false;
    try {
      localStorage.setItem(TZ_KEY, zone);
    } catch {
      /* ignore */
    }
  }

  const lastBookable = useMemo(() => addDays(today, maxDaysAhead), [today, maxDaysAhead]);
  const canPrev = cursor > monthOf(today);
  const canNext = cursor < monthOf(lastBookable);

  const loadMonth = useCallback(async () => {
    setMonthState("loading");
    setMonthError(null);
    try {
      const res = await fetch(
        `/api/bookings/availability?slug=${encodeURIComponent(company.slug)}&month=${cursor}&timeZone=${encodeURIComponent(timeZone)}&durationMinutes=${durationMinutes}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "We could not load the calendar");
      setDays(data.days ?? []);
      if (data.today) setToday(data.today);
      if (typeof data.maxDaysAhead === "number") setMaxDaysAhead(data.maxDaysAhead);
      setMonthState("ready");
    } catch (err) {
      setDays([]);
      setMonthError(err instanceof Error ? err.message : "We could not load the calendar");
      setMonthState("error");
    }
  }, [company.slug, cursor, timeZone, durationMinutes]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  const loadSlots = useCallback(
    async (date: string, signal?: AbortSignal) => {
      setSlotState("loading");
      setSlotError(null);
      try {
        const res = await fetch(
          `/api/bookings/availability?slug=${encodeURIComponent(company.slug)}&date=${date}&timeZone=${encodeURIComponent(timeZone)}&durationMinutes=${durationMinutes}`,
          { signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "We could not load times");
        setGroups(data.groups ?? []);
        setSlotCount((data.slots ?? []).length);
        setSlotState("ready");
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setGroups([]);
        setSlotCount(0);
        setSlotError(err instanceof Error ? err.message : "We could not load times");
        setSlotState("error");
      }
    },
    [company.slug, timeZone, durationMinutes],
  );

  useEffect(() => {
    if (!selectedDate) {
      setGroups([]);
      setSlotCount(0);
      setSlotState("idle");
      return;
    }
    const ctrl = new AbortController();
    void loadSlots(selectedDate, ctrl.signal);
    return () => ctrl.abort();
  }, [selectedDate, loadSlots]);

  // Land on the soonest open day so the times column is never empty.
  useEffect(() => {
    if (autoPicked.current || monthState !== "ready" || days.length === 0) return;
    const first = days.find((d) => d.date >= today && d.availableCount > 0);
    if (!first) return;
    autoPicked.current = true;
    setSelectedDate(first.date);
    setFocusedDate(first.date);
  }, [monthState, days, today]);

  // Changing zone moves day boundaries, so the chosen slot may no longer exist.
  useEffect(() => {
    setSelectedSlot(null);
  }, [timeZone]);

  // Honour a slot named in the link, but only if it is genuinely on offer. It
  // may have been booked between the click and the load, so a miss leaves the
  // day open with the times listed rather than selecting something stale.
  useEffect(() => {
    const wanted = pendingSlot.current;
    if (!wanted || slotState !== "ready") return;
    pendingSlot.current = null;
    const match = groups.flatMap((group) => group.slots).find((slot) => slot.startsAt === wanted);
    if (match) setSelectedSlot(match);
  }, [groups, slotState]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    dayRefs.current.get(target)?.focus();
  }, [focusedDate, cursor]);

  const availability = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of days) m.set(d.date, d.availableCount);
    return m;
  }, [days]);

  const weeks = useMemo(() => {
    const total = daysInMonth(cursor);
    const lead = dayOfWeek(`${cursor}-01`);
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= total; d++) {
      cells.push(`${cursor}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  function goToDate(next: string) {
    if (next < today) next = today;
    if (next > lastBookable) next = lastBookable;
    setFocusedDate(next);
    pendingFocus.current = next;
    if (monthOf(next) !== cursor) setCursor(monthOf(next));
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in step) {
      e.preventDefault();
      goToDate(addDays(focusedDate, step[e.key]!));
    } else if (e.key === "Home") {
      e.preventDefault();
      goToDate(addDays(focusedDate, -dayOfWeek(focusedDate)));
    } else if (e.key === "End") {
      e.preventDefault();
      goToDate(addDays(focusedDate, 6 - dayOfWeek(focusedDate)));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const nextMonth = addMonths(monthOf(focusedDate), e.key === "PageUp" ? -1 : 1);
      const day = Math.min(Number(focusedDate.slice(8)), daysInMonth(nextMonth));
      goToDate(`${nextMonth}-${String(day).padStart(2, "0")}`);
    }
  }

  function selectDay(ymd: string) {
    setSelectedDate(ymd);
    setSelectedSlot(null);
    setFocusedDate(ymd);
    setStep("pick");
  }

  async function confirmBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: company.slug,
          startsAt: selectedSlot.startsAt,
          timeZone,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestCompany: guestCompany.trim() || undefined,
          notes: notes.trim() || undefined,
          durationMinutes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "We could not confirm that time");
      router.push(`/book/${company.slug}/c/${data.booking.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "We could not confirm that time");
      setSubmitting(false);
      if (selectedDate) void loadSlots(selectedDate);
    }
  }

  const selectedWeekday = selectedDate
    ? WEEKDAYS[dayOfWeek(selectedDate)]!.short
    : "";
  const selectedDayNum = selectedDate ? selectedDate.slice(8) : "";

  return (
    <div className="px-3 py-6 sm:px-6 sm:py-10 lg:py-14">
      <div
        className={cn(
          "mx-auto w-full max-w-[68rem] overflow-hidden rounded-[12px]",
          "border border-rule bg-surface elevation-1",
        )}
      >
        <div
          className={cn(
            "grid",
            step === "pick"
              ? "lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,20rem)]"
              : "lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]",
          )}
        >
          {/* ── Event meta ─────────────────────────────────────────── */}
          <aside className="border-b border-rule p-6 lg:border-b-0 lg:border-r lg:p-8">
            <Avatar name={company.agentName} size="md" tone="agent" />
            <p className="mt-4 text-[14px] text-ink-3">
              {company.agentName} at {company.name}
            </p>
            <h1 className="mt-1 text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
              {durationMinutes} min meeting
            </h1>

            <div className="mt-6 space-y-1">
              <div className="flex items-center gap-2 text-[14px] text-ink-2">
                <IconClock size={16} className="shrink-0 text-ink-3" />
                <span className="font-mono tabular">{durationMinutes}m</span>
              </div>
              <div className="flex items-center gap-2 text-[14px] text-ink-2">
                <IconVideo size={16} className="shrink-0 text-ink-3" />
                <span>Video call in your browser</span>
              </div>
              <TimeZonePicker value={timeZone} onChange={chooseTimeZone} />
            </div>

            <p className="mt-6 border-t border-rule pt-5 text-[14px] leading-[1.55] text-ink-2">
              Every half hour is open, including nights and weekends. There is no
              calendar to work around.
            </p>

            {step === "details" && selectedSlot && selectedDate && (
              <div className="mt-6 border-t border-rule pt-5">
                <p className="text-[13px] text-ink-3">Your time</p>
                <p className="mt-1 text-[15px] font-medium text-ink">
                  {longDate(selectedDate)}
                </p>
                <p className="mt-0.5 font-mono tabular text-[14px] text-ink-2">
                  {formatTime(selectedSlot.startsAt, timeZone, hour12)}{" "}
                  {selectedSlot.zoneAbbrev}
                </p>
              </div>
            )}
          </aside>

          {/* ── Calendar ───────────────────────────────────────────── */}
          <section
            className={cn(
              "border-b border-rule px-1.5 py-6 sm:p-6 lg:p-8",
              step === "pick" ? "lg:border-b-0 lg:border-r" : "lg:border-b-0",
              step === "details" && "hidden",
            )}
            aria-labelledby="calendar-heading"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="calendar-heading" className="text-[1.0625rem] tracking-[-0.02em]">
                <span className="font-semibold text-ink">{monthName(cursor)}</span>{" "}
                <span className="font-normal text-ink-3">{yearOf(cursor)}</span>
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  disabled={!canPrev}
                  onClick={() => setCursor(addMonths(cursor, -1))}
                  className={cn(
                    CTRL,
                    "flex h-11 w-11 items-center justify-center",
                    canPrev
                      ? "text-ink-2 hover:bg-hover hover:text-ink active:scale-[0.99]"
                      : "cursor-not-allowed text-ink-4",
                  )}
                >
                  <IconChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  disabled={!canNext}
                  onClick={() => setCursor(addMonths(cursor, 1))}
                  className={cn(
                    CTRL,
                    "flex h-11 w-11 items-center justify-center",
                    canNext
                      ? "text-ink-2 hover:bg-hover hover:text-ink active:scale-[0.99]"
                      : "cursor-not-allowed text-ink-4",
                  )}
                >
                  <IconChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-7 gap-[2px] sm:gap-1">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={`${w.full}-${i}`}
                  className="pb-2 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3"
                >
                  <abbr title={w.full} className="no-underline">
                    {w.short}
                  </abbr>
                </div>
              ))}
            </div>

            {monthState === "loading" && (
              <div className="grid grid-cols-7 gap-[2px] sm:gap-1" aria-busy="true" aria-live="polite">
                <span className="sr-only">Loading the calendar</span>
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="skeleton aspect-square rounded-[8px]" />
                ))}
              </div>
            )}

            {monthState === "error" && (
              <div role="alert" className="py-4">
                <p className="text-[15px] leading-[1.55] text-ink">{monthError}</p>
                <button
                  type="button"
                  onClick={() => void loadMonth()}
                  className={cn(
                    CTRL,
                    "mt-3 h-11 border border-rule-strong px-4 text-[14px] font-medium text-ink hover:bg-hover active:scale-[0.99]",
                  )}
                >
                  Try again
                </button>
              </div>
            )}

            {monthState === "ready" && (
              <div
                role="grid"
                aria-label={`${monthName(cursor)} ${yearOf(cursor)}`}
                onKeyDown={onGridKeyDown}
                className="grid grid-cols-7 gap-[2px] sm:gap-1"
              >
                {/* ARIA wants grid > row > gridcell; `contents` keeps the CSS grid. */}
                {weeks.map((week, w) => (
                  <div key={`w-${w}`} role="row" className="contents">
                    {week.map((ymd, i) => {
                      if (!ymd) {
                        return (
                          <div
                            key={`pad-${w}-${i}`}
                            role="gridcell"
                            aria-hidden
                            className="aspect-square"
                          />
                        );
                      }
                      const count = availability.get(ymd) ?? 0;
                      const open = ymd >= today && ymd <= lastBookable && count > 0;
                      const chosen = selectedDate === ymd;
                      const isToday = ymd === today;
                      return (
                        <div key={ymd} role="gridcell" className="contents">
                          <button
                            ref={(el) => {
                              if (el) dayRefs.current.set(ymd, el);
                              else dayRefs.current.delete(ymd);
                            }}
                            type="button"
                            disabled={!open}
                            tabIndex={focusedDate === ymd ? 0 : -1}
                            aria-current={isToday ? "date" : undefined}
                            aria-pressed={chosen}
                            aria-label={
                              open
                                ? `${longDate(ymd)}, ${count} times open`
                                : `${longDate(ymd)}, no times open`
                            }
                            onFocus={() => setFocusedDate(ymd)}
                            onClick={() => selectDay(ymd)}
                            className={cn(
                              CTRL,
                              "relative flex aspect-square min-h-[44px] w-full items-center justify-center",
                              "font-mono tabular text-[14px]",
                              chosen && "bg-ink font-medium text-paper",
                              !chosen && open && "bg-sunken text-ink hover:bg-active",
                              !chosen && !open && "cursor-not-allowed bg-transparent text-ink-4",
                            )}
                          >
                            {Number(ymd.slice(8))}
                            {isToday && !chosen && (
                              <span
                                aria-hidden
                                className="absolute bottom-[6px] h-[3px] w-[3px] rounded-full bg-ink-3"
                              />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {monthState === "ready" && (
              <p className="mt-4 text-[13px] leading-[1.45] text-ink-3">
                Arrow keys move by day. Page Up and Page Down change month.
              </p>
            )}
          </section>

          {/* ── Times ──────────────────────────────────────────────── */}
          {step === "pick" && (
            <section className="p-6 lg:p-8" aria-labelledby="times-heading">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="times-heading" className="text-[15px] tracking-[-0.01em]">
                    {selectedDate ? (
                      <>
                        <span className="font-semibold text-ink">{selectedWeekday}</span>{" "}
                        <span className="font-mono tabular font-normal text-ink-3">
                          {selectedDayNum}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-ink">Pick a day</span>
                    )}
                  </h2>
                  {slotState === "ready" && slotCount > 0 && (
                    <p className="mt-0.5 text-[13px] text-ink-3">
                      <span className="font-mono tabular">{slotCount}</span> times open
                    </p>
                  )}
                </div>

                <div
                  role="group"
                  aria-label="Time format"
                  className="flex items-center gap-1 rounded-[8px] bg-sunken p-1"
                >
                  {[
                    { on: true, label: "12h" },
                    { on: false, label: "24h" },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      aria-pressed={hour12 === opt.on}
                      onClick={() => chooseHourCycle(opt.on)}
                      className={cn(
                        "flex h-11 min-w-[44px] items-center justify-center rounded-[6px] px-3 text-[12px]",
                        "transition-[background-color,color]",
                        EASE,
                        hour12 === opt.on
                          ? "bg-surface font-medium text-ink elevation-1"
                          : "text-ink-3 hover:text-ink",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 lg:max-h-[27rem] lg:overflow-y-auto lg:pr-2 scrollbar-thin">
                {slotState === "idle" && (
                  <p className="text-[14px] leading-[1.55] text-ink-3">
                    Choose a date and every open half hour appears here.
                  </p>
                )}

                {slotState === "loading" && (
                  <div aria-busy="true" aria-live="polite">
                    <span className="sr-only">Loading available times</span>
                    {[4, 6].map((n, gi) => (
                      <div key={gi} className={gi ? "mt-6" : undefined}>
                        <div className="skeleton h-3 w-20 rounded-[6px]" />
                        <div className="mt-3 space-y-2">
                          {Array.from({ length: n }).map((_, i) => (
                            <div key={i} className="skeleton h-11 w-full rounded-[8px]" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {slotState === "error" && (
                  <div role="alert">
                    <p className="text-[15px] leading-[1.55] text-ink">{slotError}</p>
                    <button
                      type="button"
                      onClick={() => selectedDate && void loadSlots(selectedDate)}
                      className={cn(
                        CTRL,
                        "mt-3 h-11 border border-rule-strong px-4 text-[14px] font-medium text-ink hover:bg-hover active:scale-[0.99]",
                      )}
                    >
                      Try again
                    </button>
                  </div>
                )}

                {slotState === "ready" && slotCount === 0 && (
                  <div>
                    <p className="text-[14px] leading-[1.55] text-ink-2">
                      Every half hour on this day is taken or already past. The days
                      after it are wide open.
                    </p>
                    <button
                      type="button"
                      onClick={() => selectedDate && selectDay(addDays(selectedDate, 1))}
                      className={cn(
                        CTRL,
                        "mt-4 h-11 border border-rule-strong px-4 text-[14px] font-medium text-ink hover:bg-hover active:scale-[0.99]",
                      )}
                    >
                      Try the next day
                    </button>
                  </div>
                )}

                {slotState === "ready" && slotCount > 0 && (
                  <div className="space-y-6">
                    {groups.map((group) => (
                      <div key={group.period}>
                        <h3
                          className={cn(
                            "sticky top-0 z-10 -mx-1 bg-surface px-1 py-1.5",
                            "text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3",
                          )}
                        >
                          {group.label}
                        </h3>
                        <div className="mt-1 space-y-2">
                          {group.slots.map((slot) => {
                            const active = selectedSlot?.startsAt === slot.startsAt;
                            const time = formatTime(slot.startsAt, timeZone, hour12);
                            if (active) {
                              // Cal.com's pattern: the chosen time splits to reveal
                              // the commit action, so nothing is a mis-tap away.
                              return (
                                <div key={slot.startsAt} className="flex gap-2">
                                  <button
                                    type="button"
                                    aria-pressed
                                    onClick={() => setSelectedSlot(null)}
                                    className={cn(
                                      CTRL,
                                      "flex h-11 flex-1 items-center justify-center border border-rule-strong",
                                      "font-mono tabular text-[14px] text-ink-2 hover:bg-hover",
                                    )}
                                  >
                                    {time}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setStep("details")}
                                    className={cn(
                                      CTRL,
                                      "h-11 flex-1 border border-ink bg-ink px-3 text-[14px] font-semibold text-paper",
                                      "hover:bg-ink-lift active:scale-[0.99]",
                                    )}
                                  >
                                    Confirm
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <button
                                key={slot.startsAt}
                                type="button"
                                aria-pressed={false}
                                onClick={() => setSelectedSlot(slot)}
                                className={cn(
                                  CTRL,
                                  "flex h-11 w-full items-center justify-center border border-rule-strong",
                                  "font-mono tabular text-[14px] text-ink",
                                  "hover:border-ink hover:bg-hover active:scale-[0.99]",
                                )}
                              >
                                {time}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Details ────────────────────────────────────────────── */}
          {step === "details" && selectedSlot && selectedDate && (
            <section className="p-6 lg:p-8">
              <button
                type="button"
                onClick={() => setStep("pick")}
                className={cn(
                  CTRL,
                  "-ml-2 inline-flex h-11 items-center gap-1 px-2 text-[14px] font-medium text-ink-3 hover:text-ink",
                )}
              >
                <IconChevronLeft size={14} />
                Change time
              </button>

              <h2 className="mt-2 text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
                Your details
              </h2>

              {formError && (
                <p
                  role="alert"
                  className="mt-4 rounded-[8px] border-l-2 border-critical bg-sunken py-2 pl-3 pr-3 text-[14px] leading-[1.5] text-critical"
                >
                  {formError}
                </p>
              )}

              <form onSubmit={(e) => void confirmBooking(e)} className="mt-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Name"
                    value={guestName}
                    onChange={setGuestName}
                    autoComplete="name"
                    placeholder="Alex Chen"
                    required
                  />
                  <Field
                    label="Work email"
                    type="email"
                    value={guestEmail}
                    onChange={setGuestEmail}
                    autoComplete="email"
                    placeholder="alex@company.com"
                    required
                  />
                  <div className="sm:col-span-2">
                    <Field
                      label="Company"
                      optional
                      value={guestCompany}
                      onChange={setGuestCompany}
                      autoComplete="organization"
                      placeholder="Acme"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block">
                      <span className="mb-2 block text-[14px] font-medium text-ink-2">
                        What should {company.agentName} prepare?{" "}
                        <span className="font-normal text-ink-4">(optional)</span>
                      </span>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                        className={cn(FIELD, "min-h-[104px] resize-y py-3")}
                        placeholder="Your stack, the use case, the security questions you need answered"
                      />
                      <span className="mt-2 block text-[13px] leading-[1.45] text-ink-3">
                        {company.agentName} reads this beforehand and arrives with it
                        already loaded.
                      </span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !guestName.trim() || !guestEmail.trim()}
                  className={cn(
                    CTRL,
                    "mt-7 h-12 w-full border px-6 text-[15px] font-semibold sm:w-auto",
                    submitting || !guestName.trim() || !guestEmail.trim()
                      ? "cursor-not-allowed border-rule bg-sunken text-ink-3"
                      : "border-ink bg-ink text-paper hover:bg-ink-lift active:scale-[0.99]",
                  )}
                >
                  {submitting ? "Confirming" : "Confirm the meeting"}
                </button>
                <p className="mt-3 text-[13px] text-ink-3">
                  You get a join link on the next screen. Nothing to install.
                </p>
              </form>
            </section>
          )}
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-[68rem] text-[14px] text-ink-3">
        Would you rather type than talk?{" "}
        <Link
          href={`/fde/${company.slug}`}
          className="font-medium text-ink underline underline-offset-[3px] hover:text-ink-2"
        >
          Chat with {company.agentName} now
        </Link>
      </p>
    </div>
  );
}

const FIELD = cn(
  "w-full rounded-[8px] border border-rule-strong bg-surface px-3 h-11 text-[16px] text-ink",
  "placeholder:text-ink-4 transition-[border-color] duration-[120ms]",
  "hover:border-ink-4",
);

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[14px] font-medium text-ink-2">
        {label} {optional && <span className="font-normal text-ink-4">(optional)</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={FIELD}
      />
    </label>
  );
}
