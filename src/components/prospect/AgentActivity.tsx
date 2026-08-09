import type { AgentEvent } from "@/types/ui";
import { cn } from "@/lib/utils";

/**
 * What the engineer is actually doing, as it happens.
 *
 * Watching a real knowledge lookup or tool call is the proof this is not a
 * scripted demo, so these lines report real events only. There is no timed
 * "thinking" animation and no pulsing dot: the label appears when the event
 * arrives and stays when it is done. Machine activity, set in mono.
 */
export function AgentActivity({
  events,
  className,
  live = false,
}: {
  events: AgentEvent[];
  className?: string;
  /**
   * The turn is still running, so the newest line is a step in progress rather
   * than a record of one that finished. It gets the live dot and full-strength
   * ink; everything above it has already happened and stays quiet. Still no
   * timed animation, because the state is real.
   */
  live?: boolean;
}) {
  if (!events.length) return null;

  return (
    <ul className={cn("space-y-1", className)}>
      {events.map((event, i) => {
        const running = live && i === events.length - 1;
        return (
          <li
            key={`${event.type}-${i}-${event.label}`}
            className={cn(
              "flex items-center gap-2 font-mono text-[0.8125rem] leading-[1.45]",
              running ? "text-ink-2" : "text-ink-3",
            )}
          >
            {running && (
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-live" />
            )}
            <span className="min-w-0">{event.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
