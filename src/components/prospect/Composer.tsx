"use client";

import { IconSend } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * The prompt box. On first paint this is the centre of gravity of the whole
 * product, so it is large, quiet, and unmistakably a place to type.
 *
 * Two behaviours that are easy to get wrong and both matter here:
 *
 * - Autofocus on desktop only. Focusing this on a phone yanks the keyboard up
 *   the instant the page opens, which hides the headline, the openers, and the
 *   call button behind it. This page gets opened in an office lobby.
 * - The field is disabled only while a send is genuinely in flight, and never
 *   loses what was typed. Clearing on failure throws away the visitor's words.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  label,
  showLabel,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder: string;
  label: string;
  showLabel?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content instead of scrolling a two-line window.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (!autoFocus) return;
    // Pointer-coarse is the honest test for "this is a touch keyboard", far
    // more reliable than a viewport width guess.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) ref.current?.focus();
  }, [autoFocus]);

  const canSend = value.trim().length > 0 && !disabled;

  /*
   * Focus is tracked in state and painted with inline styles rather than with
   * `focus-within:` utilities, because two separate things were silently
   * defeating the ring on the most important control on the page:
   *
   * 1. `focus:outline-none` on the textarea killed the global `:focus-visible`
   *    rule from globals.css, and nothing replaced it.
   * 2. The `border-rule-strong` utility is not emitted by the build at all
   *    (verified in the browser: neither `.border-rule` nor `.border-rule-strong`
   *    exists in any stylesheet), so the resting border fell through to ink and
   *    `focus-within:border-ink` was a no-op. Both states were already ink, so
   *    focusing produced literally no visual change.
   *
   * Inline `var()` values cannot be dropped by utility generation, so the ring
   * is guaranteed. `:focus-visible` is checked explicitly so a keyboard user
   * gets the 2px ink ring while a mouse click gets only the border shift.
   */
  const [ringVisible, setRingVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div className={className}>
      <label
        htmlFor="prompt"
        className={cn(
          "block font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3",
          showLabel ? "mb-2" : "sr-only",
        )}
      >
        {label}
      </label>

      <div
        className={cn(
          "flex items-end gap-2 rounded-[var(--radius-control)] border bg-surface p-2",
          "transition-colors duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
        style={{
          borderColor: focused ? "var(--color-ink)" : "var(--color-rule-strong)",
          ...(ringVisible
            ? {
                outline: "2px solid var(--color-ink)",
                outlineOffset: "2px",
              }
            : null),
        }}
      >
        <textarea
          id="prompt"
          ref={ref}
          value={value}
          disabled={disabled}
          onFocus={(e) => {
            setFocused(true);
            // Only a keyboard focus earns the ring; a mouse click gets the
            // border shift, which is the standard focus-visible contract.
            setRingVisible(e.target.matches(":focus-visible"));
          }}
          onBlur={() => {
            setFocused(false);
            setRingVisible(false);
          }}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className={cn(
            "min-h-[44px] w-full flex-1 resize-none bg-transparent px-3 py-3",
            "text-[1rem] leading-[1.5] text-ink placeholder:text-ink-4",
            "focus:outline-none disabled:cursor-not-allowed disabled:text-ink-3",
          )}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)]",
            "transition-colors duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
            "",
            canSend
              ? "bg-ink text-paper hover:bg-[var(--color-ink-lift)] active:scale-[0.99]"
              : "cursor-not-allowed bg-sunken text-ink-4",
          )}
        >
          <IconSend className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Worth saying once, on the surface where the box is the whole point.
          Repeating it under the docked composer is noise, and it crowds the
          bottom edge of the viewport on a phone. */}
      {showLabel && (
        <p className="mt-2 font-mono text-[0.6875rem] text-ink-4">
          Enter to send, Shift plus Enter for a new line
        </p>
      )}
    </div>
  );
}
