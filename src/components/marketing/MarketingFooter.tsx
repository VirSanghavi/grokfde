import { FilmStill } from "@/components/marketing/FilmStill";
import Link from "next/link";

/**
 * Two columns, not four. There is no Privacy or Terms route in this app, and a
 * `href="#"` that goes nowhere is the exact placeholder leak the contract bans,
 * so the legal column is gone until the pages exist.
 *
 * Every product link works without an account. `Sign in` is the only gated
 * destination and it stays a quiet text link, never a button.
 */
const COLS = [
  {
    title: "Product",
    links: [
      { href: "/fde/grok-fde", label: "Talk to the engineer" },
      { href: "/fde/grok-fde?call=1", label: "Start a voice call" },
      { href: "/book/grok-fde", label: "Book a call" },
      { href: "#what-it-does", label: "What it does" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "https://github.com/VirSanghavi/grokfde", label: "Source on GitHub" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="relative bg-stage text-white">
      <section className="relative isolate flex min-h-[min(60svh,520px)] w-full flex-col justify-end overflow-hidden">
        <FilmStill src="/marketing/footer-still.jpg" scrim="footer" />

        <div className="on-stage relative z-10 w-full px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <h2 className="max-w-[18ch] text-display-l text-white">
            Put an engineer in front of your next evaluation.
          </h2>
          <p className="mt-5 max-w-[58ch] text-body-l text-white/78">
            Thirty minutes, and you can bring the hardest technical question your
            buyers ask.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/book/grok-fde"
              className="inline-flex h-12 items-center justify-center rounded-[var(--radius-control)] bg-paper px-6 text-[15px] font-semibold tracking-[-0.01em] text-ink transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-white active:scale-[0.99]"
            >
              Book a call
            </Link>
            <Link
              href="/fde/grok-fde"
              className="inline-flex h-12 items-center justify-center rounded-[var(--radius-control)] border border-white/20 bg-stage/45 px-6 text-[15px] font-medium text-white backdrop-blur-md transition-[background-color,border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:border-white/40 hover:bg-stage/65 active:scale-[0.99]"
            >
              Talk to the engineer
            </Link>
          </div>
        </div>
      </section>

      <div className="on-stage w-full border-t border-white/10 px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)_minmax(0,4fr)] lg:gap-16">
          <div>
            <p className="text-[17px] font-semibold tracking-[-0.02em] text-white">
              Grok FDE
            </p>
            <p className="mt-3 max-w-[52ch] text-body text-white/55">
              A forward-deployed engineer that takes the first technical meeting.
              Trained once on your documentation, reachable in chat and on a call.
            </p>
          </div>

          {COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-[13px] font-semibold tracking-[-0.01em] text-white">
                {col.title}
              </p>
              <ul className="mt-4">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-11 items-center text-body text-white/55 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/*
          Explicit size rather than `.text-caption`, which carries an ink colour
          of its own and would race the white override. White at 40% measures
          3.8:1 on stage, under the 4.5:1 floor, so these sit at 60%.
        */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6">
          <p className="footer-caption text-[0.8125rem] leading-[1.45] text-white/60">
            © {new Date().getFullYear()} Grok FDE. Built on Grok.
          </p>
          <p className="footer-caption text-[0.8125rem] leading-[1.45] text-white/60">
            Every prospect gets an engineer.
          </p>
        </div>
      </div>
    </footer>
  );
}
