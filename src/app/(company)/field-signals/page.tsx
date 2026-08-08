"use client";

import { TopNav } from "@/components/layout/TopNav";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api/client";
import type { FieldSignal, Playbook } from "@/types/ui";
import { IconLayers, IconLightbulb } from "@/components/icons";

import { useEffect, useState } from "react";

export default function FieldSignalsPage() {
  const [signals, setSignals] = useState<FieldSignal[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([api.getFieldSignals(), api.getPlaybooks()]);
      setSignals(s);
      setPlaybooks(p);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingState className="flex-1" label="Loading field signals" />;

  return (
    <>
      <TopNav
        title="Field Signals"
        subtitle="Repeated customer learnings become product intelligence"
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl space-y-8 px-5 py-8 sm:px-8">
          <section className="space-y-3">
            {signals.map((s) => (
              <div
                key={s.id}
                className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={s.type === "issue" ? "warning" : "info"}>{s.type}</Badge>
                  <span className="font-mono text-sm text-fg-muted">
                    {s.accountCount} account{s.accountCount === 1 ? "" : "s"}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-semibold text-fg">{s.title}</h3>
                {s.recommendation && (
                  <div className="mt-3 flex gap-2 rounded-[var(--radius-md)] border border-brand-border bg-brand-dim px-3 py-2.5">
                    <IconLightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand">
                        Product opportunity
                      </p>
                      <p className="mt-1 text-sm text-fg">{s.recommendation}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <IconLayers className="h-4 w-4 text-fg-faint" />
              <h2 className="text-sm font-semibold text-fg">Reusable patterns</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {playbooks.map((pb) => (
                <div
                  key={pb.id}
                  className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-4 shadow-sm"
                >
                  <p className="text-sm font-semibold text-fg">{pb.title}</p>
                  <p className="mt-1 font-mono text-xs text-fg-muted">
                    Used by {pb.usedBy} customers
                  </p>
                  <ul className="mt-3 space-y-1">
                    {pb.includes.map((i) => (
                      <li key={i} className="text-xs text-fg-secondary">
                        · {i}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
