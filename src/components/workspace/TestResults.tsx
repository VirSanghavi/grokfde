"use client";

import { cn } from "@/lib/utils";
import type { ImplementationTest } from "@/types/ui";
import { useState } from "react";

/**
 * Checks as a table, not a stack of cards. Output is hidden until asked for,
 * because eight expanded blobs of static-analysis text is not a review surface.
 *
 * "validated" is deliberately distinct from "passed": these are static checks,
 * not a runtime test suite, and saying otherwise would be a lie on screen.
 */

const STATUS_TEXT: Record<string, string> = {
  passed: "Passed",
  validated: "Validated",
  failed: "Failed",
  running: "Running",
  skipped: "Skipped",
  pending: "Pending",
};

const STATUS_DOT: Record<string, string> = {
  passed: "bg-positive",
  validated: "bg-positive",
  failed: "bg-critical",
  running: "bg-caution",
  skipped: "bg-ink-4",
  pending: "bg-ink-4",
};

export function TestResults({
  tests,
  loading,
}: {
  tests: ImplementationTest[];
  loading?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (loading) {
    return (
      <ul className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-3 rounded-[2px] bg-sunken" style={{ width: `${80 - i * 12}%` }} />
        ))}
      </ul>
    );
  }

  if (!tests.length) {
    return (
      <p className="text-[0.9375rem] leading-6 text-ink-3">
        No checks have run yet. They run automatically once the build writes files.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rule">
      {tests.map((test) => {
        const status = String(test.status).toLowerCase();
        const isOpen = open === test.name;
        return (
          <li key={test.name}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : test.name)}
              aria-expanded={isOpen}
              className="flex w-full min-h-11 items-baseline justify-between gap-4 py-2 text-left transition-colors duration-[120ms] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className="flex min-w-0 items-baseline gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full",
                    STATUS_DOT[status] || "bg-ink-4",
                  )}
                />
                <span className="min-w-0 break-words text-[0.9375rem] leading-6 text-ink-2">
                  {test.name}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-[0.8125rem]",
                  status === "failed" ? "text-critical" : "text-ink-3",
                )}
              >
                {STATUS_TEXT[status] || status}
              </span>
            </button>
            {isOpen && test.output && (
              <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap break-words bg-sunken px-3 py-2 font-mono text-[0.75rem] leading-5 text-ink-2 scrollbar-thin">
                {test.output}
              </pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}
