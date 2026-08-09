"use client";

import { IconDeploy, IconStatusDot } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api/client";
import type { AccountRoom } from "@/types/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

function stageLabel(s: string) {
  return s.replace(/_/g, " ");
}

export default function DeploymentsPage() {
  const [accounts, setAccounts] = useState<AccountRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listAccounts();
        // Unique by id
        const map = new Map<string, AccountRoom>();
        for (const a of list) map.set(a.id, a);
        if (!cancelled) setAccounts([...map.values()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load deployments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingState className="flex-1" label="Loading deployments" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-bg-elevated px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg">
              <IconDeploy size={18} />
            </span>
            <div>
              <p className="mono-ts uppercase tracking-[0.14em]">Deployments</p>
              <h1 className="text-lg font-semibold tracking-tight text-fg">
                Account environments
              </h1>
            </div>
          </div>
          <Link href="/knowledge">
            <Button size="sm" variant="secondary">
              Knowledge
            </Button>
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">
        {error && (
          <p className="mb-4 rounded-[var(--radius-md)] border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {accounts.length === 0 ? (
          <div className="surface-elevated mx-auto max-w-lg rounded-[var(--radius-xl)] px-6 py-12 text-center">
            <p className="text-sm text-fg-muted">No account deployments yet.</p>
            <p className="mt-1 text-xs text-fg-faint">
              Deployments appear when accounts reach implementation, staging, or production.
            </p>
            <Link href="/accounts/pr_globex" className="mt-4 inline-flex">
              <Button size="sm">Open sample account room</Button>
            </Link>
          </div>
        ) : (
          <div className="mx-auto grid max-w-4xl gap-3">
            {accounts.map((a) => {
              const dep = a.deployment;
              const openBlockers = a.blockers?.filter((b) => b.status === "open").length || 0;
              return (
                <Link
                  key={a.id}
                  href={`/accounts/${a.prospectId || a.id}`}
                  className="surface-elevated block rounded-[var(--radius-xl)] p-4 transition-premium hover:border-border-strong"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-fg">{a.name}</h2>
                        <Badge tone="accent">{stageLabel(a.stage)}</Badge>
                        {openBlockers > 0 && (
                          <Badge tone="danger">{openBlockers} blocked</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-fg-muted">{a.atlasStatus}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <IconStatusDot
                          tone={
                            dep?.status === "production"
                              ? "success"
                              : dep?.status === "degraded"
                                ? "warning"
                                : "info"
                          }
                        />
                        <span className="font-mono text-xs capitalize text-fg">
                          {dep?.status?.replace(/_/g, " ") || "not started"}
                        </span>
                      </div>
                      <p className="mono-ts mt-1">
                        {dep?.environment || "—"}
                        {dep?.version ? ` · ${dep.version}` : ""}
                      </p>
                    </div>
                  </div>

                  {dep?.checks && dep.checks.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {dep.checks.map((c) => (
                        <li
                          key={c.label}
                          className="rounded-md border border-border bg-bg px-2 py-1 font-mono text-[10px] text-fg-muted"
                        >
                          {c.label}: {c.status}
                        </li>
                      ))}
                    </ul>
                  )}

                  {a.nextAction && (
                    <p className="mt-3 text-xs text-fg-secondary">
                      Next: {a.nextAction}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
