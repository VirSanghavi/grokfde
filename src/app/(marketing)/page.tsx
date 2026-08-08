import { CinematicVideo } from "@/components/marketing/CinematicVideo";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "Train once",
    body: "Docs, APIs, pricing, MCP. One company model.",
  },
  {
    n: "02",
    title: "Meet every prospect",
    body: "Chat and FaceTime share the same engineer and memory.",
  },
  {
    n: "03",
    title: "Design and build",
    body: "Architecture, tools, safe branch and PR in their repo.",
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingNav />

      {/* Hero */}
      <section className="relative isolate h-[min(100dvh,820px)] min-h-[560px] w-full overflow-hidden">
        <CinematicVideo
          src="/marketing/hero.mp4"
          poster="/marketing/hero-still.jpg"
          gradient="hero"
        />

        <div className="relative z-10 mx-auto flex h-full max-w-[1120px] flex-col justify-end px-5 pb-10 pt-24 sm:px-10 sm:pb-12 lg:pb-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[32rem]">
              <h1 className="marketing-display text-[clamp(2.6rem,6.5vw,4.4rem)] font-medium leading-[0.98] tracking-[-0.04em] text-white">
                Every prospect
                <br />
                gets an engineer.
              </h1>
              <p className="marketing-body mt-4 max-w-[26rem] text-[15px] leading-[1.5] text-white/72 sm:text-[16px]">
                Train Grok on your company once. Prospects chat or FaceTime a
                persistent AI FDE with full context and live tools.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/fde/grok-fde"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[14px] font-semibold tracking-[-0.01em] text-[#111827] transition-transform duration-150 hover:bg-[#fafafa] active:scale-[0.985]"
                >
                  Try the live demo
                </Link>
                <Link
                  href="/onboarding"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/30 bg-transparent px-6 text-[14px] font-medium text-white/92 transition-colors duration-150 hover:border-white/45 hover:bg-white/[0.06]"
                >
                  Deploy yours
                </Link>
              </div>
            </div>

            <p className="inline-flex w-fit items-center rounded-full border border-white/25 bg-black/20 px-4 py-2 text-[13px] font-medium text-white/88 backdrop-blur-md">
              Chat · FaceTime · Slack · Code
            </p>
          </div>
        </div>
      </section>

      {/* Live demo — the homepage is the product */}
      <section id="demo" className="relative border-t border-white/[0.06] bg-[#050608]">
        <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-10 sm:py-14">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[12px] font-medium tracking-[-0.01em] text-white/40">
                Live demo
              </p>
              <h2 className="marketing-display mt-1.5 text-[clamp(1.55rem,3.2vw,2.1rem)] font-medium leading-[1.15] tracking-[-0.03em] text-white">
                Talk to Atlas right now.
              </h2>
            </div>
            <p className="max-w-sm text-[13.5px] leading-snug text-white/45 sm:text-right">
              Same memory across chat and video call. Ask about Kubernetes, pricing, or security.
            </p>
          </div>

          <div className="mt-7 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0c0e12] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            {/* Demo chrome */}
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-white">
                  Atlas
                </p>
                <p className="truncate text-[12px] text-white/45">
                  Forward-Deployed Engineer · Grok FDE
                </p>
              </div>
              <Link
                href="/fde/grok-fde"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-white px-4 text-[13px] font-semibold text-[#111] transition-transform hover:bg-[#fafafa] active:scale-[0.98]"
              >
                Open full demo
              </Link>
            </div>

            <div className="grid lg:grid-cols-[1fr_220px]">
              <div className="space-y-4 p-4 sm:p-5">
                <DemoBubble
                  who="You"
                  text="We run Kubernetes on AWS. Can you sit in front of every technical evaluation?"
                />
                <DemoBubble
                  who="Atlas"
                  agent
                  text="Yes. I'd keep your orchestration layer and put Grok FDE in front of prospects — chat and FaceTime with the same memory, plus MCP tools when you need sandboxes or cost estimates."
                />
                <DemoBubble
                  who="You"
                  text="What about a live call with full context from this thread?"
                />
                <DemoBubble
                  who="Atlas"
                  agent
                  text="Hit Call. I already know the K8s/AWS stack from chat. Tools and company docs stay available on the call."
                />

                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href="/fde/grok-fde"
                    className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-[13.5px] font-semibold text-[#111] transition-transform active:scale-[0.98]"
                  >
                    Continue in chat
                  </Link>
                  <Link
                    href="/fde/grok-fde"
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/25 px-5 text-[13.5px] font-medium text-white/90 transition-colors hover:bg-white/[0.06]"
                  >
                    Start video call
                  </Link>
                </div>
              </div>

              <aside className="border-t border-white/[0.08] bg-white/[0.02] p-4 lg:border-l lg:border-t-0 sm:p-5">
                <p className="text-[11px] font-medium tracking-[-0.01em] text-white/40">
                  Prospect memory
                </p>
                <dl className="mt-3 space-y-3 text-[13px]">
                  <div>
                    <dt className="text-white/40">Stack</dt>
                    <dd className="mt-0.5 font-medium text-white/88">Kubernetes · AWS</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Stage</dt>
                    <dd className="mt-0.5 font-medium text-white/88">Technical evaluation</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Channels</dt>
                    <dd className="mt-0.5 font-medium text-white/88">Chat · Voice</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Next</dt>
                    <dd className="mt-0.5 font-medium text-white/88">Live FaceTime call</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — tight */}
      <section id="how-it-works" className="border-t border-white/[0.06] bg-[#030406]">
        <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-10 sm:py-14">
          <p className="text-[12px] font-medium tracking-[-0.01em] text-white/40">How it works</p>
          <h2 className="marketing-display mt-1.5 max-w-xl text-[clamp(1.55rem,3.2vw,2.1rem)] font-medium leading-[1.15] tracking-[-0.03em] text-white">
            Train once. FaceTime forever.
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className="text-[12px] font-medium text-white/30">{step.n}</span>
                <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.015em] text-white">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-snug text-white/48">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Product strip — no giant empty sections */}
      <section id="product" className="border-t border-white/[0.06] bg-[#050608]">
        <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-10 sm:py-14">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-3">
            {[
              {
                t: "Company knowledge",
                d: "Docs and MCP become a model the FDE actually uses on every call.",
              },
              {
                t: "FaceTime the FDE",
                d: "Browser video call with mic, camera, transcripts, and live tool use.",
              },
              {
                t: "Safe implementation",
                d: "Branch, validate, open a PR. Never push to main alone.",
              },
            ].map((card) => (
              <div key={card.t} className="bg-[#080a0e] p-5 sm:p-6">
                <h3 className="text-[14.5px] font-semibold tracking-[-0.015em] text-white">
                  {card.t}
                </h3>
                <p className="mt-2 text-[13.5px] leading-snug text-white/48">{card.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Channels — compact */}
      <section id="channels" className="border-t border-white/[0.06] bg-black">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-12">
          <div>
            <p className="text-[12px] font-medium text-white/40">Channels</p>
            <p className="marketing-display mt-1 text-[clamp(1.35rem,2.8vw,1.75rem)] font-medium tracking-[-0.03em] text-white">
              One engineer. Chat, video, Slack, code.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Chat", "FaceTime", "Email", "Slack", "PR"].map((label) => (
              <span
                key={label}
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-[13px] font-medium text-white/75"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}

function DemoBubble({
  who,
  text,
  agent,
}: {
  who: string;
  text: string;
  agent?: boolean;
}) {
  return (
    <div className={agent ? "max-w-[95%]" : "ml-auto max-w-[90%] sm:max-w-[85%]"}>
      <p
        className={`text-[11px] font-medium ${agent ? "text-white/40" : "text-right text-white/40"}`}
      >
        {who}
      </p>
      <div
        className={`mt-1 rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug ${
          agent
            ? "rounded-tl-md border border-white/[0.08] bg-white/[0.05] text-white/88"
            : "rounded-tr-md bg-white text-[#111] "
        }`}
      >
        {text}
      </div>
    </div>
  );
}
