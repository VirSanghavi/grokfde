"use client";

import { Badge } from "@/components/ui/Badge";
import { formatTime } from "@/lib/utils";
import type { TimelineItem } from "@/types/ui";

const toneFor = (type: string) => {
  switch (type) {
    case "slack":
      return "info" as const;
    case "call":
      return "call" as const;
    case "implementation":
    case "github":
      return "accent" as const;
    case "blocker":
      return "danger" as const;
    case "deployment":
    case "milestone":
      return "success" as const;
    case "email":
      return "neutral" as const;
    default:
      return "neutral" as const;
  }
};

export function TimelineFeed({
  items,
  onOpenThread,
}: {
  items: TimelineItem[];
  onOpenThread?: (threadId: string) => void;
}) {
  const sorted = [...items].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
  );

  return (
    <div className="space-y-0 divide-y divide-border overflow-hidden rounded-[var(--radius-xl)] border border-border bg-bg-elevated shadow-sm">
      {sorted.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={!item.threadId || !onOpenThread}
          onClick={() => item.threadId && onOpenThread?.(item.threadId)}
          className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left transition-colors hover:bg-bg-hover disabled:cursor-default disabled:hover:bg-transparent"
        >
          <div className="flex items-center justify-between gap-2">
            <Badge tone={toneFor(String(item.type))}>
              {String(item.type).toUpperCase()}
            </Badge>
            <span className="font-mono text-[11px] text-fg-faint">
              {formatTime(item.createdAt)}
            </span>
          </div>
          <p className="text-sm font-medium text-fg">{item.title}</p>
          {item.summary && (
            <p className="text-sm leading-relaxed text-fg-muted">{item.summary}</p>
          )}
          {item.threadId && (
            <p className="font-mono text-[10px] text-brand">Open thread →</p>
          )}
        </button>
      ))}
    </div>
  );
}
