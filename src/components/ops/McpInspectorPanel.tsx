"use client";

import { IconStatusDot } from "@/components/icons";
import { api } from "@/lib/api/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation, KnowledgeSource, McpServer } from "@/types/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ToolRow = {
  name: string;
  description?: string;
  serverLabel: string;
  serverId: string;
  allowWrite: boolean;
  enabled: boolean;
};

export function McpInspectorPanel({
  tokenUsed: _tokenUsed,
  tokenMax: _tokenMax,
}: {
  /** @deprecated Real token usage is not exposed; panel uses live context composition. */
  tokenUsed?: number;
  tokenMax?: number;
} = {}) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeSource[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agentName, setAgentName] = useState("Atlas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastProbe, setLastProbe] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [mcp, ks, convs, company] = await Promise.all([
          api.getMcpServers().catch(() => [] as McpServer[]),
          api.getKnowledge().catch(() => [] as KnowledgeSource[]),
          api.getConversations().catch(() => [] as Conversation[]),
          api.getCompany().catch(() => null),
        ]);
        if (cancelled) return;
        setServers(mcp);
        setKnowledge(ks);
        setConversations(convs);
        if (company) setAgentName(company.agentName);
        setLastProbe(new Date().toISOString());
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load MCP state");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const tools: ToolRow[] = useMemo(() => {
    const rows: ToolRow[] = [];
    for (const s of servers) {
      for (const t of s.tools || []) {
        rows.push({
          name: t.name,
          description: t.description,
          serverLabel: s.label,
          serverId: s.id,
          allowWrite: s.allowWrite,
          enabled: s.enabled,
        });
      }
    }
    return rows;
  }, [servers]);

  const contextParts = useMemo(() => {
    const readyKs = knowledge.filter((k) => k.status === "ready").length;
    const processing = knowledge.filter((k) => k.status === "processing").length;
    const parts = [
      { label: "System prompt", weight: 12 },
      { label: `Knowledge (${readyKs} ready)`, weight: Math.min(40, 8 + readyKs * 4) },
      {
        label: `Prospect memory (${conversations.length} threads)`,
        weight: Math.min(28, 6 + conversations.length * 3),
      },
      {
        label: `MCP tools (${tools.length})`,
        weight: Math.min(20, tools.length > 0 ? 8 + tools.length * 2 : 2),
      },
    ];
    if (processing > 0) {
      parts.push({ label: `Ingesting (${processing})`, weight: 6 });
    }
    const total = parts.reduce((n, p) => n + p.weight, 0) || 1;
    return { parts, total, pct: Math.min(100, total) };
  }, [knowledge, conversations, tools]);

  const segments = 24;
  const filled = Math.round((contextParts.pct / 100) * segments);
  const onlineServers = servers.filter((s) => s.enabled).length;

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-[var(--radius-md)] border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-fg">Context composition</p>
          <p className="font-mono text-[11px] tabular text-fg-muted">
            {loading ? "…" : `${contextParts.pct}% estimated load`}
          </p>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 flex-1 rounded-[1px] transition-premium",
                i < filled
                  ? i > segments * 0.85
                    ? "bg-warning"
                    : "bg-info"
                  : "bg-bg-active",
              )}
            />
          ))}
        </div>
        <ul className="mt-2 space-y-1">
          {contextParts.parts.map((p) => (
            <li
              key={p.label}
              className="flex justify-between gap-2 font-mono text-[10px] text-fg-muted"
            >
              <span>{p.label}</span>
              <span className="tabular">{p.weight}</span>
            </li>
          ))}
        </ul>
        <p className="mono-ts mt-2">
          Live composition for {agentName} · not a vendor token counter
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-fg">Live tool inventory</p>
          <span className="inline-flex items-center gap-1.5 rounded-md border diag-success px-2 py-0.5 text-[10px] font-medium">
            <IconStatusDot tone={tools.length ? "success" : "idle"} />
            {loading ? "…" : `${tools.length} tools · ${onlineServers} server${onlineServers === 1 ? "" : "s"}`}
          </span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : tools.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-bg px-4 py-6 text-center">
            <p className="text-sm text-fg-muted">No MCP tools connected.</p>
            <Link
              href="/knowledge"
              className="mt-2 inline-flex text-xs font-medium text-brand hover:text-fg"
            >
              Connect an MCP server →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {tools.map((tool) => (
              <li
                key={`${tool.serverId}_${tool.name}`}
                className="rounded-[var(--radius-lg)] border border-border bg-bg p-3 transition-premium hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <IconStatusDot tone={tool.enabled ? "success" : "idle"} />
                      <code className="font-mono text-[12px] font-medium text-fg">
                        {tool.name}
                      </code>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                      {tool.description || `Tool from ${tool.serverLabel}`}
                    </p>
                    <p className="mono-ts mt-1">{tool.serverLabel}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                      tool.enabled ? "diag-success" : "border-border bg-bg-hover text-fg-faint",
                    )}
                  >
                    {tool.enabled ? "online" : "disabled"}
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-bg-elevated px-2 py-1.5 font-mono text-[10px] text-fg-secondary">
                  {`server: ${tool.serverLabel}\nwrite: ${tool.allowWrite ? "allowed" : "read-only"}`}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-bg p-3">
        <p className="mono-ts mb-2 uppercase tracking-[0.12em]">Servers</p>
        {servers.length === 0 ? (
          <p className="font-mono text-[11px] text-fg-muted">None registered</p>
        ) : (
          <ul className="space-y-1.5 font-mono text-[11px] tabular text-fg-secondary">
            {servers.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span className="truncate">{s.label}</span>
                <span className={s.enabled ? "text-success" : "text-fg-faint"}>
                  {s.enabled ? "enabled" : "off"} · {s.tools?.length || 0} tools
                </span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t border-border pt-1.5">
              <span>Last probe</span>
              <span>{lastProbe ? formatRelativeTime(lastProbe) : "—"}</span>
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}
