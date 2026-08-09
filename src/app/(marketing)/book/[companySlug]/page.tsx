import { BookingScheduler } from "@/components/booking/BookingScheduler";
import { getCompanyBySlug } from "@/lib/server/company-context";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BookMeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  /**
   * `date` and `at` let another surface hand a visitor straight to one specific
   * slot, which is what the availability rail on the home page does. Read on the
   * server and passed as props rather than read with `useSearchParams`, so the
   * first paint already has the right day and no Suspense boundary is needed.
   */
  searchParams: Promise<{ date?: string; at?: string }>;
}) {
  const { companySlug } = await params;
  const { date, at } = await searchParams;
  let company;
  try {
    company = await getCompanyBySlug(companySlug);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-sunken text-ink antialiased">
      <header className="flex w-full items-center justify-between border-b border-rule bg-surface px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="-ml-1 flex h-11 items-center rounded-[8px] px-1 text-[16px] font-semibold tracking-[-0.02em] text-ink transition-opacity duration-[120ms] hover:opacity-70"
        >
          Grok FDE
        </Link>
        <Link
          href={`/fde/${company.slug}`}
          className="-mr-2 flex h-11 items-center rounded-[8px] px-2 text-[14px] font-medium text-ink-3 transition-colors duration-[120ms] hover:text-ink"
        >
          Chat instead
        </Link>
      </header>

      <main>
        <BookingScheduler
          company={{
            slug: company.slug,
            name: company.name,
            agentName: company.agent_name,
          }}
          initialDate={/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date : undefined}
          initialSlotIso={at}
        />
      </main>
    </div>
  );
}
