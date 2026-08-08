"use client";

import { IconStatusDot } from "@/components/icons";
import { cn } from "@/lib/utils";

const TOOLS = [
  {
    name: "create_sandbox",
    status: "online" as const,
    schema: '{ "name": "string", "region?": "string" }',
    desc: "Provision trial environment for prospect evaluation",
  },
  {
    name: "estimate_cost",
    status: "online" as const,
    schema: '{ "seats": "number", "include_voice?": "boolean" }',
    desc: "Indicative monthly pricing for usage profile",
  },
  {
    name: "list_capabilities",
    status: "online" as const,
    schema: '{ "stack?": "string[]" }',
    desc: "Map product capabilities onto prospect stack",
  },
  {
    name: "hubspot_crm_sync_deal",
    status: "streaming" as const,
    schema: '{ "deal_id": "string", "stage": "string" }',
    desc: "Push opportunity stage after technical evaluation",
  },
  {
    name: "inspect_cluster_config",
    status: "online" as const,
    schema: '{ "cluster": "string" }',
    desc: "Read-only Kubernetes / EKS configuration probe",
  },
  {
    name: "generate_config",
    status: "idle" as const,
    schema: '{ "platform": "string", "company_slug": "string" }',
    desc: "Emit starter integration config snippet",
  },
];

export function McpInspectorPanel({
  tokenUsed = 84210,
  tokenMax = 128000,
}: {
  tokenUsed?: number;
  tokenMax?: number;
}) {
  const pct = Math.min(100, Math.round((tokenUsed / tokenMax) * 100));
  const segments = 24;
  const filled = Math.round((pct / 100) * segments);

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-fg">Context window</p>
          <p className="font-mono text-[11px] tabular text-fg-muted">
            {tokenUsed.toLocaleString()} / {tokenMax.toLocaleString()}
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
        <p className="mono-ts mt-2">
          {pct}% utilized · system + knowledge + prospect memory + tools
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-fg">Live tool inventory</p>
          <span className="inline-flex items-center gap-1.5 rounded-md border diag-success px-2 py-0.5 text-[10px] font-medium">
            <IconStatusDot tone="success" />
            {TOOLS.filter((t) => t.status === "online" || t.status === "streaming").length} connected
          </span>
        </div>
        <ul className="space-y-2">
          {TOOLS.map((tool) => (
            <li
              key={tool.name}
              className="rounded-[var(--radius-lg)] border border-border bg-bg p-3 transition-premium hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <IconStatusDot
                      tone={
                        tool.status === "streaming"
                          ? "info"
                          : tool.status === "online"
                            ? "success"
                            : "idle"
                      }
                    />
                    <code className="font-mono text-[12px] font-medium text-fg">{tool.name}</code>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{tool.desc}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                    tool.status === "streaming"
                      ? "diag-info"
                      : tool.status === "online"
                        ? "diag-success"
                        : "border-border bg-bg-hover text-fg-faint",
                  )}
                >
                  {tool.status}
                </span>
              </div>
              <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-bg-elevated px-2 py-1.5 font-mono text-[10px] text-fg-secondary">
                {tool.schema}
              </pre>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-bg p-3">
        <p className="mono-ts mb-2 uppercase tracking-[0.12em]">Handshake</p>
        <ul className="space-y-1.5 font-mono text-[11px] tabular text-fg-secondary">
          <li className="flex justify-between gap-2">
            <span>MCP protocol</span>
            <span className="text-success">1.0 OK</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>Auth scope</span>
            <span>read + limited_write</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>Latency p50</span>
            <span>42ms</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>Last probe</span>
            <span>14:22:04.18</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
