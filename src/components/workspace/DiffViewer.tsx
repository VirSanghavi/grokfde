"use client";

import { cn } from "@/lib/utils";
import type { FileOperation } from "@/types/ui";
import { useMemo } from "react";

/**
 * Unified diff, read the way an engineer reads one: real line numbers on both
 * sides, one hunk header per hunk, and code that stays legible. Additions and
 * removals are marked by a gutter glyph and a faint tint, never by colouring
 * the code itself, because green-on-white source is harder to read than the
 * source it replaced.
 */

type Row =
  | { kind: "hunk"; text: string; heading: string }
  | { kind: "context" | "add" | "del"; oldNo: number | null; newNo: number | null; text: string }
  | { kind: "note"; text: string };

function parseUnifiedDiff(diff: string): { rows: Row[]; additions: number; deletions: number } {
  const rows: Row[] = [];
  let additions = 0;
  let deletions = 0;
  let oldNo = 0;
  let newNo = 0;
  let seenHunk = false;

  for (const line of diff.split("\n")) {
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode")
    ) {
      continue;
    }

    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      seenHunk = true;
      rows.push({ kind: "hunk", text: line.slice(0, line.indexOf("@@", 2) + 2), heading: hunk[3].trim() });
      continue;
    }

    if (line.startsWith("\\")) {
      rows.push({ kind: "note", text: line.replace(/^\\\s*/, "") });
      continue;
    }

    // A file with no hunk header at all (a whole-file create) still renders.
    if (!seenHunk && !line) continue;

    if (line.startsWith("+")) {
      additions += 1;
      rows.push({ kind: "add", oldNo: null, newNo: newNo++, text: line.slice(1) });
    } else if (line.startsWith("-")) {
      deletions += 1;
      rows.push({ kind: "del", oldNo: oldNo++, newNo: null, text: line.slice(1) });
    } else {
      rows.push({
        kind: "context",
        oldNo: oldNo++,
        newNo: newNo++,
        text: line.startsWith(" ") ? line.slice(1) : line,
      });
    }
  }

  return { rows, additions, deletions };
}

const OPERATION_LABEL: Record<string, string> = {
  create: "New file",
  modify: "Modified",
  delete: "Deleted",
  rename: "Renamed",
};

export function DiffViewer({
  path,
  operation,
  diff,
  loading,
  className,
}: {
  path: string;
  operation: FileOperation | string;
  diff?: string;
  loading?: boolean;
  className?: string;
}) {
  const parsed = useMemo(() => parseUnifiedDiff(diff || ""), [diff]);

  return (
    <section className={cn("min-w-0", className)} aria-label={`Diff for ${path}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
        <h3 className="min-w-0 break-all font-mono text-[0.8125rem] leading-5 text-ink">{path}</h3>
        <p className="shrink-0 text-[0.8125rem] text-ink-3">
          {OPERATION_LABEL[operation] || operation}
          {parsed.rows.length > 0 && (
            <>
              {"  "}
              <span className="font-mono tabular-nums text-positive">+{parsed.additions}</span>{" "}
              <span className="font-mono tabular-nums text-critical">
                {"−"}
                {parsed.deletions}
              </span>
            </>
          )}
        </p>
      </header>

      {loading ? (
        <DiffSkeleton />
      ) : parsed.rows.length === 0 ? (
        <p className="py-6 text-[0.9375rem] text-ink-3">
          No diff was recorded for this file. Rerun the build to regenerate it.
        </p>
      ) : (
        <div className="mt-1 max-h-[min(60vh,560px)] overflow-auto scrollbar-thin">
          <table className="w-full border-collapse font-mono text-[0.75rem] leading-[1.6] sm:text-[0.8125rem]">
            <tbody>
              {parsed.rows.map((row, i) => {
                if (row.kind === "hunk") {
                  return (
                    <tr key={i} className="bg-sunken">
                      <td colSpan={3} className="px-2 py-1 text-ink-3 sm:px-3">
                        <span className="tabular-nums">{row.text}</span>
                        {row.heading && <span className="ml-3 text-ink-4">{row.heading}</span>}
                      </td>
                    </tr>
                  );
                }
                if (row.kind === "note") {
                  return (
                    <tr key={i}>
                      <td colSpan={3} className="px-2 py-1 text-ink-4 sm:px-3">
                        {row.text}
                      </td>
                    </tr>
                  );
                }
                const add = row.kind === "add";
                const del = row.kind === "del";
                return (
                  <tr
                    key={i}
                    className={cn(
                      add && "bg-positive-soft",
                      del && "bg-critical-soft",
                    )}
                  >
                    <LineNumber value={row.oldNo} />
                    <LineNumber value={row.newNo} />
                    <td className="w-full whitespace-pre py-0 pl-2 pr-4 text-ink">
                      <span
                        aria-hidden
                        className={cn(
                          "mr-2 inline-block w-2 select-none",
                          add && "text-positive",
                          del && "text-critical",
                          !add && !del && "text-transparent",
                        )}
                      >
                        {add ? "+" : del ? "−" : " "}
                      </span>
                      {row.text || " "}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LineNumber({ value }: { value: number | null }) {
  return (
    <td className="w-[2.75rem] min-w-[2.75rem] select-none py-0 pr-2 text-right align-top tabular-nums text-ink-4 sm:w-[3.25rem] sm:min-w-[3.25rem]">
      {value ?? ""}
    </td>
  );
}

function DiffSkeleton() {
  const widths = ["72%", "54%", "88%", "41%", "66%", "78%", "35%", "60%"];
  return (
    <div className="mt-2 space-y-1.5" aria-hidden>
      {widths.map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="h-3 w-8 rounded-[2px] bg-sunken" />
          <span className="h-3 rounded-[2px] bg-sunken" style={{ width: w }} />
        </div>
      ))}
      <span className="sr-only">Loading diff</span>
    </div>
  );
}
