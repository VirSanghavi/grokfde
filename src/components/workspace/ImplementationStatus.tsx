import { cn } from "@/lib/utils";
import type { ImplementationRunStatus, WorkspaceStatus } from "@/types/ui";

const LABELS: Record<string, string> = {
  discovery: "Discovery",
  connected: "Connected",
  analyzing: "Analyzing",
  analyzed: "Analyzed",
  planning: "Planning",
  planned: "Plan ready",
  building: "Building",
  testing: "Testing",
  repairing: "Repairing",
  ready_for_review: "Ready for review",
  failed: "Failed",
  queued: "Queued",
  pr_ready: "PR ready",
};

const TONES: Record<string, string> = {
  discovery: "border-border bg-bg-hover text-fg-secondary",
  connected: "border-success/25 bg-success/10 text-success",
  analyzing: "border-info/25 bg-info/10 text-info",
  analyzed: "border-brand-border bg-brand-dim text-brand",
  planning: "border-info/25 bg-info/10 text-info",
  planned: "border-brand-border bg-brand-dim text-brand",
  building: "border-call/25 bg-call/10 text-call",
  testing: "border-warning/25 bg-warning/10 text-warning",
  repairing: "border-warning/30 bg-warning/15 text-warning",
  ready_for_review: "border-success/30 bg-success/10 text-success",
  failed: "border-danger/30 bg-danger/10 text-danger",
  queued: "border-border bg-bg-hover text-fg-secondary",
  pr_ready: "border-success/30 bg-success/15 text-success",
};

export function ImplementationStatus({
  status,
  large,
  className,
}: {
  status: WorkspaceStatus | ImplementationRunStatus | string;
  large?: boolean;
  className?: string;
}) {
  const label = LABELS[status] || status.replace(/_/g, " ");
  const tone = TONES[status] || TONES.discovery;
  const pulse = ["analyzing", "planning", "building", "testing", "repairing", "queued"].includes(
    status
  );

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-medium uppercase tracking-[0.08em]",
        large ? "px-3.5 py-1.5 text-xs" : "px-2.5 py-1 text-[10px]",
        tone,
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          pulse && "animate-pulse-soft"
        )}
      />
      {label}
    </span>
  );
}
