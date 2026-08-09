"use client";

import { IconAlert, IconArrowRight, IconCheck, IconCopy, LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api/client";
import { PERSONAS, getPersonaById, personaForSlug, resolvePersona } from "@/lib/personas";
import { cn, errorMessage, slugify } from "@/lib/utils";
import type { Company } from "@/types/ui";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";



/**
 * The root domain a shared company link lives on.
 *
 * Development runs on localhost, which has no wildcard, so the link we show is
 * still the real product link. The local path link sits next to it so the same
 * screen is testable without DNS.
 */
function shareRootDomain(): string {
  if (typeof window === "undefined") return "grokfde.com";
  const host = window.location.host.split(":")[0]!.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.endsWith(".vercel.app")
  ) {
    return "grokfde.com";
  }
  return host.split(".").slice(-2).join(".");
}

type KnowledgeState =
  | { status: "none" }
  | { status: "reading"; url: string }
  | { status: "ready"; title: string }
  | { status: "failed"; url: string; message: string };

export default function OnboardingPage() {
  const [companyName, setCompanyName] = useState("");
  const [agentName, setAgentName] = useState("");
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const [company, setCompany] = useState<Company | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeState>({ status: "none" });
  const [rootDomain, setRootDomain] = useState("grokfde.com");
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => setRootDomain(shareRootDomain()), []);

  useEffect(() => {
    if (company) doneHeadingRef.current?.focus();
  }, [company]);

  const previewSlug = useMemo(() => slugify(companyName) || "your-company", [companyName]);
  // Auto assigned from the slug, so nobody has to choose, and two companies that
  // never choose still get different engineers. One click swaps it.
  const autoPersona = useMemo(() => personaForSlug(previewSlug), [previewSlug]);
  const persona = (personaId && getPersonaById(personaId)) || autoPersona;
  const effectiveAgent = agentName.trim() || persona.name;

  /** Reads the site in the background. Never blocks the finished agent. */
  async function ingestSite(url: string) {
    setKnowledge({ status: "reading", url });
    try {
      const source = await api.addUrlKnowledge({ url });
      setKnowledge({ status: "ready", title: source.title });
    } catch (err) {
      setKnowledge({
        status: "failed",
        url,
        message: errorMessage(err, "We could not read that page."),
      });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = companyName.trim();
    if (!name) {
      setNameError("Enter your company name to create your engineer.");
      return;
    }
    if (busy) return;

    setNameError(undefined);
    setError(null);
    setBusy(true);

    try {
      const created = await api.createCompany({
        name,
        agentName: effectiveAgent,
        agentVoice: persona.voice,
      });
      setCompany(created);

      const url = siteUrl.trim();
      if (url) void ingestSite(url);
    } catch (err) {
      setError(errorMessage(err, "We could not create your workspace. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between gap-4 border-b border-rule px-5 py-4 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={24} title="Grok FDE home" />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-ink">
            Grok FDE
          </span>
        </Link>
        <p className="text-label">{company ? "Live" : "Set up"}</p>
      </header>

      {company ? (
        <ReadyView
          company={company}
          rootDomain={rootDomain}
          knowledge={knowledge}
          onRetryKnowledge={() => {
            if (knowledge.status === "failed") void ingestSite(knowledge.url);
          }}
          headingRef={doneHeadingRef}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:flex-row lg:gap-16 lg:px-12 lg:py-16">
          <div className="flex-1">
            <h1 className="max-w-[18ch] text-display-l text-ink">
              Deploy your forward deployed engineer.
            </h1>
            <p className="mt-4 max-w-[58ch] text-[1rem] leading-relaxed text-ink-2">
              One field. {effectiveAgent} comes online with your company name, a voice, and a
              public link you can send to a prospect right now. Everything else is editable
              later.
            </p>

            <form onSubmit={onSubmit} className="mt-9 max-w-[34rem] space-y-5" noValidate>
              <Input
                label="Company name"
                name="company-name"
                autoFocus
                autoComplete="organization"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  if (nameError) setNameError(undefined);
                }}
                placeholder="Acme Infrastructure"
                error={nameError}
                hint="This is the only thing we need."
                required
              />

              <Input
                label="Website or docs URL"
                name="site-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="docs.acme.com"
                hint={`Optional. ${effectiveAgent} reads it and learns your product while you keep going.`}
              />

              <div className="border-t border-rule pt-4">
                <p className="text-[0.875rem] text-ink-3">
                  Your engineer is{" "}
                  <span className="font-medium text-ink">{effectiveAgent}</span>, a{" "}
                  {persona.gender === "female" ? "woman" : "man"} with the matching voice.{" "}
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="transition-premium font-medium text-ink underline underline-offset-4 hover:text-ink-2"
                  >
                    {showDetails ? "Done" : "Change"}
                  </button>
                </p>

                {showDetails && (
                  <div className="mt-4">
                    <p className="text-label">Pick an engineer</p>
                    <ul className="mt-2 divide-y divide-rule border-t border-rule">
                      {PERSONAS.map((p) => {
                        const active = p.id === persona.id && !agentName.trim();
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setPersonaId(p.id);
                                setAgentName("");
                              }}
                              aria-pressed={active}
                              className="transition-premium flex min-h-11 w-full items-center justify-between gap-4 px-1 text-left hover:bg-hover"
                            >
                              <span
                                className={cn(
                                  "text-[0.9375rem]",
                                  active ? "font-medium text-ink" : "text-ink-2",
                                )}
                              >
                                {p.name}
                              </span>
                              <span className="flex items-center gap-3">
                                <span className="font-mono text-[0.75rem] text-ink-4">
                                  {p.gender === "female" ? "female voice" : "male voice"}
                                </span>
                                {active && <IconCheck size={16} className="text-ink" />}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-4">
                      <Input
                        label="Or type your own name"
                        name="agent-name"
                        autoComplete="off"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder={persona.name}
                        hint={`Keeps ${persona.name}'s voice, so the name and the voice still match.`}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="min-h-[2.25rem]">
                {error && (
                  <p
                    role="alert"
                    className="flex gap-2 pb-3 text-[0.875rem] leading-snug text-critical"
                  >
                    <IconAlert size={16} className="mt-px shrink-0" />
                    <span>
                      {error}{" "}
                      <button
                        type="submit"
                        className="font-medium underline underline-offset-4"
                      >
                        Try again
                      </button>
                    </span>
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                loading={busy}
                loadingLabel={`Bringing ${effectiveAgent} online`}
                className="w-full sm:w-auto"
                rightIcon={<IconArrowRight size={16} />}
              >
                Create {effectiveAgent}
              </Button>
            </form>
          </div>

          <aside className="w-full border-t border-rule pt-8 lg:w-[24rem] lg:shrink-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
            <p className="text-label">Your share link</p>
            <p className="mt-2 font-mono text-[0.9375rem] leading-6 break-all text-ink">
              {previewSlug}.{rootDomain}
            </p>
            <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-3">
              One link is the whole product. Anyone who opens it talks to {effectiveAgent}
              {"; "}
              no account, no login.
            </p>

            <ol className="mt-8 divide-y divide-rule border-t border-rule">
              {[
                {
                  n: "01",
                  title: "We reserve the link",
                  body: "If the name is taken we add a number, so this never fails.",
                },
                {
                  n: "02",
                  title: `${effectiveAgent} comes online`,
                  body: "Chat and voice, both live the moment the workspace exists.",
                },
                {
                  n: "03",
                  title: "Knowledge, whenever you like",
                  body: "Paste a URL now, or add docs, files, and MCP servers later.",
                },
              ].map((step) => (
                <li key={step.n} className="flex gap-4 py-4">
                  <span className="font-mono text-[0.75rem] tabular-nums text-ink-4">
                    {step.n}
                  </span>
                  <span>
                    <span className="block text-[0.9375rem] font-medium text-ink">
                      {step.title}
                    </span>
                    <span className="mt-1 block text-[0.875rem] leading-relaxed text-ink-3">
                      {step.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </main>
  );
}

function ReadyView({
  company,
  rootDomain,
  knowledge,
  onRetryKnowledge,
  headingRef,
}: {
  company: Company;
  rootDomain: string;
  knowledge: KnowledgeState;
  onRetryKnowledge: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const shareUrl = `https://${company.slug}.${rootDomain}`;
  const shareLabel = `${company.slug}.${rootDomain}`;

  return (
    <div className="flex flex-1 flex-col gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:flex-row lg:gap-16 lg:px-12 lg:py-16">
      <div className="flex-1">
        <p className="text-label">Ready</p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 max-w-[20ch] text-display-l text-ink outline-none"
        >
          {company.agentName} is live for {company.name}.
        </h1>
        <p className="mt-4 max-w-[58ch] text-[1rem] leading-relaxed text-ink-2">
          Send this link to a prospect. They open it and talk to {company.agentName} in chat
          or on a call. No account, no invite, nothing to install.
        </p>

        <div className="mt-8">
          <p className="text-label">Share link</p>
          <div className="mt-3 flex flex-col gap-3 border-t border-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={shareUrl}
              className="transition-premium font-mono text-[clamp(1.125rem,3.4vw,1.75rem)] leading-tight font-medium break-all text-ink underline decoration-rule-strong underline-offset-[6px] hover:decoration-ink"
            >
              {shareLabel}
            </a>
            <CopyLinkButton value={shareUrl} />
          </div>
        </div>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/fde/${company.slug}`}
            className="transition-premium inline-flex h-12 items-center justify-center rounded-[var(--radius-control)] bg-ink px-5 text-[0.9375rem] font-medium text-paper shadow-[var(--elevation-1)] hover:bg-ink-lift active:scale-[0.99]"
          >
            Open the prospect view
          </Link>
          <Link
            href="/dashboard"
            className="transition-premium inline-flex h-12 items-center justify-center rounded-[var(--radius-control)] border border-rule-strong px-5 text-[0.9375rem] font-medium text-ink hover:bg-hover active:scale-[0.99]"
          >
            Open operations
          </Link>
        </div>
      </div>

      <aside className="w-full border-t border-rule pt-8 lg:w-[24rem] lg:shrink-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
        <p className="text-label">Workspace</p>
        <dl className="mt-3 divide-y divide-rule border-t border-rule">
          <Row label="Company" value={company.name} />
          <Row label="Engineer" value={company.agentName} />
          <Row label="Voice" value={resolvePersona({ agent_name: company.agentName, agent_voice: company.agentVoice, slug: company.slug }).voice} mono />
          <Row label="Slug" value={company.slug} mono />
        </dl>

        <p className="text-label mt-8">Knowledge</p>
        <div className="mt-3 border-t border-rule pt-4">
          <KnowledgeStatus state={knowledge} onRetry={onRetryKnowledge} />
        </div>
      </aside>
    </div>
  );
}

function KnowledgeStatus({
  state,
  onRetry,
}: {
  state: KnowledgeState;
  onRetry: () => void;
}) {
  if (state.status === "reading") {
    return (
      <div role="status" aria-live="polite">
        <div className="skeleton h-3.5 w-3/4" />
        <div className="skeleton mt-2.5 h-3 w-1/2" />
        <p className="mt-3 text-[0.875rem] text-ink-3">
          Reading {state.url}. This keeps going if you move on.
        </p>
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <div>
        <p className="flex items-start gap-2 text-[0.9375rem] text-ink">
          <IconCheck size={16} className="mt-0.5 shrink-0 text-positive" />
          <span className="min-w-0 break-words">{state.title}</span>
        </p>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-3">
          Read and indexed. Add more from the knowledge page any time.
        </p>
        <Link
          href="/knowledge"
          className="transition-premium mt-3 inline-block text-[0.875rem] font-medium text-ink underline underline-offset-4"
        >
          Add more knowledge
        </Link>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div role="alert">
        <p className="flex items-start gap-2 text-[0.9375rem] text-critical">
          <IconAlert size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{state.message}</span>
        </p>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-3">
          Your engineer is live either way. Nothing here is blocking.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onRetry}
            className="transition-premium text-[0.875rem] font-medium text-ink underline underline-offset-4"
          >
            Try that link again
          </button>
          <Link
            href="/knowledge"
            className="transition-premium text-[0.875rem] font-medium text-ink-3 underline underline-offset-4 hover:text-ink"
          >
            Paste the text instead
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[0.9375rem] text-ink">No sources yet.</p>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-3">
        Your engineer answers from your company name alone until you teach it. Docs, PDFs, a
        URL, or an MCP server all work.
      </p>
      <Link
        href="/knowledge"
        className="transition-premium mt-3 inline-block text-[0.875rem] font-medium text-ink underline underline-offset-4"
      >
        Teach it something
      </Link>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-[0.875rem] text-ink-3">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-[0.875rem] break-words text-ink",
          mono && "font-mono text-[0.8125rem]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access is refused in some browsers and on insecure origins.
      // Selecting the text is the honest fallback, so say that.
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        variant="secondary"
        size="md"
        onClick={() => void copy()}
        className="min-w-[8.5rem]"
        leftIcon={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
      <p
        className={cn("text-[0.8125rem] text-ink-3", !failed && "sr-only")}
        role={failed ? "alert" : undefined}
      >
        {failed ? "Your browser blocked the clipboard. Select the link and copy it." : "Ready to share"}
      </p>
    </div>
  );
}
