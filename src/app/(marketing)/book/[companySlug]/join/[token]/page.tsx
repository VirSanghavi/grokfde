"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type JoinPayload = {
  booking: {
    startsAt: string;
    timezone: string;
    guestName: string;
    durationMinutes: number;
    company: { slug: string; name: string; agentName: string };
  };
  join: { canJoin: boolean; phase: string; message: string; opensAt: string };
  fdePath: string;
};

export default function JoinDemoPage() {
  const params = useParams<{ companySlug: string; token: string }>();
  const router = useRouter();
  const [data, setData] = useState<JoinPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  async function load() {
    const res = await fetch(`/api/bookings/join/${params.token}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "Link not found");
    setData(json);
    return json as JoinPayload;
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Could not load demo"),
    );
    const t = window.setInterval(() => {
      load().catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  async function join() {
    if (!data?.join.canJoin || joining) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/bookings/join/${params.token}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not join");
      router.push(json.fdePath || data.fdePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setJoining(false);
    }
  }

  const when = data
    ? new Intl.DateTimeFormat(undefined, {
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
    <div className="flex min-h-dvh flex-col bg-bg text-fg antialiased">
      <header className="mx-auto flex w-full max-w-[480px] items-center px-5 pt-6 sm:pt-8">
        <Link
          href="/"
          className="text-[16px] font-semibold tracking-[-0.02em] text-fg transition-opacity hover:opacity-70"
        >
          Grok FDE
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-5 py-12">
        {error && (
          <div className="rounded-2xl border border-danger/20 bg-danger-dim p-5 text-[14px] text-danger">
            {error}
          </div>
        )}
        {!error && !data && (
          <div className="flex flex-col items-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-border-strong border-t-fg" />
            <p className="mt-4 text-[14px] text-fg-muted">Opening demo room…</p>
          </div>
        )}
        {data && (
          <>
            <p className="text-[12px] font-medium text-fg-muted">Live demo</p>
            <h1 className="mt-2 text-[clamp(1.55rem,4vw,1.9rem)] font-semibold tracking-[-0.03em] text-fg">
              Meet {data.booking.company.agentName}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
              {when}
              <span className="text-fg-faint">
                {" "}
                · {data.booking.durationMinutes} min
              </span>
            </p>

            <div className="mt-8 rounded-2xl border border-border bg-bg-elevated p-5 shadow-sm">
              <p className="text-[14px] leading-relaxed text-fg-secondary">
                {data.join.message}
              </p>
              {data.join.phase === "upcoming" && (
                <p className="mt-3 text-[13px] text-fg-faint">
                  This page unlocks automatically when it is time. Keep the tab open
                  or come back from your confirmation email.
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={!data.join.canJoin || joining}
              onClick={() => void join()}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-fg text-[14.5px] font-semibold text-accent-fg transition-transform active:scale-[0.985] disabled:opacity-40"
            >
              {joining ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : data.join.canJoin ? (
                `FaceTime ${data.booking.company.agentName}`
              ) : (
                "Waiting for demo window"
              )}
            </button>

            <Link
              href={`/fde/${data.booking.company.slug}`}
              className="mt-3 flex h-11 w-full items-center justify-center text-[14px] font-medium text-fg-muted hover:text-fg"
            >
              Open chat instead
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
