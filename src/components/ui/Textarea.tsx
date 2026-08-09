"use client";

import { cn } from "@/lib/utils";
import { useId, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Keeps a line reserved below so an error never shifts the layout. */
  reserveMessage?: boolean;
  wrapperClassName?: string;
}

export function Textarea({
  className,
  wrapperClassName,
  label,
  hint,
  error,
  reserveMessage = true,
  id,
  disabled,
  required,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? `textarea-${generatedId}`;
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

      <textarea
        id={inputId}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          "transition-premium min-h-[140px] w-full resize-y rounded-[var(--radius-control)] border bg-surface px-3 py-2.5 text-base leading-6 text-ink",
          "placeholder:text-ink-4",
          error
            ? "border-critical hover:border-critical"
            : "border-rule-strong hover:border-ink-4",
          "disabled:cursor-not-allowed disabled:resize-none disabled:border-rule disabled:bg-sunken disabled:text-ink-4",
          className,
        )}
        {...props}
      />

      {(message || reserveMessage) && (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={cn(
            "mt-1.5 min-h-4 text-[0.8125rem] leading-4",
            error ? "text-critical" : "text-ink-3",
          )}
        >
          {message ?? " "}
        </p>
      )}
    </div>
  );
}
