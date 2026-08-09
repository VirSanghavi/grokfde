"use client";

import { cn } from "@/lib/utils";
import { IconAlert } from "@/components/icons";
import { Button } from "./Button";

/**
 * The third of the four states. A human sentence about what failed plus a real
 * retry control. Never a raw error object, never a silent failure.
 *
 * Pass the caught error to `detail` if you want the technical line available;
 * it renders in mono underneath, small and secondary, so support can read it
 * without the message itself turning into a stack trace.
 */
export function ErrorState({
  title = "That did not load",
  message,
  detail,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  compact = false,
  className,
}: {
  title?: string;
  /** One plain sentence. What failed, in words a person would use. */
  message: string;
  /** Optional technical detail, for example the API error code. */
  detail?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "py-10" : "py-14 sm:py-20",
        className,
      )}
    >
      <span
        aria-hidden
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border border-critical-rule bg-critical-soft text-critical"
      >
        <IconAlert size={20} />
      </span>

      <h3 className="text-title text-ink">{title}</h3>

      <p className="mt-2 max-w-[46ch] text-[0.9375rem] leading-6 text-ink-3">{message}</p>

      {detail && (
        <p className="mt-3 max-w-[46ch] font-mono text-[0.75rem] leading-5 break-words text-ink-4">
          {detail}
        </p>
      )}

      {onRetry && (
        <div className="mt-5">
          <Button
            variant="secondary"
            onClick={onRetry}
            loading={retrying}
            loadingLabel="Retrying"
          >
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
