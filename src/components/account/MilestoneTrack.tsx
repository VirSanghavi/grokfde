import { cn } from "@/lib/utils";
import type { Milestone } from "@/types/ui";
import { Check } from "lucide-react";

export function MilestoneTrack({ milestones }: { milestones: Milestone[] }) {
  return (
    <ol className="flex flex-col gap-0">
      {milestones.map((m, i) => {
        const done = m.status === "completed";
        const current = m.status === "current";
        const blocked = m.status === "blocked";
        return (
          <li key={m.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[10px]",
                  done && "border-success bg-success/15 text-success",
                  current && "border-brand bg-brand-dim text-brand",
                  blocked && "border-danger bg-danger/10 text-danger",
                  !done && !current && !blocked && "border-border bg-bg text-fg-faint"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : current ? "→" : "○"}
              </span>
              {i < milestones.length - 1 && (
                <span
                  className={cn(
                    "w-px flex-1 min-h-[18px]",
                    done ? "bg-success/40" : "bg-border"
                  )}
                />
              )}
            </div>
            <div className={cn("pb-4", current && "pt-0.5")}>
              <p
                className={cn(
                  "text-sm font-medium",
                  current ? "text-fg" : done ? "text-fg-secondary" : "text-fg-muted"
                )}
              >
                {m.label}
              </p>
              {current && (
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-brand">
                  Current
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
