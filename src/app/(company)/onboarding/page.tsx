"use client";

import { Button } from "@/components/ui/Button";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { CompanyKnowledgeSummary } from "@/types/ui";
import { FileText, Globe, Link2, Server, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const LEARNING_STEPS = [
  "Uploading...",
  "Reading...",
  "Understanding...",
  "Extracting technical knowledge...",
  "Ready.",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("Grok FDE");
  const [agentName, setAgentName] = useState("Atlas");
  const [pasteTitle, setPasteTitle] = useState("Product Overview");
  const [pasteContent, setPasteContent] = useState(
    "Grok FDE gives every prospect a persistent AI Forward-Deployed Engineer across chat, email, and voice. Companies train once on docs and MCP tools. Memory follows the prospect."
  );
  const [learningIndex, setLearningIndex] = useState(0);
  const [summary, setSummary] = useState<CompanyKnowledgeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourcesAdded, setSourcesAdded] = useState(0);
  const [teachMode, setTeachMode] = useState<"upload" | "paste" | "url" | "mcp" | null>(null);
  const [url, setUrl] = useState("https://docs.example.com");
  const [mcpLabel, setMcpLabel] = useState("Internal Platform");
  const [mcpUrl, setMcpUrl] = useState("https://mcp.example.com");

  async function createCompany() {
    setBusy(true);
    try {
      await api.createCompany({ name: companyName, agentName });
      setStep(3);
    } finally {
      setBusy(false);
    }
  }

  async function addPaste() {
    setBusy(true);
    try {
      await api.pasteKnowledge({ title: pasteTitle, content: pasteContent });
      setSourcesAdded((n) => n + 1);
      setTeachMode(null);
    } finally {
      setBusy(false);
    }
  }

  async function addUpload(files: File[]) {
    setBusy(true);
    try {
      for (const file of files) {
        await api.uploadKnowledge({ title: file.name, type: "file" });
        setSourcesAdded((n) => n + 1);
      }
      setTeachMode(null);
    } finally {
      setBusy(false);
    }
  }

  async function addUrl() {
    setBusy(true);
    try {
      await api.addUrlKnowledge({ url });
      setSourcesAdded((n) => n + 1);
      setTeachMode(null);
    } finally {
      setBusy(false);
    }
  }

  async function addMcp() {
    setBusy(true);
    try {
      await api.connectMcp({ label: mcpLabel, serverUrl: mcpUrl, allowWrite: false });
      setSourcesAdded((n) => n + 1);
      setTeachMode(null);
    } finally {
      setBusy(false);
    }
  }

  async function runLearning() {
    setStep(4);
    setLearningIndex(0);
    for (let i = 0; i < LEARNING_STEPS.length; i++) {
      setLearningIndex(i);
      await new Promise((r) => setTimeout(r, 700));
    }
    const company = await api.completeOnboarding();
    setSummary(
      company.knowledgeSummary ?? {
        whatYouSell: "AI infrastructure platform",
        primaryBuyers: ["ML engineering teams", "Infrastructure teams"],
        coreUseCases: ["GPU orchestration", "Inference workloads", "Multi-cloud routing"],
        commonObjections: ["Migration effort", "Security", "Cost predictability"],
      }
    );
    setStep(5);
  }

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10 sm:px-8">
        <div className="mb-10">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-accent font-mono text-[10px] font-semibold text-accent-fg">
              FDE
            </span>
            <span className="text-sm font-semibold text-fg">Grok FDE</span>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">
            Onboarding · step {step} of 5
          </p>
          <div className="mt-4 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  n <= step ? "bg-accent" : "bg-bg-active"
                )}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="animate-in space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-fg">
                What&apos;s your company?
              </h1>
              <p className="mt-2 text-sm text-fg-muted">
                This becomes the identity your FDE represents.
              </p>
            </div>
            <Input
              label="Company name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme"
              autoFocus
            />
            <Button
              className="w-full"
              size="lg"
              disabled={!companyName.trim()}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-fg">Name your FDE</h1>
              <p className="mt-2 text-sm text-fg-muted">
                Prospects will talk to this engineer across chat, email, and calls.
              </p>
            </div>
            <Input
              label="Agent name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Atlas"
              autoFocus
            />
            <Input
              label="Voice (placeholder)"
              value="Professional · clear · technical"
              disabled
              hint="Voice selection wires up when Person B's voice endpoint is live."
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                size="lg"
                loading={busy}
                disabled={!agentName.trim()}
                onClick={createCompany}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-fg">
                Teach {agentName}
              </h1>
              <p className="mt-2 text-sm text-fg-muted">
                Upload everything a forward-deployed engineer would need to know.
              </p>
            </div>

            {!teachMode && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "upload" as const, icon: Upload, label: "Upload files" },
                  { id: "paste" as const, icon: FileText, label: "Paste text" },
                  { id: "url" as const, icon: Globe, label: "Add URL" },
                  { id: "mcp" as const, icon: Server, label: "Connect MCP" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTeachMode(opt.id)}
                    className="flex flex-col items-start gap-3 rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-4 text-left shadow-sm transition-colors hover:bg-bg-hover"
                  >
                    <opt.icon className="h-5 w-5 text-brand" />
                    <span className="text-sm font-medium text-fg">{opt.label}</span>
                  </button>
                ))}
              </div>
            )}

            {teachMode === "upload" && (
              <div className="space-y-4">
                <FileDropzone onFiles={addUpload} />
                <Button variant="ghost" onClick={() => setTeachMode(null)}>
                  Back
                </Button>
              </div>
            )}

            {teachMode === "paste" && (
              <div className="space-y-4">
                <Input
                  label="Title"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                />
                <Textarea
                  label="Content"
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  className="min-h-[180px]"
                />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setTeachMode(null)}>
                    Back
                  </Button>
                  <Button loading={busy} onClick={addPaste} disabled={!pasteContent.trim()}>
                    Add knowledge
                  </Button>
                </div>
              </div>
            )}

            {teachMode === "url" && (
              <div className="space-y-4">
                <Input
                  label="URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setTeachMode(null)}>
                    Back
                  </Button>
                  <Button loading={busy} onClick={addUrl}>
                    Add URL
                  </Button>
                </div>
              </div>
            )}

            {teachMode === "mcp" && (
              <div className="space-y-4">
                <Input
                  label="Name"
                  value={mcpLabel}
                  onChange={(e) => setMcpLabel(e.target.value)}
                />
                <Input
                  label="Server URL"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setTeachMode(null)}>
                    Back
                  </Button>
                  <Button loading={busy} onClick={addMcp}>
                    Connect MCP
                  </Button>
                </div>
              </div>
            )}

            {sourcesAdded > 0 && !teachMode && (
              <p className="flex items-center gap-2 text-sm text-success">
                <Link2 className="h-4 w-4" />
                {sourcesAdded} source{sourcesAdded === 1 ? "" : "s"} added
              </p>
            )}

            {!teachMode && (
              <Button
                className="w-full"
                size="lg"
                onClick={runLearning}
                disabled={sourcesAdded === 0}
              >
                Continue
              </Button>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-1 flex-col items-center justify-center animate-in py-20 text-center">
            <div className="mb-8 h-12 w-12 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
            <p className="font-mono text-sm text-brand">{LEARNING_STEPS[learningIndex]}</p>
            <ul className="mt-8 space-y-2 text-left">
              {LEARNING_STEPS.map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    "font-mono text-xs",
                    i < learningIndex && "text-fg-faint line-through",
                    i === learningIndex && "text-fg",
                    i > learningIndex && "text-fg-faint"
                  )}
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 5 && summary && (
          <div className="animate-in space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-fg">
                {agentName} understands {companyName}
              </h1>
              <p className="mt-2 text-sm text-fg-muted">
                Inferred from your knowledge. You can refine this anytime.
              </p>
            </div>

            <div className="space-y-4 rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
              <Block label="What you sell" value={summary.whatYouSell} />
              <Block label="Primary buyers" value={summary.primaryBuyers.join(" · ")} />
              <Block label="Core use cases" value={summary.coreUseCases.join(" · ")} />
              <Block label="Common objections" value={summary.commonObjections.join(" · ")} />
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => router.push("/dashboard")}
            >
              Launch FDE
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">{label}</p>
      <p className="mt-1 text-sm text-fg-secondary">{value}</p>
    </div>
  );
}
