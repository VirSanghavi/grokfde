import { cn } from "@/lib/utils";
import type { Milestone } from "@/types/ui";

/**
 * The delivery track for an account. Status is carried by a glyph and a word,
 * never by color on its own.
 */

const MARK: Record<Milestone["status"], string> = {
  completed: "✓",
  current: "▸",
  blocked: "!",
  upcoming: "·",
};

const MARK_STYLE: Record<Milestone["status"], string> = {
  completed: "border-positive-rule bg-positive-soft text-positive",
  current: "border-ink bg-ink text-paper",
  blocked: "border-critical-rule bg-critical-soft text-critical",
  upcoming: "border-rule bg-surface text-ink-4",
};

export function MilestoneTrack({
  milestones,
  agentName = "your engineer",
}: {
  milestones: Milestone[];
  agentName?: string;
}) {
  if (!milestones.length) {
    return (
      <p className="max-w-[46ch] text-caption">
        No milestones yet. They are created with the account and advance as {agentName} moves
        the work through implementation, staging, and production.
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {milestones.map((m, i) => {
        const last = i === milestones.length - 1;
        const done = m.status === "completed";
        return (
          <li
            key={m.id}
            className="flex gap-3"
            aria-current={m.status === "current" ? "step" : undefined}
          >
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  // A glyph sits inside this, so it takes the control radius.
                  // Only a textless circle may be round.
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border font-mono text-[11px] leading-none",
                  MARK_STYLE[m.status],
                )}
              >
                {MARK[m.status]}
              </span>
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "min-h-[18px] w-px flex-1",
                    done ? "bg-rule-strong" : "bg-rule",
                  )}
                />
              )}
            </div>

            <div className={cn("min-w-0", last ? "pb-0" : "pb-4")}>
              <p
                className={cn(
                  "text-body",
                  m.status === "current"
                    ? "font-medium text-ink"
                    : done
                      ? "text-ink-2"
                      : "text-ink-3",
                )}
              >
                {m.label}
              </p>
              {m.status !== "upcoming" && (
                <p className="mono-ts mt-0.5">
                  {m.status === "current"
                    ? "In progress"
                    : done
                      ? "Complete"
                      : "Blocked"}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
