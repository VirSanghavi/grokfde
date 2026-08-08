import { Button } from "@/components/ui/Button";
import { ArrowRight, BookOpen, MessageSquare, Zap } from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-bg-elevated">
        <div className="page-frame flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-brand font-mono text-[10px] font-semibold text-brand-fg">
              FDE
            </span>
            <span className="text-sm font-semibold tracking-tight text-fg">Grok FDE</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/fde/grok-fde" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Talk to ours
              </Button>
            </Link>
            <Link href="/onboarding">
              <Button size="sm">Create your FDE</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="page-frame pb-16 pt-14 sm:pb-24 sm:pt-20">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">
              Forward-deployed intelligence
            </p>
            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl sm:leading-[1.08]">
              Every prospect gets an engineer.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-fg-muted">
              Train Grok on your company once. Let every customer talk to a technical engineer
              instantly across chat, email, voice, and Slack — through implementation and production.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup">
                <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Create your FDE
                </Button>
              </Link>
              <Link href="/fde/grok-fde">
                <Button size="lg" variant="secondary">
                  Talk to ours
                </Button>
              </Link>
              <Link href="/login" className="text-sm font-medium text-fg-muted hover:text-fg">
                Sign in
              </Link>
            </div>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: BookOpen,
                label: "Knowledge",
                detail: "Docs, APIs, pricing, security, MCP tools",
              },
              {
                icon: MessageSquare,
                label: "Conversation",
                detail: "One engineer across chat, email, and live voice",
              },
              {
                icon: Zap,
                label: "Action",
                detail: "Architecture, tools, and human escalation",
              },
            ].map((step, i) => (
              <div
                key={step.label}
                className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <step.icon className="h-5 w-5 text-brand" />
                  <span className="font-mono text-[11px] text-fg-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-fg">{step.label}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{step.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-bg-elevated">
          <div className="page-frame grid gap-8 py-14 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01",
                t: "Upload company knowledge",
                d: "Files, paste, URLs, playbooks, security docs.",
              },
              {
                n: "02",
                t: "Connect your tools",
                d: "MCP servers let the FDE take real actions.",
              },
              {
                n: "03",
                t: "Share one prospect link",
                d: "Always-available technical engineer. No scheduling.",
              },
              {
                n: "04",
                t: "Memory across channels",
                d: "Chat, email, and calls share the same context.",
              },
            ].map((item) => (
              <div key={item.n}>
                <p className="font-mono text-xs font-medium text-brand">{item.n}</p>
                <h3 className="mt-2 text-base font-semibold text-fg">{item.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="page-frame py-16 sm:py-20">
          <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated px-6 py-10 shadow-sm sm:px-10">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-faint">
                The magic moment
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                Prospect mentions their stack in chat. Five minutes later, the voice agent already
                knows.
              </h2>
              <p className="mt-4 text-fg-muted">
                Not a chatbot. Not a ticket router. An employee that remembers.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/fde/grok-fde">
                  <Button size="lg">Talk to Atlas</Button>
                </Link>
                <Link href="/dashboard">
                  <Button size="lg" variant="secondary">
                    View company dashboard
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-bg-elevated">
        <div className="page-frame flex flex-wrap items-center justify-between gap-3 py-5">
          <p className="text-sm font-medium text-fg">Grok FDE</p>
          <p className="text-sm text-fg-muted">Every prospect gets an engineer.</p>
        </div>
      </footer>
    </div>
  );
}
