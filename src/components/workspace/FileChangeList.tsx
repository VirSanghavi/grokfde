"use client";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { ImplementationFile } from "@/types/ui";
import { FileCode2 } from "lucide-react";

export function FileChangeList({
  files,
  selectedPath,
  onSelect,
}: {
  files: ImplementationFile[];
  selectedPath?: string | null;
  onSelect: (file: ImplementationFile) => void;
}) {
  if (!files.length) {
    return (
      <p className="text-sm text-fg-muted">No file changes yet.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="mb-2 text-xs text-fg-muted">
        {files.length} file{files.length === 1 ? "" : "s"} changed
      </p>
      {files.map((file) => {
        const active = selectedPath === file.path;
        const op =
          file.operation === "create" ? "+" : file.operation === "delete" ? "−" : "~";
        return (
          <button
            key={file.path}
            type="button"
            onClick={() => onSelect(file)}
            className={cn(
              "flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors",
              active
                ? "border-border-strong bg-bg-active"
                : "border-border bg-bg-elevated hover:bg-bg-hover"
            )}
          >
            <FileCode2 className="h-4 w-4 shrink-0 text-fg-faint" />
            <span
              className={cn(
                "w-4 shrink-0 font-mono text-sm font-semibold",
                file.operation === "create" && "text-success",
                file.operation === "delete" && "text-danger",
                file.operation === "modify" && "text-info"
              )}
            >
              {op}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">
              {file.path}
            </span>
            <Badge
              tone={
                file.operation === "create"
                  ? "success"
                  : file.operation === "delete"
                    ? "danger"
                    : "info"
              }
            >
              {file.operation}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
