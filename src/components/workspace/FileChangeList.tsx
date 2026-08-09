"use client";

import { cn } from "@/lib/utils";
import type { ImplementationFile } from "@/types/ui";

/**
 * A list of touched paths, not a stack of cards. Selection is a hairline rule
 * and a weight change, which is all a list of eight files needs.
 */

const MARKER: Record<string, string> = { create: "+", modify: "~", delete: "−" };

export function FileChangeList({
  files,
  selectedPath,
  onSelect,
  loading,
}: {
  files: ImplementationFile[];
  selectedPath?: string | null;
  onSelect: (file: ImplementationFile) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <ul className="space-y-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-[2px] bg-sunken" />
            <span className="h-3 flex-1 rounded-[2px] bg-sunken" style={{ maxWidth: `${70 - i * 9}%` }} />
          </li>
        ))}
      </ul>
    );
  }

  if (!files.length) {
    return (
      <p className="text-[0.9375rem] leading-6 text-ink-3">
        No files have been written yet. They appear here once you approve the plan.
      </p>
    );
  }

  return (
    <ul className="-mx-2">
      {files.map((file) => {
        const active = selectedPath === file.path;
        return (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => onSelect(file)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full min-h-11 items-center gap-3 rounded-[4px] px-2 py-2 text-left transition-colors duration-[120ms]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                active ? "bg-active" : "hover:bg-hover",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "w-3 shrink-0 font-mono text-[0.875rem] font-medium",
                  file.operation === "create" && "text-positive",
                  file.operation === "delete" && "text-critical",
                  file.operation === "modify" && "text-ink-3",
                )}
              >
                {MARKER[file.operation] ?? "~"}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono text-[0.8125rem]",
                  active ? "text-ink" : "text-ink-2",
                )}
                title={file.path}
              >
                {file.path}
              </span>
              <span className="sr-only">{file.operation}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
