"use client";

import { IconArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

/**
 * A pull request the engineer opened, read live from the repository it opened it
 * on. The title, the branch, the file list, and the line counts are whatever
 * GitHub returns right now, so this cannot drift into a screenshot of something
 * that used to be true.
 *
 * It is the strongest claim on the page, so it is the one that is checkable:
 * the link goes to the actual pull request.
 */

type Showcase = {
  repo: string;
  number: number;
  title: string;
  state: string;
  branch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
  files: { path: string; additions: number; deletions: number }[];
};

const FILES_SHOWN = 6;

export function ShippedWork() {
  const [data, setData] = useState<Showcase | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/showcase/pull-request");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "unavailable");
      setData((body?.data ?? body) as Showcase);
      setState("ready");
    } catch {
      setData(null);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div aria-hidden>
        <div className="skeleton h-6 w-[60%]" />
        <div className="mt-3 skeleton h-4 w-[38%]" />
        <div className="mt-6 space-y-2 border-t border-rule pt-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-4 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div>
        <p className="max-w-[64ch] text-body-l text-ink-2">
          The repository is not reachable from here at the moment, so the latest
          pull request cannot be shown.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex h-11 items-center rounded-[var(--radius-control)] border border-rule-strong px-4 text-[15px] font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-hover active:scale-[0.99]"
        >
          Try again
        </button>
      </div>
    );
  }

  const files = expanded ? data.files : data.files.slice(0, FILES_SHOWN);
  const hidden = data.files.length - files.length;

  return (
    <div>
      <p className="font-mono text-[13px] text-ink-3">
        {data.repo} #{data.number}
      </p>
      <h3 className="mt-2 max-w-[46ch] text-display-m text-ink">{data.title}</h3>

      <dl className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-rule pt-4">
        <div className="flex items-baseline gap-2">
          <dt className="text-[13px] text-ink-3">Branch</dt>
          <dd className="font-mono text-[13px] text-ink">{data.branch}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-[13px] text-ink-3">Files</dt>
          <dd className="font-mono text-[13px] tabular-nums text-ink">{data.changedFiles}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-[13px] text-ink-3">Lines</dt>
          <dd className="font-mono text-[13px] tabular-nums text-ink">
            <span className="text-positive">+{data.additions}</span>
            {/* A pull request that deleted nothing should not display "-0" in
                red, which reads as a failure rather than as no deletions. */}
            {data.deletions > 0 && (
              <span className="pl-2 text-critical">-{data.deletions}</span>
            )}
          </dd>
        </div>
      </dl>

      <ul className="mt-5 border-t border-rule">
        {files.map((file) => (
          <li
            key={file.path}
            className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5"
          >
            <span className="min-w-0 truncate font-mono text-[13px] text-ink-2">
              {file.path}
            </span>
            <span className="shrink-0 font-mono text-[13px] tabular-nums">
              <span className="text-positive">+{file.additions}</span>
              {file.deletions > 0 && (
                <span className="pl-2 text-critical">-{file.deletions}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-rule-strong px-4 text-[15px] font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-hover active:scale-[0.99]"
          >
            Show {hidden} more {hidden === 1 ? "file" : "files"}
          </button>
        )}
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "group inline-flex min-h-11 items-center gap-2 text-body font-medium text-ink",
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:text-ink-2",
          )}
        >
          Read it on GitHub
          <IconArrowRight
            size={14}
            className="shrink-0 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
          />
        </a>
      </div>
    </div>
  );
}
