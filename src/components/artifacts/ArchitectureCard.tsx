import type { ArchitectureData, ArchitectureEdge, ArchitectureNode } from "@/types/ui";
import { cn } from "@/lib/utils";

/**
 * Renders a generated integration architecture as layered bands.
 *
 * Layout is derived from the edges, not from the order the model happened to
 * emit nodes in: each node sits one band below the deepest thing that feeds it.
 * Connections are printed on the node they leave from, so nothing has to be
 * cross-referenced and no label can collide with another.
 */

type Tier = "product" | "channel" | "knowledge" | "tool" | "system";

const TIER_LABEL: Record<Tier, string> = {
  product: "Product",
  channel: "Channel",
  knowledge: "Knowledge",
  tool: "Tools",
  system: "System",
};

/**
 * Node kinds are free text: the mock fixtures say `core`/`stack`/`edge`, the
 * API says `product`/`channel`/`knowledge`, and the model invents its own. Map
 * whatever arrives onto the five tiers the design actually draws.
 */
function tierOf(node: ArchitectureNode): Tier {
  const kind = `${node.kind ?? ""}`.toLowerCase();
  const id = `${node.id ?? ""}`.toLowerCase();
  if (/fde|grok/.test(id) || /product|core|vendor|agent/.test(kind)) return "product";
  if (/channel|entry|inbound|client|frontend|ui|prospect/.test(kind)) return "channel";
  if (/knowledge|data|store|db|database|collection|memory|index/.test(kind)) return "knowledge";
  if (/tool|mcp|action|automation/.test(kind)) return "tool";
  return "system";
}

const TIER_STYLE: Record<Tier, string> = {
  // The product is the one dominant element: solid ink, reversed out.
  product: "border-ink bg-ink",
  channel: "border-rule bg-surface",
  knowledge: "border-rule bg-sunken",
  tool: "border-rule-strong border-dashed bg-surface",
  system: "border-rule bg-surface",
};

function firstLine(label: string) {
  return label.split("\n")[0].trim();
}

interface LaidOutNode {
  node: ArchitectureNode;
  tier: Tier;
  out: { to: string; label?: string }[];
}

/**
 * Longest-path depth. The relaxation pass is capped at one round per node so a
 * model that emits a cycle degrades to a flat diagram instead of hanging.
 */
function layout(nodes: ArchitectureNode[], edges: ArchitectureEdge[]): LaidOutNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const real = edges.filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);

  const depth = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const e of real) {
      const next = (depth.get(e.from) ?? 0) + 1;
      if (next > (depth.get(e.to) ?? 0)) {
        depth.set(e.to, next);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const bands = new Map<number, LaidOutNode[]>();
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    const entry: LaidOutNode = {
      node,
      tier: tierOf(node),
      out: real
        .filter((e) => e.from === node.id)
        .map((e) => ({ to: firstLine(byId.get(e.to)?.label ?? e.to), label: e.label })),
    };
    bands.set(d, [...(bands.get(d) ?? []), entry]);
  }

  return [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([, band]) => band);
}

function ArchitectureShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="w-full">
      <p className="text-label">{eyebrow}</p>
      {title ? <h4 className="mt-1 text-title text-ink">{title}</h4> : null}
      {children}
    </section>
  );
}

export function ArchitectureCard({ data }: { data: ArchitectureData }) {
  const nodes = (Array.isArray(data?.nodes) ? data.nodes : [])
    .filter((n): n is ArchitectureNode => Boolean(n && typeof n.id === "string" && n.id))
    .map((n) => ({ ...n, label: `${n.label ?? n.id}`.trim() || n.id }));
  const edges = (Array.isArray(data?.edges) ? data.edges : []).filter(
    (e): e is ArchitectureEdge => Boolean(e && e.from && e.to),
  );
  const notes = (Array.isArray(data?.notes) ? data.notes : []).filter(Boolean);

  if (!data || typeof data !== "object") {
    return (
      <ArchitectureShell eyebrow="Architecture">
        <p className="mt-2 max-w-[46ch] text-body text-ink-2">
          This diagram could not be read. The generated payload was not in the shape the
          renderer expects. Ask Atlas to draw the architecture again.
        </p>
      </ArchitectureShell>
    );
  }

  if (nodes.length === 0) {
    return (
      <ArchitectureShell eyebrow="Architecture" title={data.title || undefined}>
        <p className="mt-2 max-w-[46ch] text-body text-ink-2">
          No systems came back for this diagram. Atlas draws it from the prospect stack and
          what the conversation has established, so it fills in once there is a stack on
          record. Ask for an architecture diagram in the conversation.
        </p>
      </ArchitectureShell>
    );
  }

  const bands = layout(nodes, edges);

  return (
    <ArchitectureShell eyebrow="Architecture" title={data.title || "Integration architecture"}>
      <p className="mono-ts mt-1">
        {nodes.length} {nodes.length === 1 ? "system" : "systems"} · {edges.length}{" "}
        {edges.length === 1 ? "connection" : "connections"}
      </p>

      <ol className="mt-4 space-y-5">
        {bands.map((band, index) => (
          <li key={index}>
            <div className="flex items-center gap-3">
              <span className="mono-ts tabular">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span aria-hidden className="h-px flex-1 bg-rule" />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {band.map(({ node, tier, out }) => {
                const isProduct = tier === "product";
                return (
                  <article
                    key={node.id}
                    className={cn(
                      "min-w-0 rounded-[var(--radius-lg)] border px-3 py-3",
                      TIER_STYLE[tier],
                    )}
                  >
                    <p
                      className={cn(
                        "font-mono text-[11px] uppercase tracking-[0.08em]",
                        isProduct ? "text-paper/70" : "text-ink-3",
                      )}
                    >
                      {TIER_LABEL[tier]}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-[0.9375rem] leading-snug font-medium break-words hyphens-auto",
                        isProduct ? "text-paper" : "text-ink",
                      )}
                    >
                      {node.label}
                    </p>

                    {out.length > 0 && (
                      <ul
                        className={cn(
                          "mt-2.5 space-y-1 border-t pt-2.5",
                          isProduct ? "border-paper/20" : "border-rule",
                        )}
                      >
                        {out.map((edge, i) => (
                          <li
                            key={`${edge.to}-${i}`}
                            className={cn(
                              "font-mono text-[11px] leading-relaxed break-words",
                              isProduct ? "text-paper/75" : "text-ink-3",
                            )}
                          >
                            <span aria-hidden>&rarr;</span>{" "}
                            <span className="sr-only">connects to</span>
                            {edge.to}
                            {edge.label ? (
                              <span className={isProduct ? "text-paper/55" : "text-ink-4"}>
                                {" "}
                                · {edge.label}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {notes.length > 0 && (
        <ul className="mt-5 space-y-1.5 border-t border-rule pt-4">
          {notes.map((note) => (
            <li key={note} className="max-w-[64ch] text-caption">
              {note}
            </li>
          ))}
        </ul>
      )}
    </ArchitectureShell>
  );
}
