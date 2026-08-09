"use client";

import { cn } from "@/lib/utils";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Rendered inside the field, on the right. Icons must be aria-hidden. */
  trailing?: ReactNode;
  /**
   * Keeps a line reserved under the field so the layout never shifts when an
   * error appears. Turn off only in dense rows with no messages at all.
   */
  reserveMessage?: boolean;
  wrapperClassName?: string;
}

export function Input({
  className,
  wrapperClassName,
  label,
  hint,
  error,
  trailing,
  reserveMessage = true,
  id,
  disabled,
  required,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? `input-${generatedId}`;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className={cn("flex w-full flex-col", wrapperClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 text-[0.8125rem] font-medium text-ink-2"
        >
          {label}
          {required && (
            <span className="ml-1 text-ink-3" aria-hidden>
              *
            </span>
          )}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            "transition-premium h-11 w-full rounded-[var(--radius-control)] border bg-surface px-3 text-base text-ink",
            "placeholder:text-ink-4",
            Boolean(trailing) && "pr-10",
            error
              ? "border-critical hover:border-critical"
              : "border-rule-strong hover:border-ink-4",
            "disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunken disabled:text-ink-4 disabled:placeholder:text-ink-4",
            className,
          )}
          {...props}
        />
        {trailing && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-3">
            {trailing}
          </span>
        )}
      </div>

      {(message || reserveMessage) && (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={cn(
            "mt-1.5 min-h-4 text-[0.8125rem] leading-4",
            error ? "text-critical" : "text-ink-3",
          )}
        >
          {message ?? " "}
        </p>
      )}
    </div>
  );
}
