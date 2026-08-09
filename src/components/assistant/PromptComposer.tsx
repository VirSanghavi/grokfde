"use client";

import {
  IconArrowRight,
  IconLoader,
  IconPlus,
  IconSend,
  IconVideo,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  loading?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
  footerLeft?: ReactNode;
  className?: string;
  autoFocus?: boolean;
  /** Show video-meet affordance */
  onStartMeet?: () => void;
};

export function PromptComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask Atlas anything…",
  loading,
  expanded,
  onExpand,
  footerLeft,
  className,
  autoFocus,
  onStartMeet,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, expanded ? 200 : 120)}px`;
  }, [value, expanded]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && value.trim()) onSubmit();
    }
  }

  return (
    <div
      className={cn(
        "rounded-[20px] border border-border bg-bg-elevated shadow-md transition-premium",
        "focus-within:border-border-strong focus-within:shadow-lg",
        expanded ? "min-h-[120px]" : "min-h-[88px]",
        className,
      )}
      onClick={() => {
        onExpand?.();
        ref.current?.focus();
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onExpand?.();
        }}
        onFocus={() => onExpand?.()}
        onKeyDown={onKeyDown}
        rows={expanded ? 3 : 2}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-5 pt-4 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-faint"
        disabled={loading}
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {footerLeft ?? (
            <>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 text-xs text-fg-muted">
                <IconPlus size={14} />
                Context
              </span>
              {onStartMeet && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartMeet();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 text-xs font-medium text-fg-secondary transition-premium hover:bg-bg-hover"
                >
                  <IconVideo size={14} />
                  Meet
                </button>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          disabled={loading || !value.trim()}
          onClick={(e) => {
            e.stopPropagation();
            onSubmit();
          }}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-premium",
            value.trim() && !loading
              ? "bg-brand text-brand-fg shadow-sm hover:bg-brand-strong"
              : "bg-bg-hover text-fg-faint",
          )}
          aria-label="Send"
        >
          {loading ? (
            <IconLoader size={16} className="animate-spin" />
          ) : (
            <IconArrowRight size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

export function PromptSendIcon() {
  return <IconSend size={16} />;
}
