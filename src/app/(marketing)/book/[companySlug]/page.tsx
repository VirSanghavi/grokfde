import { BookingScheduler } from "@/components/booking/BookingScheduler";
import { getCompanyBySlug } from "@/lib/server/company-context";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BookDemoPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  let company;
  try {
    company = await getCompanyBySlug(companySlug);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-bg text-fg antialiased">
      <header className="mx-auto flex w-full max-w-[920px] items-center justify-between px-5 pt-6 sm:px-6 sm:pt-8">
        <Link
          href="/"
          className="text-[16px] font-semibold tracking-[-0.02em] text-fg transition-opacity hover:opacity-70"
        >
          Grok FDE
        </Link>
        <Link
          href={`/fde/${company.slug}`}
          className="rounded-full px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          Chat instead
        </Link>
      </header>

      <main className="px-4 py-10 sm:px-6 sm:py-14">
        <BookingScheduler
          company={{
            slug: company.slug,
            name: company.name,
            agentName: company.agent_name,
          }}
        />
      </main>
    </div>
  );
}
