import { CinematicVideo } from "@/components/marketing/CinematicVideo";
import Link from "next/link";

const COLS = [
  {
    title: "Product",
    links: [
      { href: "#product", label: "What it does" },
      { href: "#how-it-works", label: "How it works" },
      { href: "#channels", label: "Channels" },
      { href: "/fde/grok-fde", label: "Live demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/onboarding", label: "Get started" },
      { href: "/login", label: "Sign in" },
      { href: "https://github.com/VirSanghavi/grokfde", label: "GitHub" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "#", label: "Privacy" },
      { href: "#", label: "Terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="relative bg-black text-white">
      <section className="relative isolate min-h-[min(78vh,700px)] overflow-hidden">
        <CinematicVideo
          src="/marketing/footer.mp4"
          poster="/marketing/footer-still.jpg"
          gradient="footer"
        />
        <div className="relative z-10 mx-auto flex min-h-[min(78vh,700px)] max-w-[1120px] flex-col justify-center px-6 py-24 sm:px-10">
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-white/40">
            Get started
          </p>
          <h2 className="marketing-display mt-4 max-w-2xl text-[clamp(2.1rem,5vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.035em] text-white">
            See what your last deal was missing.
          </h2>
          <p className="marketing-body mt-5 max-w-md text-[16px] leading-[1.55] text-white/62">
            Deploy one FDE on your docs and tools. In minutes you will know whether every
            prospect can reach a real technical engineer without waiting on your calendar.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/onboarding"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[14.5px] font-semibold tracking-[-0.01em] text-[#111827] transition-transform duration-150 hover:bg-[#fafafa] active:scale-[0.985]"
            >
              Deploy your FDE
            </Link>
            <Link
              href="/fde/grok-fde"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-transparent px-7 text-[14.5px] font-medium text-white/90 transition-colors duration-150 hover:border-white/45 hover:bg-white/[0.06]"
            >
              Talk to Atlas
            </Link>
          </div>
        </div>
      </section>

      <div className="border-t border-white/[0.08] bg-black">
        <div className="mx-auto grid max-w-[1120px] gap-12 px-6 py-16 sm:grid-cols-2 sm:px-10 lg:grid-cols-4">
          <div className="max-w-xs">
            <p className="text-[16px] font-semibold tracking-[-0.02em] text-white">Grok FDE</p>
            <p className="mt-3 text-[13.5px] leading-[1.55] text-white/42">
              An AI forward-deployed engineer for technical companies. One trained agent.
              Every prospect gets an engineer.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <p className="text-[13px] font-semibold tracking-[-0.01em] text-white">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13.5px] text-white/42 transition-colors duration-150 hover:text-white/85"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-6 py-5 sm:px-10">
          <p className="text-[12px] text-white/30">
            © {new Date().getFullYear()} Grok FDE · Powered by Grok
          </p>
          <p className="text-[12px] text-white/30">Every prospect gets an engineer.</p>
        </div>
      </div>
    </footer>
  );
}
