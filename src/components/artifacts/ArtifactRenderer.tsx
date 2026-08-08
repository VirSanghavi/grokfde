import type {
  ArchitectureData,
  CodeExampleData,
  ImplementationPlanData,
  MessageArtifact,
  ProposalData,
} from "@/types/ui";
import { ArchitectureCard } from "./ArchitectureCard";

export function ArtifactRenderer({ artifact }: { artifact: MessageArtifact }) {
  if (artifact.type === "architecture") {
    return <ArchitectureCard data={artifact.data as ArchitectureData} />;
  }

  if (artifact.type === "implementation_plan") {
    const data = artifact.data as ImplementationPlanData;
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-bg-elevated p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
          Implementation plan
        </p>
        <h4 className="mt-1 text-sm font-semibold text-fg">{data.title}</h4>
        <ol className="mt-3 space-y-3">
          {data.steps.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] text-fg-muted">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-fg">{step.title}</p>
                <p className="mt-0.5 text-sm text-fg-muted">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (artifact.type === "code") {
    const data = artifact.data as CodeExampleData;
    return (
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-bg">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <p className="text-xs font-medium text-fg-secondary">{data.title}</p>
          <span className="font-mono text-[10px] uppercase text-fg-faint">{data.language}</span>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-fg-secondary">
          <code>{data.code}</code>
        </pre>
      </div>
    );
  }

  if (artifact.type === "proposal") {
    const data = artifact.data as ProposalData;
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-bg-elevated p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">Proposal</p>
        <h4 className="mt-1 text-sm font-semibold text-fg">{data.title}</h4>
        <p className="mt-2 text-sm text-fg-muted">{data.summary}</p>
        <ul className="mt-3 space-y-1">
          {data.bullets.map((b) => (
            <li key={b} className="text-sm text-fg-secondary">
              · {b}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return null;
}
