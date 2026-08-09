import { cn } from "@/lib/utils";
import type { ImplementationRunStatus, WorkspaceStatus } from "@/types/ui";

/**
 * Status is a dot plus a word. No pill, no border, no tinted capsule. The dot
 * is one of the two round things the design contract allows, and the word is
 * what carries the meaning for anyone who cannot separate the colours.
 */

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
  pr_ready: "Pull request open",
};

const DOT: Record<string, string> = {
  discovery: "bg-ink-4",
  connected: "bg-positive",
  analyzing: "bg-ink-2",
  analyzed: "bg-ink",
  planning: "bg-ink-2",
  planned: "bg-ink",
  building: "bg-live",
  testing: "bg-caution",
  repairing: "bg-caution",
  ready_for_review: "bg-positive",
  failed: "bg-critical",
  queued: "bg-ink-4",
  pr_ready: "bg-positive",
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
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink-2", large ? "text-[0.9375rem]" : "text-[0.8125rem]", className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[status] || "bg-ink-4")} />
      {label}
    </span>
  );
}
