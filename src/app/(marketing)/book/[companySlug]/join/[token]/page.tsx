"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type JoinPayload = {
  booking: {
    id: string;
    startsAt: string;
    timezone: string;
    guestName: string;
    durationMinutes: number;
    notes?: string | null;
    status: string;
    company: { slug: string; name: string; agentName: string };
  };
  join: { canJoin: boolean; phase: string; message: string; opensAt: string };
  fdePath: string;
};

const CONTROL =
  "rounded-[8px] transition-[color,background-color,border-color] duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]";

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function JoinDemoPage() {
  const params = useParams<{ companySlug: string; token: string }>();
  const router = useRouter();
  const [data, setData] = useState<JoinPayload | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [zone, setZone] = useState<string | null>(null);

  useEffect(() => setZone(browserZone()), []);

  const load = useCallback(
    async (quiet = false) => {
      try {
        const res = await fetch(`/api/bookings/join/${params.token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "This link is not valid");
        setData(json);
        setState("ready");
      } catch (err) {
        if (quiet) return;
        setError(err instanceof Error ? err.message : "We could not open this meeting");
        setState("error");
      }
    },
    [params.token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The page unlocks itself when the window opens.
  useEffect(() => {
    if (state !== "ready") return;
    const t = window.setInterval(() => void load(true), 20_000);
    return () => window.clearInterval(t);
  }, [state, load]);

  async function join() {
    if (!data?.join.canJoin || joining) return;
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/join/${params.token}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "We could not start the call");
      router.push(json.fdePath || data.fdePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not start the call");
      setJoining(false);
    }
  }

  const when =
    data && zone
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: data.booking.timezone,
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(data.booking.startsAt))
      : "";

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink antialiased">
      <header className="flex w-full items-center border-b border-rule px-5 py-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="text-[16px] font-semibold tracking-[-0.02em] text-ink transition-opacity duration-[120ms] hover:opacity-70"
        >
          Grok FDE
        </Link>
      </header>

      {/* Getting into a call is a single-focus moment. */}
      <main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col justify-center px-5 py-12 sm:px-8">
        {state === "loading" && (
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">Opening your meeting</span>
            <div className="skeleton h-4 w-20" />
            <div className="skeleton mt-4 h-10 w-2/3" />
            <div className="skeleton mt-3 h-5 w-full" />
            <div className="skeleton mt-8 h-12 w-full" />
          </div>
        )}

        {state === "error" && (
          <div role="alert">
            <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-semibold tracking-[-0.03em] text-ink">
              This link did not open
            </h1>
            <p className="mt-3 text-[16px] leading-[1.6] text-ink-2">{error}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setState("loading");
                  void load();
                }}
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

        {state === "ready" && data && (
          <>
            <p className="flex items-center gap-2 text-[14px] text-ink-2">
              {data.join.canJoin && (
                <span aria-hidden className="h-2 w-2 rounded-full bg-live" />
              )}
              {data.join.canJoin ? "Ready now" : "Scheduled meeting"}
            </p>
            <h1 className="mt-3 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
              Meet {data.booking.company.agentName}
            </h1>
            <p className="mt-3 text-[16px] leading-[1.6] text-ink-2">
              <span className="font-mono tabular text-ink">{when}</span>
              {", "}
              <span className="font-mono tabular">
                {data.booking.durationMinutes} min
              </span>
            </p>

            <p className="mt-6 max-w-[62ch] text-[16px] leading-[1.6] text-ink-2">
              {data.join.message}
            </p>

            {data.booking.notes && (
              <div className="mt-6 border-t border-rule pt-5">
                <p className="text-[14px] text-ink-3">
                  {data.booking.company.agentName} has already read this
                </p>
                <p className="mt-2 max-w-[62ch] text-[16px] leading-[1.6] text-ink">
                  {data.booking.notes}
                </p>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mt-6 border-l-2 border-critical pl-3 text-[15px] leading-[1.5] text-critical"
              >
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={!data.join.canJoin || joining}
              onClick={() => void join()}
              className={cn(
                CONTROL,
                "mt-8 flex h-12 w-full items-center justify-center gap-3 border px-6 text-[15px] font-semibold sm:w-auto sm:self-start",
                !data.join.canJoin || joining
                  ? "cursor-not-allowed border-rule bg-sunken text-ink-3"
                  : "border-live bg-live text-white hover:opacity-90 active:scale-[0.99]",
              )}
            >
              {joining && (
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              )}
              {joining
                ? "Starting the call"
                : data.join.canJoin
                  ? `Start the call with ${data.booking.company.agentName}`
                  : "Waiting for the meeting to open"}
            </button>

            {data.join.phase === "upcoming" && (
              <p className="mt-4 text-[14px] text-ink-3">
                This page unlocks on its own when it is time. Keep the tab open, or come
                back to this link.
              </p>
            )}

            <p className="mt-10 border-t border-rule pt-6 text-[15px] text-ink-3">
              Rather type?{" "}
              <Link
                href={`/fde/${data.booking.company.slug}`}
                className="font-medium text-ink underline underline-offset-[3px] hover:text-ink-2"
              >
                Open the chat instead
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
