"use client";

import { cn } from "@/lib/utils";
import { IconX } from "@/components/icons";

import { useEffect, type ReactNode } from "react";
import { IconButton } from "./IconButton";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-fg/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-border bg-bg-elevated shadow-lg sm:rounded-[var(--radius-xl)]",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
          "animate-in",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} size="sm">
            <IconX className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="overflow-y-auto p-5 scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}
