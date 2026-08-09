import { IconArrowRight } from "@/components/icons";
import { AvailabilityRail } from "@/components/marketing/AvailabilityRail";
import { FilmStill } from "@/components/marketing/FilmStill";
import { LiveEngineer } from "@/components/marketing/LiveEngineer";
import { ShippedWork } from "@/components/marketing/ShippedWork";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import {
  FILM_SENTINEL_ID,
  MarketingNav,
} from "@/components/marketing/MarketingNav";
import Link from "next/link";

/**
 * Written as a product, never as an exhibit. No mention of a demo, no
 * methodology, no route paths as calls to action, no scripted conversation. The
 * proof is the live console below the hero, which talks to the real agent.
 *
 * Every destination on this page works for a stranger with no account. The one
 * primary action is booking a call.
 */

/**
 * Capabilities, not instructions. The first one is proven inline by the console
 * and so is not repeated here.
 */
const CAPABILITIES = [
  {
    title: "It takes the call.",
    body: "Live voice in the browser, with the same memory as the chat. Nobody has to repeat their stack twice.",
    action: { label: "Start a voice call", href: "/fde/grok-fde?call=1" },
  },
  {
    title: "It works your issues and tickets.",
    body: "GitHub issues and inbound support mail land in the same queue as everything else it handles, and it answers them with the same repository context it uses on a call.",
  },
  {
    title: "It hands off when it should.",
    body: "Anything it cannot answer from your material is raised for a human rather than guessed at, and the question is kept with the customer it came from.",
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingNav />

      {/* The cinematic moment. One frame, one claim, two actions. */}
      <section className="relative isolate flex h-[min(100svh,920px)] min-h-[600px] w-full flex-col justify-end overflow-hidden bg-stage">
        <FilmStill src="/marketing/hero-still.jpg" scrim="hero" eager />

        <div className="on-stage relative z-10 w-full px-5 pb-12 pt-28 sm:px-8 sm:pb-14 lg:px-12 lg:pb-16">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
            <div className="min-w-0">
              <h1 className="max-w-[19ch] text-display-xl text-white">
                Your prospects can talk to an engineer. Right now.
              </h1>
              <p className="mt-5 max-w-[54ch] text-body-l text-white/80">
                Atlas answers from your documentation, in chat or on a live call,
                and books the follow-up itself.
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

            {/*
              The reference anchors a quiet summary bottom-right. Held back until
              there is room beside the headline; at phone width the composition
              is headline, subhead, and two full-width actions.
            */}
            <p className="hidden shrink-0 rounded-[var(--radius-hero)] border border-white/14 bg-stage/45 px-5 py-3.5 text-[15px] font-medium text-white/85 backdrop-blur-md sm:block">
              Chat. Call. Code.
            </p>
          </div>
        </div>

        <div
          id={FILM_SENTINEL_ID}
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px"
        />
      </section>

      {/* The dominant element on the page: the engineer, working. */}
      <section
        id="what-it-does"
        className="w-full border-b border-rule bg-paper px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <LiveEngineer />
      </section>

      {/* The strongest claim, and the one that is checkable. */}
      <section className="w-full border-b border-rule bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,11fr)] lg:gap-16">
          <div>
            <h2 className="max-w-[16ch] text-display-l text-ink">
              It opens the pull request.
            </h2>
            <p className="mt-5 max-w-[52ch] text-body-l text-ink-2">
              It reads the repository, works on a branch, validates what it wrote,
              and hands a human something to review. It never pushes to main.
            </p>
          </div>

          <ShippedWork />
        </div>
      </section>

      {/* Real calendar, real times, one click to a meeting. */}
      <section className="w-full border-b border-rule bg-sunken px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,11fr)] lg:gap-16">
          <div>
            <h2 className="max-w-[16ch] text-display-l text-ink">
              Thirty minutes, at three in the morning if that suits you.
            </h2>
            <p className="mt-5 max-w-[52ch] text-body-l text-ink-2">
              Availability runs around the clock in your own time zone, because the
              engineer taking the meeting does not sleep. Every time below is open.
            </p>
          </div>

          <AvailabilityRail />
        </div>
      </section>

      {/* Supporting capabilities. Tighter rhythm, quieter than the three above. */}
      <section className="w-full border-b border-rule bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,11fr)] lg:gap-16">
          <h2 className="max-w-[14ch] text-display-m text-ink">
            The rest of the job, not just the first answer.
          </h2>

          <ul className="border-t border-rule">
            {CAPABILITIES.map((capability) => (
              <li
                key={capability.title}
                className="grid gap-2 border-b border-rule py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12"
              >
                <h3 className="text-title text-ink">{capability.title}</h3>
                <div>
                  <p className="max-w-[68ch] text-body text-ink-2">
                    {capability.body}
                  </p>
                  {capability.action && (
                    <Link
                      href={capability.action.href}
                      className="group mt-3 inline-flex min-h-11 items-center gap-2 text-body font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:text-ink-2"
                    >
                      {capability.action.label}
                      <IconArrowRight
                        size={14}
                        className="shrink-0 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
                      />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
