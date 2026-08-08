import type { ImplementationEvent } from "@/types/ui";
import { cn } from "@/lib/utils";
import { Check, Loader2, Wrench, FileCode, FlaskConical, GitPullRequest } from "lucide-react";

function iconFor(type: string) {
  if (type.includes("repair")) return Wrench;
  if (type.includes("test")) return FlaskConical;
  if (type.includes("file") || type.includes("modified")) return FileCode;
  if (type.includes("pr")) return GitPullRequest;
  if (type.includes("started") || type.includes("analyz") || type.includes("plann"))
    return Loader2;
  return Check;
}

export function RunTimeline({
  events,
  live,
}: {
  events: ImplementationEvent[];
  live?: boolean;
}) {
  if (!events.length) return null;

  return (
    <ul className="space-y-2.5">
      {events.map((event, i) => {
        const Icon = iconFor(String(event.type));
        const isLast = i === events.length - 1;
        return (
          <li
            key={`${event.type}-${i}-${event.label}`}
            className="flex items-start gap-2.5 animate-fade"
          >
            <Icon
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-faint",
                live && isLast && "animate-pulse-soft text-brand"
              )}
            />
            <div className="min-w-0">
              <p className="text-sm text-fg-secondary">{event.label}</p>
              {event.at && (
                <p className="mt-0.5 font-mono text-[10px] text-fg-faint">
                  {new Date(event.at).toLocaleTimeString()}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
