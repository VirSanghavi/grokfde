"use client";

import { cn } from "@/lib/utils";
import { IconUpload } from "@/components/icons";
import { useCallback, useId, useRef, useState, type DragEvent } from "react";

/**
 * Drop target backed by a real file input, so it works with a keyboard, with a
 * screen reader, and with drag and drop. The focus ring lands on the whole
 * target because the input itself is visually hidden.
 */
export function FileDropzone({
  onFiles,
  className,
  label = "Drop files here, or browse",
  hint = "PDF, Markdown, TXT, DOCX",
  accept,
  multiple = true,
  disabled = false,
  busy = false,
  error,
}: {
  onFiles: (files: File[]) => void;
  className?: string;
  label?: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** True while the previous drop is still uploading. */
  busy?: boolean;
  error?: string;
}) {
  const inputId = `dropzone-${useId()}`;
  const messageId = `${inputId}-message`;
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child, so depth beats a boolean.
  const depth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const accepted = useCallback(
    (files: FileList | null) => {
      if (disabled || busy) return;
      if (!files?.length) return;
      onFiles(Array.from(files));
      // Allow re-selecting the same file immediately after.
      if (inputRef.current) inputRef.current.value = "";
    },
    [disabled, busy, onFiles],
  );

  const stop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          stop(event);
          depth.current += 1;
          if (!disabled && !busy) setDragging(true);
        }}
        onDragOver={stop}
        onDragLeave={(event) => {
          stop(event);
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          stop(event);
          depth.current = 0;
          setDragging(false);
          accepted(event.dataTransfer.files);
        }}
        className={cn(
          "transition-premium flex flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border border-dashed px-6 py-10 text-center",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink",
          disabled || busy
            ? "cursor-not-allowed border-rule bg-sunken"
            : "cursor-pointer bg-paper hover:border-ink-4 hover:bg-hover active:bg-active",
          dragging && !disabled && !busy && "border-live bg-live-soft",
          error && !dragging && "border-critical",
          !dragging && !error && !disabled && !busy && "border-rule-strong",
          className,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border",
            dragging
              ? "border-live-rule bg-surface text-live"
              : "border-rule bg-surface text-ink-3",
          )}
        >
          <IconUpload size={20} />
        </span>

        <span className="flex flex-col gap-1">
          <span
            className={cn(
              // "Uploading" is live status, so it stays at full ink. Only the
              // genuinely disabled target fades.
              "text-[0.9375rem] font-medium",
              disabled ? "text-ink-4" : "text-ink",
            )}
          >
            {busy ? "Uploading" : dragging ? "Release to add" : label}
          </span>
          <span className="text-label">{hint}</span>
        </span>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled || busy}
          aria-describedby={error ? messageId : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(event) => accepted(event.target.files)}
        />
      </label>

      {error && (
        <p id={messageId} role="alert" className="mt-1.5 text-[0.8125rem] text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
