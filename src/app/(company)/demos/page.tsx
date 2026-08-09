"use client";

import { api } from "@/lib/api/client";
import { getStoredCompanyId, getStoredCompanySlug } from "@/lib/session";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type BookingRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  timezone: string;
  guestName: string;
  guestEmail: string;
  guestCompany?: string | null;
  notes?: string | null;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  joinUrl: string;
  icsUrl: string;
  prospectId?: string | null;
  company: { slug: string; name: string; agentName: string };
  join: { canJoin: boolean; phase: string; message: string };
};

const CONTROL =
  "rounded-[8px] transition-[color,background-color,border-color] duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]";

/** Status is a word plus a dot. Never a capsule, never uppercase. */
const STATUS: Record<BookingRow["status"], { label: string; dot: string }> = {
  confirmed: { label: "Confirmed", dot: "bg-positive" },
  completed: { label: "Completed", dot: "bg-ink-4" },
  cancelled: { label: "Cancelled", dot: "bg-critical" },
  no_show: { label: "No show", dot: "bg-caution" },
};

export default function DemosPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("grok-fde");
  const [agentName, setAgentName] = useState("Atlas");

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      let activeSlug = getStoredCompanySlug() || "grok-fde";
      try {
        const company = await api.getCompany();
        if (company?.slug) {
          activeSlug = company.slug;
          setSlug(company.slug);
          setAgentName(company.agentName || "Atlas");
        }
      } catch {
        setSlug(activeSlug);
      }

      const companyId = getStoredCompanyId();
      const res = await fetch(`/api/bookings?slug=${encodeURIComponent(activeSlug)}`, {
        headers: companyId ? { "X-Company-Id": companyId } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Could not load your meetings");

      const rows: BookingRow[] = data.bookings ?? [];
      setBookings(rows);
      const first = rows[0]?.company;
      if (first?.slug) setSlug(first.slug);
      if (first?.agentName) setAgentName(first.agentName);
      setState("ready");
    } catch (err) {
      setBookings([]);
      setError(err instanceof Error ? err.message : "Could not load your meetings");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const upcoming = bookings.filter(
    (b) => b.status === "confirmed" && new Date(b.endsAt).getTime() >= now - 60_000,
  );
  const past = bookings
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-rule bg-surface px-5 py-4 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-ink-3">Calendar</p>
            <h1 className="mt-1 text-[1.375rem] font-semibold tracking-[-0.025em] text-ink">
              Scheduled meetings
            </h1>
          </div>
          <Link
            href={`/book/${slug}`}
            target="_blank"
            className={cn(
              CONTROL,
              "inline-flex h-11 items-center border border-rule-strong px-4 text-[14px] font-medium text-ink hover:bg-hover active:scale-[0.99]",
            )}
          >
            Open the public booking page
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-8">
        {state === "loading" && (
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading scheduled meetings</span>
            <div className="skeleton h-4 w-24" />
            <div className="mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border-t border-rule py-5">
                  <div className="skeleton h-5 w-52" />
                  <div className="skeleton mt-2 h-4 w-72" />
                </div>
              ))}
            </div>
          </div>
        )}

        {state === "error" && (
          <div role="alert" className="max-w-[62ch]">
            <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
              We could not load your meetings
            </h2>
            <p className="mt-2 text-[15px] leading-[1.6] text-ink-2">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className={cn(
                CONTROL,
                "mt-5 h-11 border border-ink bg-ink px-5 text-[14px] font-semibold text-paper hover:bg-ink-lift active:scale-[0.99]",
              )}
            >
              Try again
            </button>
          </div>
        )}

        {state === "ready" && bookings.length === 0 && (
          <div className="max-w-[62ch] py-6">
            <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
              No meetings booked yet
            </h2>
            <p className="mt-2 text-[15px] leading-[1.6] text-ink-2">
              Share your booking link. Prospects pick any open half hour in their own
              timezone, including nights and weekends, and {agentName} shows up on the
              call with their notes already loaded.
            </p>
            <Link
              href={`/book/${slug}`}
              target="_blank"
              className={cn(
                CONTROL,
                "mt-5 inline-flex h-11 items-center border border-ink bg-ink px-5 text-[14px] font-semibold text-paper hover:bg-ink-lift active:scale-[0.99]",
              )}
            >
              Open the booking page
            </Link>
          </div>
        )}

        {state === "ready" && bookings.length > 0 && (
          <div className="space-y-10">
            <Section
              title="Upcoming"
              count={upcoming.length}
              empty={`Nothing on the calendar yet. ${agentName} is free at every half hour.`}
              rows={upcoming}
            />
            <Section
              title="Past"
              count={past.length}
              empty="No meetings have happened yet."
              rows={past}
              dimmed
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  rows,
  dimmed,
}: {
  title: string;
  count: number;
  empty: string;
  rows: BookingRow[];
  dimmed?: boolean;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
        <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <span className="font-mono tabular text-[13px] text-ink-3">{count}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-5 text-[15px] leading-[1.6] text-ink-3">{empty}</p>
      ) : (
        <ul>
          {rows.map((b) => (
            <BookingRowItem key={b.id} booking={b} dimmed={dimmed} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BookingRowItem({
  booking: b,
  dimmed,
}: {
  booking: BookingRow;
  dimmed?: boolean;
}) {
  const status = STATUS[b.status] ?? STATUS.confirmed;
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: b.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(b.startsAt));

  return (
    <li
      className={cn(
        "border-b border-rule py-5",
        "grid gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_auto]",
        dimmed && "text-ink-2",
      )}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {b.guestName}
          {b.guestCompany ? (
            <span className="font-normal text-ink-3">, {b.guestCompany}</span>
          ) : null}
        </p>
        <p className="mt-1 truncate text-[14px] text-ink-3">{b.guestEmail}</p>
        {b.notes && (
          <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.5] text-ink-2">
            {b.notes}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <p className="font-mono tabular text-[14px] text-ink">{when}</p>
        <p className="mt-1 text-[13px] text-ink-3">
          <span className="font-mono tabular">{b.durationMinutes} min</span>
          {", "}
          <span className="font-mono">{b.timezone}</span>
        </p>
        <p className="mt-2 flex items-center gap-2 text-[14px] text-ink-2">
          <span aria-hidden className={cn("h-2 w-2 rounded-full", status.dot)} />
          {status.label}
          {b.join.canJoin && b.status === "confirmed" && (
            <span className="text-ink-3">, join is open</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-x-5 gap-y-2 lg:justify-end">
        {b.prospectId && (
          <Link
            href={`/fde/${b.company.slug}/p/${b.prospectId}`}
            className="text-[14px] font-medium text-ink underline underline-offset-[3px] hover:text-ink-2"
          >
            Prospect
          </Link>
        )}
        <a
          href={b.joinUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[14px] font-medium text-ink underline underline-offset-[3px] hover:text-ink-2"
        >
          Join link
        </a>
        <a
          href={b.icsUrl}
          className="text-[14px] font-medium text-ink underline underline-offset-[3px] hover:text-ink-2"
        >
          Calendar file
        </a>
      </div>
    </li>
  );
}
