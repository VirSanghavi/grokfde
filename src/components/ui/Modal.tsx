"use client";

import { cn } from "@/lib/utils";
import { IconX } from "@/components/icons";
import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Elevation 2. Traps focus, closes on Escape, restores focus to whatever
 * opened it, and scrolls internally so it never exceeds the viewport.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Pinned below the scroll area. Put the primary action here. */
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const reactId = useId();
  const titleId = `modal-title-${reactId}`;
  const descriptionId = `modal-description-${reactId}`;

  const trap = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const activeEl = document.activeElement;

      if (event.shiftKey && (activeEl === first || activeEl === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", trap, true);

    const focusTarget =
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? dialogRef.current;
    focusTarget?.focus();

    return () => {
      document.removeEventListener("keydown", trap, true);
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, trap]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-ink/30"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "animate-sheet relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden",
          "rounded-t-[var(--radius-panel)] border border-rule bg-surface shadow-[var(--elevation-2)]",
          "sm:rounded-[var(--radius-panel)]",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-[0.875rem] text-ink-3">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close dialog" onClick={onClose} size="sm">
            <IconX size={16} />
          </IconButton>
        </div>

        <div className="scrollbar-thin overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule bg-paper px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
