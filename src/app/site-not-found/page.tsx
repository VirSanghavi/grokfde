import { LogoMark } from "@/components/icons";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "No FDE at this address",
  robots: { index: false, follow: false },
};

/**
 * What a company subdomain shows when no company owns it.
 *
 * Reached only by rewrite from the proxy, so the address bar still reads
 * acme.grokfde.com. A prospect who mistypes a shared link has to land on
 * something that explains itself, not a stack trace and not a bare 404.
 */
export default async function SiteNotFoundPage({
  searchParams,
}: {
  searchParams: Promise<{ host?: string }>;
}) {
  const { host } = await searchParams;
  const address = typeof host === "string" && host.length < 120 ? host : null;

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center gap-2.5 border-b border-rule px-5 py-4 sm:px-8 lg:px-12">
        <LogoMark size={24} title="Grok FDE" />
        <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-ink">
          Grok FDE
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:flex-row lg:gap-16 lg:px-12 lg:py-20">
        <div className="flex-1">
          <p className="text-label">404 no such workspace</p>
          <h1 className="mt-3 max-w-[16ch] text-display-l text-ink">
            Nobody has claimed this address.
          </h1>
          <p className="mt-4 max-w-[62ch] text-[1rem] leading-relaxed text-ink-2">
            Every company on Grok FDE gets one link, and the engineer behind it answers
            there. This one has no company behind it yet, so there is nobody here to talk
            to. Check the spelling of the link you were sent, or start your own.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="https://grokfde.com"
              className="transition-premium inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] bg-ink px-5 text-[0.9375rem] font-medium text-paper shadow-[var(--elevation-1)] hover:bg-ink-lift active:scale-[0.99]"
            >
              Go to Grok FDE
            </Link>
            <Link
              href="https://grokfde.com/signup"
              className="transition-premium inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] border border-rule-strong px-5 text-[0.9375rem] font-medium text-ink hover:bg-hover active:scale-[0.99]"
            >
              Create your own FDE
            </Link>
          </div>
        </div>

        <aside className="w-full border-t border-rule pt-8 lg:w-[22rem] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
          <p className="text-label">Address you tried</p>
          <p className="mt-2 font-mono text-[0.875rem] leading-6 break-all text-ink">
            {address ?? "unknown host"}
          </p>

          <dl className="mt-8 divide-y divide-rule border-t border-rule">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[0.875rem] text-ink-3">Status</dt>
              <dd className="font-mono text-[0.8125rem] tabular-nums text-ink-2">404</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[0.875rem] text-ink-3">Cause</dt>
              <dd className="text-[0.875rem] text-ink-2">No company on this subdomain</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[0.875rem] text-ink-3">Fix</dt>
              <dd className="text-[0.875rem] text-ink-2">Re-check the shared link</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
