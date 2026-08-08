"use client";

import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ className, label, hint, error, id, ...props }: InputProps) {
  const inputId = id || props.name;
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && (
        <span className="text-sm font-medium text-fg-secondary">{label}</span>
      )}
      <input
        id={inputId}
        className={cn(
          "h-11 w-full rounded-[var(--radius-md)] border bg-bg-elevated px-3.5 text-[15px] text-fg",
          "placeholder:text-fg-faint",
          "transition-colors focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/15",
          error ? "border-danger/50" : "border-border",
          className
        )}
        {...props}
      />
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-fg-muted">{hint}</span>
      ) : null}
    </label>
  );
}
