"use client";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { CompanyKnowledgeSummary } from "@/types/ui";
import { IconFile, IconGlobe, IconLink, IconServer, IconUpload } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

const TOTAL_STEPS = 5;

const LEARNING_STEPS = [
  "Uploading sources",
  "Reading materials",
  "Building company model",
  "Extracting technical knowledge",
  "Ready",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [agentName, setAgentName] = useState("Atlas");
  const [pasteTitle, setPasteTitle] = useState("Product overview");
  const [pasteContent, setPasteContent] = useState("");
  const [learningIndex, setLearningIndex] = useState(0);
  const [summary, setSummary] = useState<CompanyKnowledgeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourcesAdded, setSourcesAdded] = useState(0);
  const [teachMode, setTeachMode] = useState<"upload" | "paste" | "url" | "mcp" | null>(null);
  const [url, setUrl] = useState("");
  const [mcpLabel, setMcpLabel] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setError(null);
  }, [step, teachMode]);

  async function createCompany() {
    setBusy(true);
    setError(null);
    try {
      await api.createCompany({ name: companyName.trim(), agentName: agentName.trim() });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create company. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addPaste() {
    setBusy(true);
    setError(null);
    try {
      await api.pasteKnowledge({ title: pasteTitle.trim() || "Untitled", content: pasteContent });
      setSourcesAdded((n) => n + 1);
      setPasteContent("");
      setTeachMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add knowledge.");
    } finally {
      setBusy(false);
    }
  }

  async function addUpload(files: File[]) {
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const content = await file.text().catch(() => "");
        await api.uploadKnowledge({
          title: file.name,
          type: "file",
          file,
          content: content || undefined,
        });
        setSourcesAdded((n) => n + 1);
      }
      setTeachMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addUrl() {
    setBusy(true);
    setError(null);
    try {
      await api.addUrlKnowledge({ url: url.trim() });
      setSourcesAdded((n) => n + 1);
      setUrl("");
      setTeachMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add URL.");
    } finally {
      setBusy(false);
    }
  }

  async function addMcp() {
    setBusy(true);
    setError(null);
    try {
      await api.connectMcp({
        label: mcpLabel.trim() || "MCP server",
        serverUrl: mcpUrl.trim(),
        allowWrite: false,
      });
      setSourcesAdded((n) => n + 1);
      setMcpLabel("");
      setMcpUrl("");
      setTeachMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect MCP.");
    } finally {
      setBusy(false);
    }
  }

  async function runLearning() {
    setStep(4);
    setLearningIndex(0);
    setError(null);
    try {
      for (let i = 0; i < LEARNING_STEPS.length; i++) {
        setLearningIndex(i);
        await new Promise((r) => setTimeout(r, 650));
      }
      const company = await api.completeOnboarding();
      setSummary(
        company.knowledgeSummary ?? {
          whatYouSell: "Your product",
          primaryBuyers: ["Technical buyers"],
          coreUseCases: ["Primary use cases from your sources"],
          commonObjections: ["To be refined from more knowledge"],
        },
      );
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed. Try again.");
      setStep(3);
    }
  }

  function onCompanySubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;
    setStep(2);
  }

  function onAgentSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agentName.trim() || busy) return;
    void createCompany();
  }

  return (
    <div className="min-h-dvh bg-bg text-fg antialiased">
      <header className="mx-auto flex w-full max-w-[720px] items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8">
        <Link
          href="/"
          className="text-[16px] font-semibold tracking-[-0.02em] text-fg transition-opacity hover:opacity-70"
        >
          Grok FDE
        </Link>
        <Link
          href="/login"
          className="rounded-full px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          Sign in
        </Link>
      </header>

      <div
        ref={mainRef}
        className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-[480px] flex-col px-5 pb-16 pt-10 sm:px-6 sm:pt-12"
      >
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-muted">
              {step <= 3 ? "Set up" : step === 4 ? "Training" : "Ready"}
            </p>
            <p className="tabular-nums text-[12px] font-medium text-fg-faint">
              {Math.min(step, TOTAL_STEPS)} / {TOTAL_STEPS}
            </p>
          </div>
          <div
            className="mt-3 flex gap-1.5"
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-label={`Step ${step} of ${TOTAL_STEPS}`}
          >
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                className={cn(
                  "h-[3px] flex-1 rounded-full transition-[background-color] duration-300",
                  n < step && "bg-fg/45",
                  n === step && "bg-fg",
                  n > step && "bg-border-strong",
                )}
              />
            ))}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-danger/20 bg-danger-dim px-4 py-3 text-[13.5px] leading-snug text-danger"
          >
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 font-medium underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {step === 1 && (
          <StepFrame
            title="What company are you deploying for?"
            body="This becomes the identity your FDE represents to every prospect."
          >
            <form onSubmit={onCompanySubmit} className="space-y-5">
              <Field
                label="Company name"
                htmlFor="company-name"
                autoFocus
                value={companyName}
                onChange={setCompanyName}
                placeholder="Acme Infrastructure"
                autoComplete="organization"
              />
              <PrimaryButton type="submit" disabled={!companyName.trim()}>
                Continue
              </PrimaryButton>
            </form>
          </StepFrame>
        )}

        {step === 2 && (
          <StepFrame
            title="Name your engineer"
            body="Prospects meet this person in chat, on video calls, and later in Slack."
          >
            <form onSubmit={onAgentSubmit} className="space-y-5">
              <Field
                label="FDE name"
                htmlFor="agent-name"
                autoFocus
                value={agentName}
                onChange={setAgentName}
                placeholder="Atlas"
                autoComplete="off"
              />
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Voice is calibrated for clear technical conversation. You can refine tone later.
              </p>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <GhostButton type="button" onClick={() => setStep(1)}>
                  Back
                </GhostButton>
                <PrimaryButton
                  type="submit"
                  className="sm:flex-1"
                  disabled={!agentName.trim() || busy}
                  loading={busy}
                >
                  Continue
                </PrimaryButton>
              </div>
            </form>
          </StepFrame>
        )}

        {step === 3 && (
          <StepFrame
            title={`Teach ${agentName || "your FDE"}`}
            body="Add what a real forward-deployed engineer would study before a customer call."
          >
            {!teachMode && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        id: "upload" as const,
                        icon: IconUpload,
                        label: "Upload files",
                        hint: "PDFs, docs, markdown",
                      },
                      {
                        id: "paste" as const,
                        icon: IconFile,
                        label: "Paste text",
                        hint: "Specs, pricing, FAQs",
                      },
                      {
                        id: "url" as const,
                        icon: IconGlobe,
                        label: "Add a URL",
                        hint: "Docs site or page",
                      },
                      {
                        id: "mcp" as const,
                        icon: IconServer,
                        label: "Connect MCP",
                        hint: "Live tools and APIs",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTeachMode(opt.id)}
                      className={cn(
                        "group flex min-h-[84px] flex-col items-start gap-2.5 rounded-2xl border border-border bg-bg-elevated p-4 text-left shadow-sm",
                        "transition-[background-color,border-color,box-shadow] duration-150",
                        "hover:border-border-strong hover:bg-bg-hover",
                        "active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20",
                      )}
                    >
                      <opt.icon className="h-[18px] w-[18px] text-fg-secondary" aria-hidden />
                      <span>
                        <span className="block text-[14px] font-medium tracking-[-0.01em] text-fg">
                          {opt.label}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-fg-muted">{opt.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {sourcesAdded > 0 && (
                  <p className="flex items-center gap-2 text-[13.5px] text-fg-secondary">
                    <IconLink className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                    <span>
                      {sourcesAdded} source{sourcesAdded === 1 ? "" : "s"} added
                    </span>
                  </p>
                )}

                <PrimaryButton
                  type="button"
                  onClick={() => void runLearning()}
                  disabled={sourcesAdded === 0}
                >
                  {sourcesAdded === 0 ? "Add at least one source" : "Train and continue"}
                </PrimaryButton>
                <p className="text-center text-[12.5px] text-fg-faint">
                  You can add more knowledge anytime from the dashboard.
                </p>
              </div>
            )}

            {teachMode === "upload" && (
              <div className="space-y-4">
                <FileDropzone onFiles={(files) => void addUpload(files)} />
                <GhostButton type="button" onClick={() => setTeachMode(null)} disabled={busy}>
                  Back to sources
                </GhostButton>
              </div>
            )}

            {teachMode === "paste" && (
              <div className="space-y-4">
                <Field
                  label="Title"
                  htmlFor="paste-title"
                  value={pasteTitle}
                  onChange={setPasteTitle}
                  placeholder="Product overview"
                />
                <label className="flex w-full flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-fg-secondary">Content</span>
                  <textarea
                    id="paste-content"
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    rows={7}
                    placeholder="Paste pricing, architecture notes, security FAQ…"
                    className={fieldClassName("min-h-[140px] resize-y py-3")}
                    autoFocus
                  />
                </label>
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <GhostButton type="button" onClick={() => setTeachMode(null)} disabled={busy}>
                    Back
                  </GhostButton>
                  <PrimaryButton
                    type="button"
                    className="sm:flex-1"
                    loading={busy}
                    disabled={!pasteContent.trim()}
                    onClick={() => void addPaste()}
                  >
                    Add knowledge
                  </PrimaryButton>
                </div>
              </div>
            )}

            {teachMode === "url" && (
              <div className="space-y-4">
                <Field
                  label="Documentation URL"
                  htmlFor="knowledge-url"
                  value={url}
                  onChange={setUrl}
                  placeholder="https://docs.yourcompany.com"
                  type="url"
                  autoFocus
                  autoComplete="url"
                />
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <GhostButton type="button" onClick={() => setTeachMode(null)} disabled={busy}>
                    Back
                  </GhostButton>
                  <PrimaryButton
                    type="button"
                    className="sm:flex-1"
                    loading={busy}
                    disabled={!url.trim()}
                    onClick={() => void addUrl()}
                  >
                    Add URL
                  </PrimaryButton>
                </div>
              </div>
            )}

            {teachMode === "mcp" && (
              <div className="space-y-4">
                <Field
                  label="Server name"
                  htmlFor="mcp-label"
                  value={mcpLabel}
                  onChange={setMcpLabel}
                  placeholder="Internal platform"
                  autoFocus
                />
                <Field
                  label="MCP server URL"
                  htmlFor="mcp-url"
                  value={mcpUrl}
                  onChange={setMcpUrl}
                  placeholder="https://mcp.yourcompany.com"
                  type="url"
                  autoComplete="url"
                />
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <GhostButton type="button" onClick={() => setTeachMode(null)} disabled={busy}>
                    Back
                  </GhostButton>
                  <PrimaryButton
                    type="button"
                    className="sm:flex-1"
                    loading={busy}
                    disabled={!mcpUrl.trim()}
                    onClick={() => void addMcp()}
                  >
                    Connect MCP
                  </PrimaryButton>
                </div>
              </div>
            )}
          </StepFrame>
        )}

        {step === 4 && (
          <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
            <div
              className="mb-7 h-10 w-10 animate-spin rounded-full border-2 border-border-strong border-t-fg"
              aria-hidden
            />
            <p className="text-[clamp(1.25rem,4vw,1.5rem)] font-semibold tracking-[-0.03em] text-fg">
              {LEARNING_STEPS[learningIndex]}
            </p>
            <p className="mt-2.5 max-w-xs text-[14px] leading-relaxed text-fg-muted">
              Building a durable model of {companyName || "your company"} for{" "}
              {agentName || "your FDE"}.
            </p>
            <ul className="mt-8 w-full max-w-xs space-y-2 text-left" aria-live="polite">
              {LEARNING_STEPS.map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    "flex items-center gap-3 text-[13.5px] tracking-[-0.01em] transition-colors duration-200",
                    i < learningIndex && "text-fg-faint",
                    i === learningIndex && "text-fg font-medium",
                    i > learningIndex && "text-fg-faint/70",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                      i < learningIndex && "border-fg/25 text-fg/50",
                      i === learningIndex && "border-fg/40 text-fg",
                      i > learningIndex && "border-border-strong text-transparent",
                    )}
                    aria-hidden
                  >
                    {i < learningIndex ? "✓" : ""}
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 5 && summary && (
          <StepFrame
            title={`${agentName} understands ${companyName}`}
            body="Inferred from your sources. Refine anytime from knowledge in the dashboard."
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-sm">
              <SummaryRow label="What you sell" value={summary.whatYouSell} />
              <SummaryRow label="Primary buyers" value={summary.primaryBuyers.join(" · ")} />
              <SummaryRow label="Core use cases" value={summary.coreUseCases.join(" · ")} />
              <SummaryRow
                label="Common objections"
                value={summary.commonObjections.join(" · ")}
                last
              />
            </div>
            <PrimaryButton type="button" onClick={() => router.push("/dashboard")}>
              Open operations
            </PrimaryButton>
            <p className="text-center text-[13px] text-fg-muted">
              Share your public FDE link when you are ready. Prospects can chat or FaceTime{" "}
              {agentName}.
            </p>
          </StepFrame>
        )}
      </div>
    </div>
  );
}

