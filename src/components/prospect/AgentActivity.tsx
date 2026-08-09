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
}: {
  events: AgentEvent[];
  className?: string;
}) {
  if (!events.length) return null;

  return (
    <ul className={cn("space-y-1", className)}>
      {events.map((event, i) => (
        <li
          key={`${event.type}-${i}-${event.label}`}
          className="font-mono text-[0.8125rem] leading-[1.45] text-ink-3"
        >
          {event.label}
        </li>
      ))}
    </ul>
  );
}
