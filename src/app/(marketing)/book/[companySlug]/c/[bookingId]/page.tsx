"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Booking = {
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
  icsUrl: string;
  emailConfigured: boolean;
  company: { slug: string; name: string; agentName: string };
  join: { canJoin: boolean; phase: string; message: string; opensAt: string };
};

const CONTROL =
  "rounded-[8px] transition-[color,background-color,border-color] duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]";

function formatIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function BookingConfirmPage() {
  const params = useParams<{ companySlug: string; bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewerZone, setViewerZone] = useState<string | null>(null);

  useEffect(() => setViewerZone(browserZone()), []);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState("loading");
      try {
        const res = await fetch(`/api/bookings/${params.bookingId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "We could not find that booking");
        setBooking(data.booking);
        setState("ready");
      } catch (err) {
        if (quiet) return;
        setError(err instanceof Error ? err.message : "We could not load your booking");
        setState("error");
      }
    },
    [params.bookingId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the join window fresh so the button unlocks on its own.
  useEffect(() => {
    if (state !== "ready") return;
    const t = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(t);
  }, [state, load]);

  async function copyJoinLink() {
    if (!booking) return;
    try {
      await navigator.clipboard.writeText(booking.joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const zoneDiffers =
    booking && viewerZone && viewerZone !== booking.timezone;

  return (
    <div className="min-h-dvh bg-paper text-ink antialiased">
      <header className="flex w-full items-center border-b border-rule px-5 py-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="text-[16px] font-semibold tracking-[-0.02em] text-ink transition-opacity duration-[120ms] hover:opacity-70"
        >
          Grok FDE
        </Link>
      </header>

      {/* A confirmation is a single-focus moment, so a centered measure is right. */}
      <main className="mx-auto w-full max-w-[42rem] px-5 py-12 sm:px-8 sm:py-16">
        {state === "loading" && (
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading your booking</span>
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-4 h-10 w-full" />
            <div className="skeleton mt-2 h-10 w-3/4" />
            <div className="mt-10 space-y-px">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border-b border-rule py-5">
                  <div className="skeleton h-3 w-16" />
                  <div className="skeleton mt-2 h-5 w-56" />
                </div>
              ))}
            </div>
            <div className="skeleton mt-8 h-12 w-full" />
          </div>
        )}

        {state === "error" && (
          <div role="alert">
            <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-semibold tracking-[-0.03em] text-ink">
              We could not open that booking
            </h1>
            <p className="mt-3 text-[16px] leading-[1.6] text-ink-2">{error}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void load()}
                className={cn(
                  CONTROL,
                  "h-12 border border-ink bg-ink px-5 text-[15px] font-semibold text-paper hover:bg-ink-lift active:scale-[0.99]",
                )}
              >
                Try again
              </button>
              <Link
                href={`/book/${params.companySlug}`}
                className={cn(
                  CONTROL,
                  "flex h-12 items-center border border-rule-strong px-5 text-[15px] font-medium text-ink hover:bg-hover",
                )}
              >
                Book a new time
              </Link>
            </div>
          </div>
        )}

        {state === "ready" && booking && (
          <>
            <p className="flex items-center gap-2 text-[14px] text-ink-2">
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 rounded-full",
                  booking.status === "cancelled" ? "bg-critical" : "bg-positive",
                )}
              />
              {booking.status === "cancelled" ? "Cancelled" : "Confirmed"}
            </p>
            <h1 className="mt-3 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
              You are on {booking.company.agentName}&apos;s calendar
            </h1>
            <p className="mt-3 text-[16px] leading-[1.6] text-ink-2">
              {booking.company.agentName} joins on live video with your notes and full
              company context already loaded.
            </p>

            <dl className="mt-10">
              <Row label="When">
                <span className="font-mono tabular text-ink">
                  {formatIn(booking.startsAt, booking.timezone)}
                </span>
                <span className="mt-1 block text-[14px] text-ink-3">
                  <span className="font-mono tabular">{booking.durationMinutes} min</span>
                  {", "}
                  <span className="font-mono">{booking.timezone}</span>
                </span>
                {zoneDiffers && (
                  <span className="mt-2 block text-[14px] text-ink-2">
                    Where you are now (<span className="font-mono">{viewerZone}</span>) that
                    is{" "}
                    <span className="font-mono tabular text-ink">
                      {formatIn(booking.startsAt, viewerZone!)}
                    </span>
                    .
                  </span>
                )}
              </Row>
              <Row label="Guest">
                <span className="text-ink">{booking.guestName}</span>
                <span className="mt-1 block text-[14px] text-ink-3">
                  {booking.guestEmail}
                  {booking.guestCompany ? `, ${booking.guestCompany}` : ""}
                </span>
              </Row>
              <Row label="Host">
                <span className="text-ink">{booking.company.agentName}</span>
                <span className="mt-1 block text-[14px] text-ink-3">
                  {booking.company.name}
                </span>
              </Row>
              {booking.notes && (
                <Row label="You asked us to prepare">
                  <span className="text-ink-2">{booking.notes}</span>
                </Row>
              )}
            </dl>

            {/* The join link is the handoff. Say so, and never imply an email
                that was not actually sent. */}
            <div className="mt-10">
              <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
                Your join link
              </h2>
              <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.6] text-ink-2">
                {booking.emailConfigured
                  ? `We also emailed this link to ${booking.guestEmail}. Save it either way, it is the only thing you need.`
                  : "Save this link now. Email delivery is not switched on for this deployment, so nothing was sent to your inbox. This page and this link are how you get into the call."}
              </p>

              {/* Wraps rather than scrolls: a link you can read in full beats a
                  link you have to drag sideways. */}
              <p className="mt-4 border-l-2 border-rule-strong py-1 pl-3 font-mono text-[13px] leading-[1.6] break-all text-ink-2">
                {booking.joinUrl}
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {booking.join.canJoin ? (
                  <Link
                    href={booking.joinUrl}
                    className={cn(
                      CONTROL,
                      "flex h-12 items-center justify-center border border-live bg-live px-6 text-[15px] font-semibold text-white hover:opacity-90 active:scale-[0.99]",
                    )}
                  >
                    Join the call now
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void copyJoinLink()}
                    className={cn(
                      CONTROL,
                      "h-12 border border-ink bg-ink px-6 text-[15px] font-semibold text-paper hover:bg-ink-lift active:scale-[0.99]",
                    )}
                  >
                    {copied ? "Link copied" : "Copy join link"}
                  </button>
                )}

                <a
                  href={booking.icsUrl}
                  className={cn(
                    CONTROL,
                    "flex h-12 items-center justify-center border border-rule-strong px-6 text-[15px] font-medium text-ink hover:bg-hover active:scale-[0.99]",
                  )}
                >
                  Add to calendar
                </a>
              </div>

              {!booking.join.canJoin && (
                <p className="mt-4 text-[14px] text-ink-3">{booking.join.message}</p>
              )}
            </div>

            <p className="mt-10 border-t border-rule pt-6 text-[15px] text-ink-3">
              Questions before then?{" "}
              <Link
                href={`/fde/${booking.company.slug}`}
                className="font-medium text-ink underline underline-offset-[3px] hover:text-ink-2"
              >
                Chat with {booking.company.agentName}
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-rule py-5 sm:grid sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-6">
      <dt className="text-[14px] text-ink-3">{label}</dt>
      <dd className="mt-1 text-[16px] leading-[1.5] sm:mt-0">{children}</dd>
    </div>
  );
}
