import type { ArchitectureData } from "@/types/ui";
import { cn } from "@/lib/utils";

export function ArchitectureCard({ data }: { data: ArchitectureData }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-bg-elevated shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
          Architecture
        </p>
        <h4 className="mt-1 text-sm font-semibold text-fg">{data.title}</h4>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {data.nodes.map((node) => (
          <div
            key={node.id}
            className={cn(
              "rounded-[var(--radius-md)] border px-3 py-3",
              node.kind === "core" && "border-brand-border bg-brand-dim",
              node.kind === "tool" && "border-call/25 bg-call/5",
              node.kind === "human" && "border-danger/25 bg-danger/5",
              (!node.kind || node.kind === "data" || node.kind === "edge" || node.kind === "stack") &&
                "border-border bg-bg"
            )}
          >
            <p className="whitespace-pre-line text-sm font-medium text-fg">{node.label}</p>
            {node.kind && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                {node.kind}
              </p>
            )}
          </div>
        ))}
      </div>

      {data.edges.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
            Flows
          </p>
          <ul className="space-y-1">
            {data.edges.map((edge, i) => {
              const from = data.nodes.find((n) => n.id === edge.from)?.label.split("\n")[0] ?? edge.from;
              const to = data.nodes.find((n) => n.id === edge.to)?.label.split("\n")[0] ?? edge.to;
              return (
                <li key={i} className="font-mono text-xs text-fg-muted">
                  {from}
                  <span className="mx-2 text-fg-faint">→</span>
                  {to}
                  {edge.label ? <span className="text-fg-faint"> · {edge.label}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data.notes && data.notes.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <ul className="space-y-1">
            {data.notes.map((note) => (
              <li key={note} className="text-xs text-fg-muted">
                · {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