function StepFrame({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-7 sm:mb-8">
        <h1 className="text-[clamp(1.65rem,5vw,1.95rem)] font-semibold leading-[1.15] tracking-[-0.035em] text-fg text-balance">
          {title}
        </h1>
        <p className="mt-2.5 max-w-[36ch] text-[15px] leading-[1.55] text-fg-muted">{body}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function fieldClassName(extra?: string) {
  return cn(
    "w-full rounded-xl border border-border bg-bg-elevated px-3.5 text-[15px] text-fg",
    "placeholder:text-fg-faint shadow-sm",
    "transition-[border-color,box-shadow] duration-150",
    "hover:border-border-strong",
    "focus:border-fg/25 focus:outline-none focus:ring-2 focus:ring-fg/10",
    "disabled:opacity-50",
    extra,
  );
}

function Field({
  label,
  htmlFor,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  autoComplete,
}: {
  label: string;
  htmlFor: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-1.5" htmlFor={htmlFor}>
      <span className="text-[13px] font-medium text-fg-secondary">{label}</span>
      <input
        id={htmlFor}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className={fieldClassName("h-11")}
      />
    </label>
  );
}

function PrimaryButton({
  children,
  className,
  loading,
  disabled,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center rounded-full bg-fg px-6",
        "text-[14.5px] font-semibold tracking-[-0.01em] text-accent-fg",
        "transition-[transform,opacity,background-color] duration-150",
        "hover:bg-fg/90 active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white"
          aria-hidden
        />
      ) : (
        children
      )}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 min-w-[5.5rem] items-center justify-center rounded-full border border-border bg-bg-elevated px-5",
        "text-[14px] font-medium text-fg-secondary shadow-sm",
        "transition-[background-color,border-color] duration-150",
        "hover:border-border-strong hover:bg-bg-hover hover:text-fg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/15",
        "disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function SummaryRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={cn("px-4 py-3.5", !last && "border-b border-border")}>
      <p className="text-[11.5px] font-medium tracking-[-0.01em] text-fg-muted">{label}</p>
      <p className="mt-1 text-[14px] leading-snug tracking-[-0.01em] text-fg">{value}</p>
    </div>
  );
}
