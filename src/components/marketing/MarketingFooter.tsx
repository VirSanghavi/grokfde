import { LogoMark } from "@/components/icons";
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
      { href: "https://github.com/LiamBMX/grokathon-build", label: "GitHub" },
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
      {/* CTA band over night skyline */}
      <section className="relative isolate min-h-[min(72vh,640px)] overflow-hidden">
        <CinematicVideo
          src="/marketing/footer.mp4"
          poster="/marketing/footer-still.jpg"
          gradient="footer"
        />
        <div className="relative z-10 mx-auto flex min-h-[min(72vh,640px)] max-w-6xl flex-col justify-center px-5 py-20 sm:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
            04 · Get started
          </p>
          <h2 className="mt-4 max-w-2xl text-balance text-[clamp(2rem,5.5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
            See what your last deal was missing.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70 sm:text-base">
            Deploy one FDE on your docs and tools. In minutes you will know whether every
            prospect can reach a real technical engineer without waiting on your calendar.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/onboarding"
              className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[14px] font-semibold text-slate-900 transition-all duration-150 hover:bg-white/95 active:scale-[0.98]"
            >
              Deploy your FDE
            </Link>
            <Link
              href="/fde/grok-fde"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/30 bg-white/5 px-6 text-[14px] font-medium text-white backdrop-blur-sm transition-all duration-150 hover:border-white/45 hover:bg-white/10"
            >
              Talk to Atlas
            </Link>
          </div>
        </div>
      </section>

      {/* Link grid */}
      <div className="border-t border-white/10 bg-black">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <LogoMark size={32} variant="brand" />
              <p className="text-[17px] font-semibold tracking-tight text-white">Grok FDE</p>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-white/50">
              An AI forward-deployed engineer for technical companies. One trained agent.
              Every prospect gets an engineer.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <p className="text-[13px] font-semibold text-white">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13.5px] text-white/50 transition-colors duration-150 hover:text-white/90"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-5 sm:px-8">
          <p className="font-mono text-[11px] text-white/35">
            © {new Date().getFullYear()} Grok FDE · Powered by Grok
          </p>
          <p className="text-[12px] text-white/35">Every prospect gets an engineer.</p>
        </div>
      </div>
    </footer>
  );
}
