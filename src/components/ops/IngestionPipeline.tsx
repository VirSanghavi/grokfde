"use client";

import { IconKnowledge, IconStatusDot } from "@/components/icons/DottedIcon";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { cn } from "@/lib/utils";
// cn imported from utils

const PIPELINE = [
  {
    id: "1",
    file: "enterprise-security.pdf",
    kind: "PDF",
    stage: "embeddings",
    progress: 100,
    label: "Embeddings indexed",
    tone: "success" as const,
  },
  {
    id: "2",
    file: "api-reference.md",
    kind: "MD",
    stage: "parsing",
    progress: 84,
    label: "Parsing chunks… 84%",
    tone: "info" as const,
  },
  {
    id: "3",
    file: "pricing-sheet.csv",
    kind: "CSV",
    stage: "queued",
    progress: 12,
    label: "Queued for vector sync",
    tone: "idle" as const,
  },
  {
    id: "4",
    file: "mcp://acme-platform",
    kind: "MCP",
    stage: "handshake",
    progress: 100,
    label: "MCP handshake validation: OK",
    tone: "success" as const,
  },
  {
    id: "5",
    file: "sales-playbook.md",
    kind: "MD",
    stage: "embeddings",
    progress: 61,
    label: "Generating embeddings…",
    tone: "info" as const,
  },
];

const COVERAGE = [
  { topic: "Core product capabilities", confidence: 98 },
  { topic: "API authentication & webhooks", confidence: 94 },
  { topic: "Kubernetes / AWS deployment", confidence: 91 },
  { topic: "Pricing & packaging", confidence: 88 },
  { topic: "Security & SOC2 controls", confidence: 82 },
  { topic: "Tier 3 Custom Enterprise SLA", confidence: 18, gap: true },
  { topic: "HIPAA / BAA contractual terms", confidence: 12, gap: true },
];

export function IngestionPipeline() {
  const { openDrawer } = useWorkspace();

  return (
    <section className="surface-elevated flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)]">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg">
            <IconKnowledge size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-fg">Knowledge matrix</h2>
            <p className="mono-ts">Live ingestion pipeline</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            openDrawer({
              title: "Vector coverage detail",
              subtitle: "Confidence by topic cluster",
              kind: "generic",
              meta: { sources: PIPELINE.length, gaps: 2 },
            })
          }
          className="mono-ts rounded-md border border-border px-2 py-1 transition-premium hover:bg-bg-hover"
        >
          Inspect
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4">
        <div>
          <p className="mono-ts mb-2 uppercase tracking-[0.12em]">Sync stream</p>
          <ul className="space-y-2">
            {PIPELINE.map((row) => (
              <li
                key={row.id}
                className="rounded-[var(--radius-lg)] border border-border bg-bg px-3 py-2.5 transition-premium hover:border-border-strong"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <IconStatusDot
                      tone={
                        row.tone === "success"
                          ? "success"
                          : row.tone === "info"
                            ? "info"
                            : "idle"
                      }
                    />
                    <code className="truncate font-mono text-[12px] text-fg">{row.file}</code>
                    <span className="mono-ts shrink-0 rounded border border-border px-1">
                      {row.kind}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] tabular text-fg-muted">
                    {row.progress}%
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-active">
                  <div
                    className={cn(
                      "h-full rounded-full transition-premium",
                      row.tone === "success"
                        ? "bg-success"
                        : row.tone === "info"
                          ? "bg-info"
                          : "bg-fg-faint",
                    )}
                    style={{ width: `${row.progress}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-fg-muted">[{row.label}]</p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mono-ts mb-2 uppercase tracking-[0.12em]">Vector coverage map</p>
          <div className="grid grid-cols-1 gap-1.5">
            {COVERAGE.map((c) => (
              <div
                key={c.topic}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2",
                  c.gap
                    ? "border-warning/25 bg-warning-dim"
                    : "border-border bg-bg",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-fg">{c.topic}</p>
                  {c.gap && (
                    <p className="mt-0.5 font-mono text-[10px] text-warning">
                      Missing documentation depth
                    </p>
                  )}
                </div>
                <div className="flex w-24 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-active">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        c.gap ? "bg-warning" : "bg-success",
                      )}
                      style={{ width: `${c.confidence}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[11px] tabular text-fg-muted">
                    {c.confidence}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
