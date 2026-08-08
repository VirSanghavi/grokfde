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
    body: "Share one FDE link. Chat, email, and live voice are the same engineer with the same memory.",
  },
  {
    n: "03",
    title: "Design the fit",
    body: "Technical discovery, architecture overlays, and grounded answers from your knowledge, not generic sales copy.",
  },
  {
    n: "04",
    title: "Build and stay",
    body: "Connect their environment, open a branch, validate, prepare a PR, then support them in Slack through production.",
  },
];

const CHANNELS = [
  {
    label: "Chat",
    detail: "Technical selling that feels like texting a solutions engineer.",
  },
  {
    label: "Voice",
    detail: "One-click call. No calendar. Same memory as the chat thread.",
  },
  {
    label: "Email",
    detail: "Follow-ups that continue the relationship, not a new bot identity.",
  },
  {
    label: "Slack",
    detail: "Embedded in the customer channel from evaluation through production.",
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingNav />

      {/* ── Hero ── */}
      <section className="relative isolate min-h-dvh w-full overflow-hidden">
        <CinematicVideo
          src="/marketing/hero.mp4"
          poster="/marketing/hero-still.jpg"
          gradient="hero"
        />

        <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col justify-end px-5 pb-10 pt-28 sm:px-8 sm:pb-14 lg:pb-16">
          <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <div className="max-w-2xl">
              <h1 className="text-balance text-[clamp(2.75rem,8vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-white">
                Every prospect
                <br />
                gets an engineer.
              </h1>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/75 sm:text-[17px]">
                Grok FDE turns your docs, APIs, and tools into a persistent AI
                forward-deployed engineer. Train once. Let customers talk to
                technical depth instantly.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/onboarding"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[14px] font-semibold text-slate-900 shadow-sm transition-all duration-150 hover:bg-white/95 active:scale-[0.98]"
                >
                  Deploy your FDE
                </Link>
                <Link
                  href="/fde/grok-fde"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/35 bg-white/5 px-6 text-[14px] font-medium text-white backdrop-blur-sm transition-all duration-150 hover:border-white/50 hover:bg-white/10"
                >
                  See how it works
                </Link>
              </div>
            </div>

            <div className="flex justify-start lg:justify-end lg:pb-1">
              <p className="inline-flex rounded-full border border-white/25 bg-black/20 px-4 py-2 text-[13px] font-medium tracking-tight text-white/85 backdrop-blur-md">
                Chat. Voice. Slack. Code.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product ── */}
      <section id="product" className="relative bg-[#07090c] text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            01 · Product
          </p>
          <h2 className="mt-4 max-w-3xl text-balance text-[clamp(1.85rem,4vw,2.75rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-white">
            Not a chatbot. A technical employee that scales.
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-base">
            Sales cannot answer deep implementation questions. Engineers cannot join every
            call. Grok FDE bridges that gap with one identity that knows your product,
            remembers the prospect, and can act through your tools.
          </p>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                t: "Company knowledge",
                d: "Docs, pricing, security, playbooks, and MCP servers become a durable model the FDE actually uses.",
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
              <div
                key={card.t}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm transition-colors duration-200 hover:border-white/[0.14] hover:bg-white/[0.045]"
              >
                <h3 className="text-[16px] font-semibold tracking-tight text-white">{card.t}</h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-white/50">{card.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="relative border-t border-white/[0.06] bg-[#050607]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            02 · How it works
          </p>
          <h2 className="mt-4 max-w-2xl text-balance text-[clamp(1.85rem,4vw,2.75rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-white">
            From first message to production support.
          </h2>

          <ol className="mt-14 grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li
                key={step.n}
                className="relative border-t border-white/[0.08] py-8 pr-6 sm:border-t-0 sm:border-l sm:pl-6 sm:pr-4 first:sm:border-l-0 first:sm:pl-0"
              >
                <span className="font-mono text-[12px] font-medium text-emerald-400/90">
                  {step.n}
                </span>
                <h3 className="mt-3 text-[16px] font-semibold tracking-tight text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-white/50">{step.body}</p>
                {i < STEPS.length - 1 && (
                  <span className="pointer-events-none absolute -right-1 top-10 hidden h-px w-2 bg-white/10 lg:block" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Channels ── */}
      <section id="channels" className="relative border-t border-white/[0.06] bg-[#07090c]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                03 · Channels
              </p>
              <h2 className="mt-4 max-w-xl text-balance text-[clamp(1.85rem,4vw,2.75rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-white">
                One engineer. Four surfaces.
              </h2>
            </div>
            <p className="max-w-sm text-[14px] leading-relaxed text-white/50 lg:text-right">
              Not four bots. One continuous FDE identity with shared prospect memory.
            </p>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <div
                key={c.label}
                className="group flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent px-5 py-5 transition-colors duration-200 hover:border-white/[0.14]"
              >
                <span className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.16em] text-emerald-400/80">
                  {c.label}
                </span>
                <p className="text-[14px] leading-relaxed text-white/60">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Magic moment strip ── */}
      <section className="border-t border-white/[0.06] bg-black">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] px-6 py-10 sm:px-10 sm:py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
              The magic moment
            </p>
            <blockquote className="mt-5 max-w-3xl text-balance text-[clamp(1.35rem,3vw,1.85rem)] font-medium leading-snug tracking-[-0.02em] text-white">
              “Since you mentioned Kubernetes on AWS earlier, I wouldn&apos;t replace your
              orchestration layer…”
            </blockquote>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-white/50">
              Prospect said it in chat. Five minutes later, the voice agent already knows.
              That is continuity of ownership, not a support script.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/fde/grok-fde"
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[14px] font-semibold text-slate-900 transition-all duration-150 hover:bg-white/95"
              >
                Talk to Atlas
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/25 px-6 text-[14px] font-medium text-white/85 transition-all duration-150 hover:border-white/40 hover:bg-white/5"
              >
                Open operations
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
