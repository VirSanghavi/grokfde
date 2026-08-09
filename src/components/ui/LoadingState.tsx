import { cn } from "@/lib/utils";

/**
 * A single skeleton block. Neutral sweep, no colour, no throb, and it inherits
 * the reduced-motion gate from globals.css.
 */
export function Skeleton({
  className,
  width,
}: {
  className?: string;
  /** Inline width, useful for staggering text lines so they read as prose. */
  width?: string;
}) {
  return <div className={cn("skeleton", className)} style={width ? { width } : undefined} />;
}

export type LoadingVariant = "list" | "rows" | "panel" | "table" | "chat" | "metrics";

/**
 * Loading is always shaped like the content that is about to arrive, never a
 * bare spinner. Pick the variant that matches the surface underneath it.
 */
export function LoadingState({
  variant = "list",
  rows = 4,
  label = "Loading",
  showLabel = false,
  className,
}: {
  variant?: LoadingVariant;
  rows?: number;
  /** Always announced. Say what is loading, not just "Loading". */
  label?: string;
  /** Render the label above the skeleton as well as announcing it. */
  showLabel?: boolean;
  className?: string;
}) {
  const keys = Array.from({ length: Math.max(1, rows) }, (_, i) => i);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn("w-full p-4 sm:p-6", className)}
    >
      {showLabel ? (
        <p className="text-label mb-4">{label}</p>
      ) : (
        <span className="sr-only">{label}</span>
      )}

      {variant === "list" && (
        <ul className="divide-y divide-rule">
          {keys.map((key) => (
            <li key={key} className="flex items-center gap-3 py-3.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5" width={`${68 - key * 6}%`} />
                <Skeleton className="h-3" width={`${46 - key * 4}%`} />
              </div>
              <Skeleton className="hidden h-3 w-14 shrink-0 sm:block" />
            </li>
          ))}
        </ul>
      )}

      {variant === "rows" && (
        <div className="space-y-3">
          {keys.map((key) => (
            <Skeleton key={key} className="h-3.5" width={`${92 - key * 9}%`} />
          ))}
        </div>
      )}

      {variant === "panel" && (
        <div className="space-y-5">
          <div className="space-y-2.5">
            <Skeleton className="h-5" width="42%" />
            <Skeleton className="h-3" width="64%" />
          </div>
          <div className="space-y-2.5 border-t border-rule pt-5">
            {keys.map((key) => (
              <Skeleton key={key} className="h-3" width={`${96 - key * 11}%`} />
            ))}
          </div>
        </div>
      )}

      {variant === "table" && (
        <div className="w-full overflow-x-auto">
          <div className="min-w-[32rem]">
            <div className="flex items-center gap-4 border-b border-rule pb-2.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="ml-auto h-2.5 w-16" />
            </div>
            {keys.map((key) => (
              <div key={key} className="flex items-center gap-4 border-b border-rule py-3.5">
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === "chat" && (
        <div className="space-y-5">
          {keys.map((key) => {
            const fromAgent = key % 2 === 0;
            return (
              <div
                key={key}
                className={cn("flex items-start gap-3", !fromAgent && "flex-row-reverse")}
              >
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div
                  className={cn(
                    "max-w-[min(100%,26rem)] flex-1 space-y-2 rounded-[var(--radius-panel)] p-1",
                  )}
                >
                  <Skeleton className="h-3.5" width={fromAgent ? "88%" : "62%"} />
                  <Skeleton className="h-3.5" width={fromAgent ? "72%" : "44%"} />
                  {fromAgent && <Skeleton className="h-3.5" width="52%" />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {variant === "metrics" && (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {keys.map((key) => (
            <div key={key} className="space-y-3 bg-surface p-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
