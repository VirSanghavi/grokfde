import type { ImplementationEvent } from "@/types/ui";
import { cn } from "@/lib/utils";

/**
 * The run's activity, newest last, as a hairline-separated log. Timestamps are
 * machine data, so they are mono and tabular. Nothing pulses: the arrival of a
 * new row is itself the signal that work is happening.
 */
export function RunTimeline({
  events,
  live,
  loading,
}: {
  events: ImplementationEvent[];
  live?: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <ul className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-3 rounded-[2px] bg-sunken" style={{ width: `${76 - i * 14}%` }} />
        ))}
      </ul>
    );
  }

  if (!events.length) {
    return (
      <p className="text-[0.9375rem] leading-6 text-ink-3">
        Nothing has happened on this run yet.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-rule">
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        return (
          <li
            key={`${event.type}-${i}-${event.label}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
          >
            <span
              className={cn(
                "min-w-0 text-[0.9375rem] leading-6",
                live && isLast ? "text-ink" : "text-ink-2",
              )}
            >
              {event.label}
            </span>
            {event.at && (
              <time
                dateTime={event.at}
                className="shrink-0 font-mono text-[0.75rem] tabular-nums text-ink-4"
              >
                {new Date(event.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
            )}
          </li>
        );
      })}
    </ol>
  );
}
