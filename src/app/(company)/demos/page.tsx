"use client";

import { api } from "@/lib/api/client";
import { getStoredCompanyId, getStoredCompanySlug } from "@/lib/session";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

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
  status: string;
  joinUrl: string;
  prospectId?: string | null;
  company: { slug: string; name: string; agentName: string };
  join: { canJoin: boolean; phase: string; message: string };
};

export default function DemosPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("grok-fde");
  const [agentName, setAgentName] = useState("Atlas");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let activeSlug = getStoredCompanySlug() || "grok-fde";
        try {
          const company = await api.getCompany();
          if (company?.slug) {
            activeSlug = company.slug;
            if (!cancelled) {
              setSlug(company.slug);
              setAgentName(company.agentName || "Atlas");
            }
          }
        } catch {
          if (!cancelled) setSlug(activeSlug);
        }

        const companyId = getStoredCompanyId();
        const res = await fetch(
          `/api/bookings?slug=${encodeURIComponent(activeSlug)}`,
          {
            headers: companyId ? { "X-Company-Id": companyId } : {},
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Failed to load");
        if (!cancelled) {
          setBookings(data.bookings ?? []);
          const first = data.bookings?.[0]?.company;
          if (first?.slug) setSlug(first.slug);
          if (first?.agentName) setAgentName(first.agentName);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load demos");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const upcoming = bookings.filter(
    (b) => b.status === "confirmed" && new Date(b.endsAt).getTime() >= Date.now() - 60_000,
  );
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-bg-elevated px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-ts uppercase tracking-[0.14em]">Calendar</p>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-fg sm:text-xl">
              Demo bookings
            </h1>
          </div>
          <Link
            href={`/book/${slug}`}
            className="inline-flex h-9 items-center justify-center rounded-full bg-fg px-4 text-[13px] font-semibold text-accent-fg"
            target="_blank"
          >
            Public booking link
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {error && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-dim px-4 py-3 text-[13.5px] text-danger">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-20 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {!loading && upcoming.length === 0 && past.length === 0 && (
          <div className="rounded-2xl border border-border bg-bg-elevated px-6 py-12 text-center">
            <p className="text-[15px] font-medium text-fg">No demos booked yet</p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] text-fg-muted">
              Share your booking link. Prospects pick any open half-hour, 24/7, in their
              timezone. {agentName} shows up on the call.
            </p>
            <Link
              href={`/book/${slug}`}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-fg px-5 text-[13.5px] font-semibold text-accent-fg"
            >
              Open booking page
            </Link>
          </div>
        )}

        {upcoming.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Upcoming
            </h2>
            <ul className="space-y-2">
              {upcoming.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Recent
            </h2>
            <ul className="space-y-2">
              {past.map((b) => (
                <BookingCard key={b.id} booking={b} dimmed />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function BookingCard({ booking: b, dimmed }: { booking: BookingRow; dimmed?: boolean }) {
  const when = new Intl.DateTimeFormat(undefined, {
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
        "rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm",
        dimmed && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-fg">
            {b.guestName}
            {b.guestCompany ? (
              <span className="font-normal text-fg-muted"> · {b.guestCompany}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[13px] text-fg-muted">{b.guestEmail}</p>
          <p className="mt-2 text-[13.5px] font-medium text-fg-secondary">{when}</p>
          {b.notes && (
            <p className="mt-1.5 text-[13px] leading-snug text-fg-muted">{b.notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              b.join.canJoin
                ? "bg-success-dim text-success"
                : "bg-bg-muted text-fg-muted",
            )}
          >
            {b.join.canJoin ? "Join open" : b.join.phase}
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            {b.prospectId && (
              <Link
                href={`/fde/${b.company.slug}/p/${b.prospectId}`}
                className="text-[12.5px] font-medium text-fg-muted hover:text-fg"
              >
                Prospect
              </Link>
            )}
            <a
              href={b.joinUrl}
              className="text-[12.5px] font-medium text-fg-muted hover:text-fg"
              target="_blank"
              rel="noreferrer"
            >
              Join link
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}
