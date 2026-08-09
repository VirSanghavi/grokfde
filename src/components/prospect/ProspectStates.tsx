"use client";

import { cn } from "@/lib/utils";

/**
 * The three things that can happen instead of a working page.
 *
 * All of them are designed surfaces. None of them is a spinner that never
 * resolves, and none of them lets a rejected promise reach the console as the
 * only sign anything went wrong. A mistyped subdomain is a completely normal
 * event and it gets a real page.
 */

const SHELL = "mx-auto w-full max-w-[68ch] px-5 py-16 md:px-8 lg:px-12";

export function PageSkeleton() {
  return (
    <div className="min-h-dvh bg-paper" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the conversation</span>
      <div className="border-b border-rule">
        <div className="flex items-center gap-3 px-5 py-4 md:px-8 lg:px-12">
          <div className="h-9 w-9 rounded-full bg-sunken" />
          <div className="space-y-2">
            <div className="h-3.5 w-32 rounded-[2px] bg-sunken" />
            <div className="h-3 w-48 rounded-[2px] bg-sunken" />
          </div>
        </div>
      </div>
      {/* Shaped like the composer that is about to appear, so nothing jumps. */}
      <div className="px-5 pt-16 md:px-8 lg:px-12">
        <div className="h-8 w-[min(100%,28rem)] rounded-[2px] bg-sunken" />
        <div className="mt-4 h-4 w-[min(100%,44rem)] rounded-[2px] bg-sunken" />
        <div className="mt-10 h-[68px] w-full max-w-[52rem] rounded-[var(--radius-control)] border border-rule bg-surface" />
      </div>
    </div>
  );
}

/** No company is published at this address. */
export function NotPublished({ companySlug }: { companySlug: string }) {
  return (
    <main className={cn(SHELL, "min-h-dvh bg-paper")}>
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
        Grok FDE
      </p>
      <h1 className="mt-6 text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance">
        No engineer is published here yet
      </h1>
      <p className="mt-5 text-[1rem] leading-[1.6] text-ink-2">
        Nothing answers at{" "}
        <span className="font-mono text-[0.9375rem] text-ink">{companySlug}</span>. Either
        the address is mistyped, or the company has not published their engineer to it yet.
      </p>
      <p className="mt-4 text-[1rem] leading-[1.6] text-ink-2">
        If someone sent you this link, ask them to check the address. If it is your company,
        publishing takes one step from your dashboard.
      </p>
    </main>
  );
}

/** Something on our side failed. Human sentence, real retry. */
export function SessionError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <main className={cn(SHELL, "min-h-dvh bg-paper")}>
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-critical">
        Could not connect
      </p>
      <h1 className="mt-6 text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance">
        The engineer is not reachable right now
      </h1>
      <p className="mt-5 text-[1rem] leading-[1.6] text-ink-2">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={cn(
          "mt-8 inline-flex h-11 min-w-[8rem] items-center justify-center rounded-[var(--radius-control)] px-5",
          "bg-ink text-[0.9375rem] font-medium text-paper",
          "transition-colors duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          "hover:bg-[var(--color-ink-lift)] active:scale-[0.99]",
          "",
          "disabled:cursor-not-allowed disabled:bg-ink-4",
        )}
      >
        {retrying ? "Trying again" : "Try again"}
      </button>
    </main>
  );
}
