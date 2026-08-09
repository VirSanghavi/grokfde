import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * An empty surface says what it is, why it is empty, and offers the one action
 * that fills it. It is never a blank panel and never a shrug.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  hint,
  compact = false,
  className,
}: {
  /** A DottedIcon at size 20. Decorative, so it stays out of the a11y tree. */
  icon?: ReactNode;
  title: string;
  /** One sentence. Why is this empty, and what changes that. */
  description?: string;
  /** Exactly one action, the one that fills this surface. */
  action?: ReactNode;
  /** Mono footnote, for example a keyboard hint or a supported format list. */
  hint?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "py-10" : "py-14 sm:py-20",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border border-rule bg-sunken text-ink-3"
        >
          {icon}
        </span>
      )}

      <h3 className="text-title text-ink">{title}</h3>

      {description && (
        <p className="mt-2 max-w-[42ch] text-[0.9375rem] leading-6 text-ink-3">
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}

      {hint && <p className="text-label mt-4">{hint}</p>}
    </div>
  );
}
