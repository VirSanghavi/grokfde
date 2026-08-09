"use client";

import { cn, formatTime, humanize } from "@/lib/utils";
import type { TimelineItem } from "@/types/ui";

/**
 * Everything that happened on the account, newest first, as an engineering log:
 * a mono kind column, a mono timestamp, and the sentence itself. Rows that have
 * a Slack thread behind them are the only ones that are pressable.
 */

const KIND_TONE: Record<string, string> = {
  blocker: "text-critical",
  issue: "text-critical",
  deployment: "text-positive",
  milestone: "text-positive",
  slack: "text-ink-2",
};

function kindLabel(type: string) {
  const t = String(type || "event");
  if (t === "github") return "GitHub";
  return humanize(t);
}

function Row({ item, pressable }: { item: TimelineItem; pressable: boolean }) {
  const type = String(item.type || "event");
  return (
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
      <div className="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-1">
        <span
          className={cn(
            "font-mono text-[11px] tracking-[0.08em] uppercase",
            KIND_TONE[type] ?? "text-ink-3",
          )}
        >
          {kindLabel(type)}
        </span>
        <time dateTime={item.createdAt} className="mono-ts tabular">
          {formatTime(item.createdAt)}
        </time>
      </div>

      <div className="min-w-0">
        <p className="text-body text-ink">{item.title || kindLabel(type)}</p>
        {item.summary && (
          <p className="mt-0.5 max-w-[68ch] text-caption break-words">{item.summary}</p>
        )}
        {pressable && (
          <p className="mono-ts mt-1.5 text-ink-2">Open thread &rarr;</p>
        )}
      </div>
    </div>
  );
}

export function TimelineFeed({
  items,
  onOpenThread,
}: {
  items: TimelineItem[];
  onOpenThread?: (threadId: string) => void;
}) {
  if (!items.length) {
    return (
      <p className="max-w-[52ch] text-body text-ink-2">
        Nothing on the timeline yet. Chat messages, Slack threads, implementation runs, and
        deployments all land here as they happen. Start a conversation with the prospect to
        put the first entry on it.
      </p>
    );
  }

  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <ol className="divide-y divide-rule border-y border-rule">
      {sorted.map((item) => {
        const threadId = item.threadId;
        const pressable = Boolean(threadId && onOpenThread);

        if (!pressable) {
          return (
            <li key={item.id} className="py-3.5">
              <Row item={item} pressable={false} />
            </li>
          );
        }

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpenThread?.(threadId as string)}
              className="transition-premium block w-full py-3.5 text-left hover:bg-hover active:scale-[0.995]"
            >
              <Row item={item} pressable />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
