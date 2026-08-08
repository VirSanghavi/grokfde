"use client";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { FileOperation } from "@/types/ui";

export function DiffViewer({
  path,
  operation,
  diff,
}: {
  path: string;
  operation: FileOperation;
  diff?: string;
}) {
  const lines = (diff || "").split("\n");

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-bg-elevated shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="truncate font-mono text-sm text-fg">{path}</p>
        <Badge
          tone={
            operation === "create" ? "success" : operation === "delete" ? "danger" : "info"
          }
        >
          {operation}
        </Badge>
      </div>
      <pre className="max-h-[420px] overflow-auto p-0 font-mono text-[12px] leading-5 scrollbar-thin">
        {lines.length === 0 || (lines.length === 1 && !lines[0]) ? (
          <div className="px-4 py-6 text-sm text-fg-muted">No diff available.</div>
        ) : (
          lines.map((line, i) => {
            const isAdd = line.startsWith("+");
            const isDel = line.startsWith("-") && !line.startsWith("---");
            const isMeta = line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ");
            return (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-all px-4 py-0.5",
                  isAdd && "bg-success/10 text-success",
                  isDel && "bg-danger/10 text-danger",
                  isMeta && "bg-bg text-fg-faint",
                  !isAdd && !isDel && !isMeta && "text-fg-secondary"
                )}
              >
                {line || " "}
              </div>
            );
          })
        )}
      </pre>
    </div>
  );
}
