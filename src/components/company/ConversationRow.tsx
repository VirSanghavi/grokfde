import { cn, formatRelativeTime, humanize } from "@/lib/utils";

/**
 * One thread in the inbox rail. A name, where the deal stands, and when it last
 * moved. Grouped by a hairline, never a card, and never a coloured capsule.
 */
export function ConversationRow({
  name,
  personName,
  stage,
  updatedAt,
  active,
  onClick,
}: {
  name: string;
  personName?: string | null;
  stage: string;
  updatedAt: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "transition-premium flex min-h-11 w-full flex-col gap-1 border-b border-rule px-5 py-3.5 text-left hover:bg-hover",
        // Below md there is no second pane, so a selected row would be marking
        // something the reader cannot see.
        active && "md:bg-sunken",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-body font-medium text-ink">{name}</span>
        <span className="mono-ts tabular shrink-0">{formatRelativeTime(updatedAt)}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="mono-ts shrink-0">{humanize(stage)}</span>
        {personName ? (
          <span className="truncate text-caption">{personName}</span>
        ) : null}
      </div>
    </button>
  );
}
