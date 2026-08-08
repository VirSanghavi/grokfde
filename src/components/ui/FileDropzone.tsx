"use client";

import { cn } from "@/lib/utils";
import { IconUpload } from "@/components/icons";

import { useCallback, useState } from "react";

export function FileDropzone({
  onFiles,
  className,
  label = "Drop files here or click to browse",
  hint = "PDF, Markdown, TXT, DOCX",
}: {
  onFiles: (files: File[]) => void;
  className?: string;
  label?: string;
  hint?: string;
}) {
  const [dragging, setDragging] = useState(false);

  const handle = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      onFiles(Array.from(files));
    },
    [onFiles]
  );

  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-dashed px-6 py-10 text-center transition-colors",
        dragging
          ? "border-brand bg-brand-dim"
          : "border-border-strong bg-bg hover:border-fg-faint hover:bg-bg-hover",
        className
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg-surface text-fg-secondary">
        <IconUpload className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-fg">{label}</p>
        <p className="mt-1 font-mono text-xs text-fg-muted">{hint}</p>
      </div>
      <input
        type="file"
        className="sr-only"
        multiple
        onChange={(e) => handle(e.target.files)}
      />
    </label>
  );
}
