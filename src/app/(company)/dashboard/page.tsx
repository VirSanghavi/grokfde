"use client";

import { IconStatusDot } from "@/components/icons/DottedIcon";
import { ActivityStream } from "@/components/ops/ActivityStream";
import { IngestionPipeline } from "@/components/ops/IngestionPipeline";
import { McpInspectorPanel } from "@/components/ops/McpInspectorPanel";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { api } from "@/lib/api/client";
import type { FdeDashboardData } from "@/types/ui";
import { useEffect, useState } from "react";

function MetricSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="surface-elevated h-[72px] rounded-[var(--radius-lg)] p-3">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton mt-3 h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<FdeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { openDrawer } = useWorkspace();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getDashboard();
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const m = data?.metrics;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-bg-elevated px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-ts uppercase tracking-[0.14em]">Operations center</p>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-fg sm:text-xl">
              Forward-deployed runtime
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border diag-success px-2 py-1 text-[11px] font-medium">
              <IconStatusDot tone="success" />
              Ingestion healthy
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border diag-info px-2 py-1 text-[11px] font-medium">
              <IconStatusDot tone="info" />
              LLM streaming
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border diag-warning px-2 py-1 text-[11px] font-medium">
              <IconStatusDot tone="warning" />
              {m?.needsHelp ?? 0} HITL
            </span>
          </div>
        </div>

        <div className="mt-3">
          {loading ? (
            <MetricSkeleton />
          ) : (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                {
                  label: "Active accounts",
                  value: m?.activeAccounts ?? m?.activeProspects ?? 0,
                  tone: "success" as const,
                },
                {
                  label: "Conversations",
                  value: m?.conversations ?? 0,
                  tone: "info" as const,
                },
                {
                  label: "Knowledge sources",
                  value: data?.agent.knowledgeSourceCount ?? 0,
                  tone: "success" as const,
                },
                {
                  label: "MCP tools",
                  value: data?.agent.mcpToolCount ?? 0,
                  tone: "info" as const,
                },
              ].map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() =>
                    openDrawer({
                      title: card.label,
                      subtitle: "Operational metric",
                      kind: "generic",
                      meta: { value: card.value },
                    })
                  }
                  className="surface-elevated rounded-[var(--radius-lg)] p-3 text-left transition-premium hover:border-border-strong"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-fg-muted">{card.label}</p>
                    <IconStatusDot tone={card.tone} />
                  </div>
                  <p className="mt-2 font-mono text-2xl tabular tracking-tight text-fg">
                    {card.value}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="min-h-0 min-w-0">
            <IngestionPipeline />
          </div>
          <div className="min-h-0 min-w-0">
            <ActivityStream />
          </div>
          <div className="surface-elevated hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-xl)] xl:flex">
            <header className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight text-fg">MCP inspector</h2>
              <p className="mono-ts">Pinned deep-dive panel</p>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
              <McpInspectorPanel
                tokenUsed={84210}
                tokenMax={128000}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
