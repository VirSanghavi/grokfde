"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Booking = {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  timezone: string;
  guestName: string;
  guestEmail: string;
  joinUrl: string;
  company: { slug: string; name: string; agentName: string };
  join: { canJoin: boolean; phase: string; message: string; opensAt: string };
};

export default function BookingConfirmPage() {
  const params = useParams<{ companySlug: string; bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${params.bookingId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Not found");
        setBooking(data.booking);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load booking");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.bookingId]);

  // Refresh join window every 30s
  useEffect(() => {
    if (!booking) return;
    const t = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/bookings/${params.bookingId}`);
        const data = await res.json();
        if (res.ok) setBooking(data.booking);
      } catch {
        /* ignore */
      }
    }, 30_000);
    return () => window.clearInterval(t);
  }, [booking?.id, params.bookingId]);

  const when = booking
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: booking.timezone,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(booking.startsAt))
    : "";

  return (
    <div className="min-h-dvh bg-bg text-fg antialiased">
      <header className="mx-auto flex w-full max-w-[520px] items-center justify-between px-5 pt-6 sm:pt-8">
        <Link
          href="/"
          className="text-[16px] font-semibold tracking-[-0.02em] text-fg transition-opacity hover:opacity-70"
        >
          Grok FDE
        </Link>
      </header>

      <main className="mx-auto max-w-[520px] px-5 py-12 sm:py-16">
        {loading && (
          <div className="space-y-3">
            <div className="skeleton h-8 w-48 rounded-lg" />
            <div className="skeleton h-24 w-full rounded-2xl" />
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-danger/20 bg-danger-dim p-5 text-[14px] text-danger">
            {error}
          </div>
        )}
        {booking && (
          <>
            <p className="text-[12px] font-medium text-fg-muted">Confirmed</p>
            <h1 className="mt-2 text-[clamp(1.5rem,4vw,1.85rem)] font-semibold tracking-[-0.03em] text-fg">
              You are on {booking.company.agentName}&apos;s calendar
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
              {booking.company.agentName} will meet you on a live video call with
              full company knowledge and tools.
            </p>

            <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <p className="text-[11.5px] font-medium text-fg-muted">When</p>
                <p className="mt-1 text-[15px] font-medium tracking-[-0.01em] text-fg">
                  {when}
                </p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  {booking.durationMinutes} min · {booking.timezone}
                </p>
              </div>
              <div className="border-b border-border px-5 py-4">
                <p className="text-[11.5px] font-medium text-fg-muted">Guest</p>
                <p className="mt-1 text-[15px] font-medium text-fg">{booking.guestName}</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">{booking.guestEmail}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11.5px] font-medium text-fg-muted">Host</p>
                <p className="mt-1 text-[15px] font-medium text-fg">
                  {booking.company.agentName}
                </p>
                <p className="mt-0.5 text-[13px] text-fg-muted">{booking.company.name}</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {booking.join.canJoin ? (
                <Link
                  href={booking.joinUrl}
                  className="flex h-12 w-full items-center justify-center rounded-full bg-fg text-[14.5px] font-semibold text-accent-fg transition-transform active:scale-[0.985]"
                >
                  Join demo now
                </Link>
              ) : (
                <div
                  className={cn(
                    "rounded-2xl border border-border bg-bg-muted px-4 py-3.5 text-[13.5px] leading-snug text-fg-secondary",
                  )}
                >
                  {booking.join.message}
                </div>
              )}
              <a
                href={googleCalendarUrl(booking)}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 w-full items-center justify-center rounded-full border border-border bg-bg-elevated text-[14px] font-medium text-fg-secondary transition-colors hover:bg-bg-hover"
              >
                Add to Google Calendar
              </a>
              <Link
                href={`/fde/${booking.company.slug}`}
                className="flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium text-fg-muted hover:text-fg"
              >
                Chat with {booking.company.agentName} before the demo
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function googleCalendarUrl(b: Booking): string {
  const start = new Date(b.startsAt);
  const end = new Date(b.endsAt);
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Demo with ${b.company.agentName} · ${b.company.name}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Join: ${b.joinUrl}\n\nYour FDE will meet you on a live video call.`,
    location: b.joinUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
