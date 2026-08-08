"use client";

import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export function Textarea({ className, label, hint, id, ...props }: TextareaProps) {
  const inputId = id || props.name;
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && <span className="text-sm font-medium text-fg-secondary">{label}</span>}
      <textarea
        id={inputId}
        className={cn(
          "min-h-[140px] w-full resize-y rounded-[var(--radius-md)] border border-border bg-bg-elevated px-3.5 py-3 text-[15px] text-fg",
          "placeholder:text-fg-faint",
          "transition-colors focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/15",
          className
        )}
        {...props}
      />
      {hint && <span className="text-xs text-fg-muted">{hint}</span>}
    </label>
  );
}
