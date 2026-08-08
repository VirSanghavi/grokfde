"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Slot = { startsAt: string; endsAt: string; label: string };
type DayMark = { date: string; availableCount: number };

type CompanyInfo = {
  slug: string;
  name: string;
  agentName: string;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function formatSelectedDate(ymd: string): string {
  return parseYmd(ymd).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function BookingScheduler({
  company,
  durationMinutes = 30,
}: {
  company: CompanyInfo;
  durationMinutes?: number;
}) {
  const router = useRouter();
  const [timeZone] = useState(detectTimeZone);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<"pick" | "details">("pick");
  const [days, setDays] = useState<DayMark[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestCompany, setGuestCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const monthStr = monthKey(cursor);

  const loadMonth = useCallback(async () => {
    setLoadingMonth(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/bookings/availability?slug=${encodeURIComponent(company.slug)}&month=${monthStr}&timeZone=${encodeURIComponent(timeZone)}&durationMinutes=${durationMinutes}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Could not load calendar");
      setDays(data.days ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load calendar");
      setDays([]);
    } finally {
      setLoadingMonth(false);
    }
  }, [company.slug, monthStr, timeZone, durationMinutes]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/bookings/availability?slug=${encodeURIComponent(company.slug)}&date=${selectedDate}&timeZone=${encodeURIComponent(timeZone)}&durationMinutes=${durationMinutes}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Could not load times");
        if (!cancelled) {
          setSlots(data.slots ?? []);
          setSelectedSlot(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load times");
          setSlots([]);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, company.slug, timeZone, durationMinutes]);

  const availableSet = useMemo(
    () => new Set(days.map((d) => d.date)),
    [days],
  );

  const calendarCells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ ymd: string | null; day: number | null }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ ymd: null, day: null });
    for (let d = 1; d <= dim; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ ymd, day: d });
    }
    while (cells.length % 7 !== 0) cells.push({ ymd: null, day: null });
    return cells;
  }, [cursor]);

  const todayYmd = ymdLocal(new Date());

  async function confirmBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || submitting) return;
    setSubmitting(true);
    setError(null);
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
      if (!res.ok) throw new Error(data?.error?.message || "Booking failed");
      const id = data.booking?.id as string;
      router.push(`/book/${company.slug}/c/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
      setSubmitting(false);
    }
  }

  const monthLabel = cursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-[920px]">
      <div className="overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_40px_rgba(15,23,42,0.06)]">
        <div className="grid lg:grid-cols-[minmax(0,280px)_1fr]">
          {/* Event meta */}
          <aside className="border-b border-border bg-bg-muted/60 p-6 lg:border-b-0 lg:border-r">
            <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-muted">
              {company.name}
            </p>
            <h1 className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-[-0.03em] text-fg">
              Demo with {company.agentName}
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
              Live video with a forward-deployed engineer. Full company context,
              tools, and your notes — 24/7.
            </p>
            <ul className="mt-6 space-y-2.5 text-[13.5px] text-fg-secondary">
              <li className="flex gap-2">
                <span className="mt-0.5 text-fg-faint" aria-hidden>
                  ·
                </span>
                <span>{durationMinutes} minutes</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-fg-faint" aria-hidden>
                  ·
                </span>
                <span>Video call in browser</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-fg-faint" aria-hidden>
                  ·
                </span>
                <span className="min-w-0 break-words">{timeZone}</span>
              </li>
            </ul>
            {selectedSlot && (
              <div className="mt-8 rounded-xl border border-border bg-bg-elevated p-3.5">
                <p className="text-[11px] font-medium text-fg-muted">Selected</p>
                <p className="mt-1 text-[14px] font-medium tracking-[-0.01em] text-fg">
                  {selectedDate ? formatSelectedDate(selectedDate) : ""}
                </p>
                <p className="mt-0.5 text-[14px] text-fg-secondary">
                  {selectedSlot.label}
                  <span className="text-fg-faint"> · {durationMinutes} min</span>
                </p>
              </div>
            )}
          </aside>

          {/* Picker / form */}
          <div className="p-5 sm:p-6">
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-danger/20 bg-danger-dim px-3.5 py-2.5 text-[13.5px] text-danger"
              >
                {error}
              </div>
            )}

            {step === "pick" && (
              <div className="grid gap-6 sm:grid-cols-[1fr_minmax(140px,180px)]">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-fg">
                      {monthLabel}
                    </h2>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Previous month"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-fg-secondary transition-colors hover:bg-bg-hover"
                        onClick={() =>
                          setCursor(
                            new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
                          )
                        }
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        aria-label="Next month"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-fg-secondary transition-colors hover:bg-bg-hover"
                        onClick={() =>
                          setCursor(
                            new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
                          )
                        }
                      >
                        ›
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEKDAYS.map((w) => (
                      <div
                        key={w}
                        className="py-1 text-[11px] font-medium text-fg-faint"
                      >
                        {w}
                      </div>
                    ))}
                    {calendarCells.map((cell, i) => {
                      if (!cell.ymd || cell.day == null) {
                        return <div key={`e-${i}`} className="aspect-square" />;
                      }
                      const isPast = cell.ymd < todayYmd;
                      const hasSlots = availableSet.has(cell.ymd);
                      const selectable = !isPast && (hasSlots || loadingMonth);
                      const selected = selectedDate === cell.ymd;
                      return (
                        <button
                          key={cell.ymd}
                          type="button"
                          disabled={!selectable || loadingMonth}
                          onClick={() => {
                            setSelectedDate(cell.ymd);
                            setSelectedSlot(null);
                          }}
                          className={cn(
                            "relative flex aspect-square items-center justify-center rounded-full text-[13.5px] font-medium transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20",
                            selected && "bg-fg text-accent-fg",
                            !selected &&
                              selectable &&
                              "text-fg hover:bg-bg-hover",
                            !selected &&
                              !selectable &&
                              "cursor-not-allowed text-fg-faint/50",
                          )}
                        >
                          {cell.day}
                          {hasSlots && !selected && (
                            <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-fg/40" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {loadingMonth && (
                    <p className="mt-3 text-[12.5px] text-fg-faint">Loading availability…</p>
                  )}
                </div>

                <div className="min-h-[240px]">
                  <p className="mb-2 text-[12px] font-medium text-fg-muted">
                    {selectedDate
                      ? formatSelectedDate(selectedDate)
                      : "Pick a day"}
                  </p>
                  {!selectedDate && (
                    <p className="text-[13.5px] leading-snug text-fg-faint">
                      Available days show a dot. Times display in your timezone.
                    </p>
                  )}
                  {selectedDate && loadingSlots && (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="skeleton h-10 w-full rounded-xl" />
                      ))}
                    </div>
                  )}
                  {selectedDate && !loadingSlots && slots.length === 0 && (
                    <p className="text-[13.5px] text-fg-muted">
                      No open times this day. Try another date.
                    </p>
                  )}
                  {selectedDate && !loadingSlots && slots.length > 0 && (
                    <div className="max-h-[min(420px,50vh)] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                      {slots.map((slot) => {
                        const active = selectedSlot?.startsAt === slot.startsAt;
                        return (
                          <button
                            key={slot.startsAt}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={cn(
                              "flex h-10 w-full items-center justify-center rounded-xl border text-[13.5px] font-medium tabular-nums transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20",
                              active
                                ? "border-fg bg-fg text-accent-fg"
                                : "border-border bg-bg-elevated text-fg hover:border-border-strong hover:bg-bg-hover",
                            )}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedSlot && (
                    <button
                      type="button"
                      className="mt-3 flex h-11 w-full items-center justify-center rounded-full bg-fg text-[14px] font-semibold text-accent-fg transition-transform active:scale-[0.985]"
                      onClick={() => setStep("details")}
                    >
                      Continue
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === "details" && selectedSlot && selectedDate && (
              <form onSubmit={(e) => void confirmBooking(e)} className="mx-auto max-w-md space-y-4">
                <button
                  type="button"
                  className="text-[13px] font-medium text-fg-muted hover:text-fg"
                  onClick={() => setStep("pick")}
                >
                  ← Change time
                </button>
                <div>
                  <h2 className="text-[1.15rem] font-semibold tracking-[-0.02em] text-fg">
                    Your details
                  </h2>
                  <p className="mt-1 text-[13.5px] text-fg-muted">
                    {formatSelectedDate(selectedDate)} at {selectedSlot.label} (
                    {timeZone})
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-fg-secondary">
                    Name
                  </span>
                  <input
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    autoComplete="name"
                    autoFocus
                    className={inputClass}
                    placeholder="Alex Chen"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-fg-secondary">
                    Work email
                  </span>
                  <input
                    required
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    autoComplete="email"
                    className={inputClass}
                    placeholder="alex@company.com"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-fg-secondary">
                    Company <span className="text-fg-faint">(optional)</span>
                  </span>
                  <input
                    value={guestCompany}
                    onChange={(e) => setGuestCompany(e.target.value)}
                    autoComplete="organization"
                    className={inputClass}
                    placeholder="Acme"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-fg-secondary">
                    What should {company.agentName} prepare?{" "}
                    <span className="text-fg-faint">(optional)</span>
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className={cn(inputClass, "min-h-[88px] resize-y py-2.5")}
                    placeholder="Stack, use case, security questions…"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting || !guestName.trim() || !guestEmail.trim()}
                  className="flex h-11 w-full items-center justify-center rounded-full bg-fg text-[14.5px] font-semibold text-accent-fg transition-transform active:scale-[0.985] disabled:opacity-40"
                >
                  {submitting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  ) : (
                    "Confirm demo"
                  )}
                </button>
                <p className="text-center text-[12.5px] text-fg-faint">
                  You will get a join link. {company.agentName} shows up with full context.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[12.5px] text-fg-faint">
        Prefer chat first?{" "}
        <Link href={`/fde/${company.slug}`} className="font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline">
          Talk to {company.agentName} now
        </Link>
      </p>
    </div>
  );
}

const inputClass = cn(
  "w-full rounded-xl border border-border bg-bg-elevated px-3.5 h-11 text-[15px] text-fg shadow-sm",
  "placeholder:text-fg-faint",
  "transition-[border-color,box-shadow] duration-150",
  "hover:border-border-strong",
  "focus:border-fg/25 focus:outline-none focus:ring-2 focus:ring-fg/10",
);
