import { CinematicVideo } from "@/components/marketing/CinematicVideo";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "Train once",
    body: "Upload docs, APIs, pricing, security materials, and MCP servers. Grok builds a durable company model.",
  },
  {
    n: "02",
    title: "Meet every prospect",
    body: "One FDE link. Chat, email, and live voice share the same engineer and the same memory.",
  },
  {
    n: "03",
    title: "Design the fit",
    body: "Technical discovery and architecture grounded in your knowledge, not generic sales copy.",
  },
  {
    n: "04",
    title: "Build and stay",
    body: "Branch, validate, open a PR, then support them in Slack through production.",
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingNav />

      {/* ── Hero: Leaki-grade cinematic frame ── */}
      <section className="relative isolate h-dvh min-h-[640px] w-full overflow-hidden">
        <CinematicVideo
          src="/marketing/hero.mp4"
          poster="/marketing/hero-still.jpg"
          gradient="hero"
        />

        <div className="relative z-10 mx-auto flex h-full max-w-[1120px] flex-col justify-end px-6 pb-12 pt-28 sm:px-10 sm:pb-14 lg:pb-[4.5rem]">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[34rem]">
              <h1 className="marketing-display text-[clamp(2.85rem,7.2vw,4.85rem)] font-medium leading-[0.96] tracking-[-0.04em] text-white">
                Every prospect
                <br />
                gets an engineer.
              </h1>
              <p className="marketing-body mt-6 max-w-[26rem] text-[15.5px] font-normal leading-[1.55] text-white/72 sm:text-[16.5px]">
                Grok FDE turns your docs, APIs, and tools into a persistent AI
                forward-deployed engineer. Train once. Customers get technical depth
                instantly.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/onboarding"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[14.5px] font-semibold tracking-[-0.01em] text-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-transform duration-150 hover:bg-[#fafafa] active:scale-[0.985]"
                >
                  Deploy your FDE
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-transparent px-7 text-[14.5px] font-medium tracking-[-0.01em] text-white/92 backdrop-blur-[2px] transition-colors duration-150 hover:border-white/45 hover:bg-white/[0.06]"
                >
                  See how it works
                </Link>
              </div>
            </div>

            <div className="flex shrink-0 justify-start lg:justify-end lg:pb-1">
              <p className="inline-flex items-center rounded-full border border-white/28 bg-black/15 px-5 py-2.5 text-[13.5px] font-medium tracking-[-0.01em] text-white/88 backdrop-blur-md">
                Chat. Voice. Slack. Code.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product ── */}
      <section id="product" className="relative bg-[#050608] text-white">
        <div className="mx-auto max-w-[1120px] px-6 py-24 sm:px-10 sm:py-28">
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-white/35">
            Product
          </p>
          <h2 className="marketing-display mt-4 max-w-3xl text-[clamp(1.9rem,3.8vw,2.65rem)] font-medium leading-[1.12] tracking-[-0.03em] text-white">
            Not a chatbot. A technical employee that scales.
          </h2>
          <p className="marketing-body mt-5 max-w-2xl text-[16px] leading-[1.6] text-white/50">
            Sales cannot answer deep implementation questions. Engineers cannot join every
            call. Grok FDE bridges that gap with one identity that knows your product and
            remembers the prospect.
          </p>

          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-3">
            {[
              {
                t: "Company knowledge",
                d: "Docs, pricing, security, playbooks, and MCP servers become a model the FDE actually uses.",
              },
              {
                t: "Cross-channel memory",
                d: "What they said in chat shows up on the call. Slack continues the same thread of ownership.",
              },
              {
                t: "Safe implementation",
                d: "Analyze their repo, plan a fit, open a branch, validate, prepare a PR. Never push to main alone.",
              },
            ].map((card) => (
              <div key={card.t} className="bg-[#080a0e] p-7 sm:p-8">
                <h3 className="text-[15.5px] font-semibold tracking-[-0.015em] text-white">
                  {card.t}
                </h3>
                <p className="mt-3 text-[14.5px] leading-[1.55] text-white/48">{card.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="relative border-t border-white/[0.05] bg-[#030406]">
        <div className="mx-auto max-w-[1120px] px-6 py-24 sm:px-10 sm:py-28">
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-white/35">
            How it works
          </p>
          <h2 className="marketing-display mt-4 max-w-2xl text-[clamp(1.9rem,3.8vw,2.65rem)] font-medium leading-[1.12] tracking-[-0.03em] text-white">
            From first message to production support.
          </h2>

          <ol className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className="text-[13px] font-medium tracking-wide text-white/30">
                  {step.n}
                </span>
                <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.015em] text-white">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-[14px] leading-[1.55] text-white/48">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Channels ── */}
      <section id="channels" className="relative border-t border-white/[0.05] bg-[#050608]">
        <div className="mx-auto max-w-[1120px] px-6 py-24 sm:px-10 sm:py-28">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-white/35">
                Channels
              </p>
              <h2 className="marketing-display mt-4 max-w-xl text-[clamp(1.9rem,3.8vw,2.65rem)] font-medium leading-[1.12] tracking-[-0.03em] text-white">
                One engineer. Four surfaces.
              </h2>
            </div>
            <p className="max-w-sm text-[14.5px] leading-[1.55] text-white/45 lg:text-right">
              Not four bots. One continuous FDE with shared prospect memory.
            </p>
          </div>

          <div className="mt-14 grid gap-3 sm:grid-cols-2">
            {[
              ["Chat", "Technical selling that feels like texting a solutions engineer."],
              ["Voice", "One-click call. No calendar. Same memory as the chat thread."],
              ["Email", "Follow-ups that continue the relationship, not a new bot identity."],
              ["Slack", "Embedded in the customer channel from evaluation through production."],
            ].map(([label, detail]) => (
              <div
                key={label}
                className="flex gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-5"
              >
                <span className="w-14 shrink-0 text-[13px] font-semibold tracking-[-0.01em] text-white/90">
                  {label}
                </span>
                <p className="text-[14.5px] leading-[1.55] text-white/48">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Continuity ── */}
      <section className="border-t border-white/[0.05] bg-black">
        <div className="mx-auto max-w-[1120px] px-6 py-20 sm:px-10 sm:py-24">
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-white/35">
            Continuity
          </p>
          <blockquote className="marketing-display mt-5 max-w-3xl text-[clamp(1.45rem,3.2vw,2rem)] font-medium leading-[1.25] tracking-[-0.025em] text-white">
            “Since you mentioned Kubernetes on AWS earlier, I wouldn&apos;t replace your
            orchestration layer…”
          </blockquote>
          <p className="mt-5 max-w-lg text-[15px] leading-[1.55] text-white/45">
            Prospect said it in chat. Minutes later, the voice agent already knows. That is
            ownership, not a support script.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/fde/grok-fde"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[14.5px] font-semibold tracking-[-0.01em] text-[#111827] transition-transform duration-150 hover:bg-[#fafafa] active:scale-[0.985]"
            >
              Talk to Atlas
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 px-7 text-[14.5px] font-medium text-white/85 transition-colors duration-150 hover:border-white/40 hover:bg-white/[0.04]"
            >
              Open operations
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
