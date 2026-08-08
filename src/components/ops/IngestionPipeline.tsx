"use client";

import { IconKnowledge, IconStatusDot } from "@/components/icons";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { api } from "@/lib/api/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Company, KnowledgeSource } from "@/types/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function kindOf(s: KnowledgeSource): string {
  if (s.type === "mcp") return "MCP";
  if (s.type === "url") return "URL";
  if (s.type === "file") {
    const t = s.title.toLowerCase();
    if (t.endsWith(".pdf")) return "PDF";
    if (t.endsWith(".csv")) return "CSV";
    if (t.endsWith(".md") || t.endsWith(".markdown")) return "MD";
    return "FILE";
  }
  return "TEXT";
}

function statusTone(status: KnowledgeSource["status"]): "success" | "info" | "warning" | "idle" {
  if (status === "ready") return "success";
  if (status === "processing") return "info";
  if (status === "error") return "warning";
  return "idle";
}

function progressOf(status: KnowledgeSource["status"]): number {
  if (status === "ready") return 100;
  if (status === "processing") return 62;
  if (status === "error") return 100;
  return 8;
}

function labelOf(s: KnowledgeSource): string {
  if (s.status === "ready") return "Indexed · ready for retrieval";
  if (s.status === "processing") return "Ingesting · building embeddings…";
  if (s.status === "error") return "Ingestion error · retry from Knowledge";
  return "Queued";
}

/** Build coverage rows from real sources + company summary topics. */
function buildCoverage(sources: KnowledgeSource[], company: Company | null) {
  const titles = sources.map((s) => s.title.toLowerCase());
  const has = (...keys: string[]) =>
    titles.some((t) => keys.some((k) => t.includes(k))) ||
    sources.some((s) => keys.some((k) => (s.sourceUrl || "").toLowerCase().includes(k)));

  const summary = company?.knowledgeSummary;
  const topics: { topic: string; keys: string[]; fromSummary?: boolean }[] = [
    { topic: "Core product capabilities", keys: ["product", "overview", "capability", "features"] },
    { topic: "API authentication & webhooks", keys: ["api", "auth", "webhook", "reference"] },
    { topic: "Deployment & infrastructure", keys: ["deploy", "kubernetes", "aws", "infra", "architecture"] },
    { topic: "Pricing & packaging", keys: ["pricing", "price", "packaging", "plan"] },
    { topic: "Security & compliance", keys: ["security", "soc", "compliance", "hipaa", "baa"] },
  ];

  if (summary?.coreUseCases?.length) {
    for (const uc of summary.coreUseCases.slice(0, 3)) {
      topics.push({ topic: uc, keys: [uc.toLowerCase()], fromSummary: true });
    }
  }

  const readyRatio =
    sources.length === 0 ? 0 : sources.filter((s) => s.status === "ready").length / sources.length;

  return topics.map((t) => {
    const covered = has(...t.keys) || Boolean(t.fromSummary && summary);
    const confidence = covered
      ? Math.round(70 + readyRatio * 28 + (t.fromSummary ? 2 : 0))
      : sources.length === 0
        ? 0
        : Math.round(8 + readyRatio * 12);
    return {
      topic: t.topic,
      confidence: Math.min(99, confidence),
      gap: !covered || confidence < 40,
    };
  });
}

export function IngestionPipeline() {
  const { openDrawer } = useWorkspace();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [ks, co] = await Promise.all([
          api.getKnowledge().catch(() => [] as KnowledgeSource[]),
          api.getCompany().catch(() => null),
        ]);
        if (cancelled) return;
        setSources(ks);
        setCompany(co);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load knowledge");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const coverage = useMemo(() => buildCoverage(sources, company), [sources, company]);
  const gaps = coverage.filter((c) => c.gap).length;
  const sorted = useMemo(
    () =>
      [...sources].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [sources],
  );

  return (
    <section className="surface-elevated flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)]">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg">
            <IconKnowledge size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-fg">Knowledge matrix</h2>
            <p className="mono-ts">
              {loading
                ? "Loading sources…"
                : `${sources.length} source${sources.length === 1 ? "" : "s"} · live`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/knowledge"
            className="mono-ts rounded-md border border-border px-2 py-1 transition-premium hover:bg-bg-hover"
          >
            Manage
          </Link>
          <button
            type="button"
            onClick={() =>
              openDrawer({
                title: "Vector coverage detail",
                subtitle: `${sources.length} sources · ${gaps} coverage gaps`,
                kind: "generic",
                meta: {
                  sources: sources.map((s) => ({
                    id: s.id,
                    title: s.title,
                    type: s.type,
                    status: s.status,
                  })),
                  coverage,
                },
              })
            }
            className="mono-ts rounded-md border border-border px-2 py-1 transition-premium hover:bg-bg-hover"
          >
            Inspect
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4">
        {error && (
          <p className="rounded-[var(--radius-md)] border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div>
          <p className="mono-ts mb-2 uppercase tracking-[0.12em]">Sync stream</p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-[var(--radius-lg)]" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-bg px-4 py-8 text-center">
              <p className="text-sm text-fg-muted">No knowledge sources yet.</p>
              <Link
                href="/knowledge"
                className="mt-3 inline-flex text-xs font-medium text-brand hover:text-fg"
              >
                Upload docs, paste text, or connect MCP →
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {sorted.map((row) => {
                const tone = statusTone(row.status);
                const progress = progressOf(row.status);
                return (
                  <li
                    key={row.id}
                    className="rounded-[var(--radius-lg)] border border-border bg-bg px-3 py-2.5 transition-premium hover:border-border-strong"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <IconStatusDot
                          tone={
                            tone === "success"
                              ? "success"
                              : tone === "info"
                                ? "info"
                                : tone === "warning"
                                  ? "warning"
                                  : "idle"
                          }
                        />
                        <code className="truncate font-mono text-[12px] text-fg">{row.title}</code>
                        <span className="mono-ts shrink-0 rounded border border-border px-1">
                          {kindOf(row)}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] tabular text-fg-muted">
                        {progress}%
                      </span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-active">
                      <div
                        className={cn(
                          "h-full rounded-full transition-premium",
                          tone === "success"
                            ? "bg-success"
                            : tone === "info"
                              ? "bg-info"
                              : tone === "warning"
                                ? "bg-warning"
                                : "bg-fg-faint",
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-1.5 font-mono text-[11px] text-fg-muted">
                      [{labelOf(row)}] · {formatRelativeTime(row.createdAt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="mono-ts mb-2 uppercase tracking-[0.12em]">Vector coverage map</p>
          <div className="grid grid-cols-1 gap-1.5">
            {coverage.map((c) => (
              <div
                key={c.topic}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2",
                  c.gap ? "border-warning/25 bg-warning-dim" : "border-border bg-bg",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-fg">{c.topic}</p>
                  {c.gap && (
                    <p className="mt-0.5 font-mono text-[10px] text-warning">
                      {sources.length === 0
                        ? "No sources ingested yet"
                        : "Missing documentation depth"}
                    </p>
                  )}
                </div>
                <div className="flex w-24 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-active">
                    <div
                      className={cn("h-full rounded-full", c.gap ? "bg-warning" : "bg-success")}
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
