import { cn } from "@/lib/utils";

type Status =
  | "ready"
  | "processing"
  | "online"
  | "offline"
  | "error"
  | "listening"
  | "connected"
  | "needs_human";

/**
 * Colour never carries meaning alone. Every dot exposes its state as text to
 * assistive tech, and callers pair it with a visible label.
 */
const config: Record<Status, { color: string; live?: boolean }> = {
  ready: { color: "bg-positive" },
  online: { color: "bg-positive" },
  connected: { color: "bg-live", live: true },
  listening: { color: "bg-live", live: true },
  processing: { color: "bg-caution" },
  offline: { color: "bg-ink-4" },
  error: { color: "bg-critical" },
  needs_human: { color: "bg-critical" },
};

export function StatusDot({
  status,
  pulse,
  label,
  className,
}: {
  status: Status;
  /** Only true while the state is genuinely live. */
  pulse?: boolean;
  /**
   * Screen-reader text. Omit when a visible label already sits beside the dot,
   * which is the normal case and avoids announcing the state twice.
   */
  label?: string;
  className?: string;
}) {
  const { color, live } = config[status];

  return (
    <span
      aria-hidden={label ? undefined : true}
      className={cn("relative inline-flex shrink-0", className)}
    >
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          color,
          pulse && "animate-pulse-soft",
        )}
      />
      {live && pulse && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-full border border-live-rule"
        />
      )}
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
