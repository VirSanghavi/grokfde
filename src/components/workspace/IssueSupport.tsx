"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

/**
 * Support tickets, except they are the customer's own GitHub issues. The
 * agent reads the thread and the repository, drafts a reply with the company's real
 * knowledge, and posts it only when a human presses the button. Drafting is
 * free and reversible. Posting is public and permanent, so it is a separate,
 * deliberate action with the body editable first.
 */

type Issue = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  htmlUrl: string;
  author: string;
  labels: string[];
  comments: number;
  updatedAt: string;
};

type Comment = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  htmlUrl: string;
};

type ListState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; issues: Issue[] };

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function IssueSupport({
  repositoryName,
  companyId,
  agentName,
}: {
  repositoryName: string;
  companyId: string;
  agentName: string;
}) {
  const [list, setList] = useState<ListState>({ phase: "loading" });
  const [selected, setSelected] = useState<number | null>(null);
  const [thread, setThread] = useState<{ issue: Issue; comments: Comment[] } | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postedUrl, setPostedUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadIssues = useCallback(async () => {
    setList({ phase: "loading" });
    try {
      const res = await fetch(
        `/api/github/issues?repo=${encodeURIComponent(repositoryName)}&state=open`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        setList({ phase: "error", message: data?.error?.message || "Could not load issues." });
        return;
      }
      setList({ phase: "ready", issues: data.issues as Issue[] });
    } catch (err) {
      setList({
        phase: "error",
        message: err instanceof Error ? err.message : "Could not load issues.",
      });
    }
  }, [repositoryName]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const openIssue = useCallback(
    async (number: number) => {
      setSelected(number);
      setThread(null);
      setThreadError(null);
      setDraft("");
      setPostedUrl(null);
      setActionError(null);
      try {
        const res = await fetch(
          `/api/github/issues/${number}?repo=${encodeURIComponent(repositoryName)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!res.ok) {
          setThreadError(data?.error?.message || "Could not load that issue.");
          return;
        }
        setThread({ issue: data.issue as Issue, comments: data.comments as Comment[] });
      } catch (err) {
        setThreadError(err instanceof Error ? err.message : "Could not load that issue.");
      }
    },
    [repositoryName],
  );

  async function generateDraft() {
    if (!thread) return;
    setDrafting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/github/issues/${thread.issue.number}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: repositoryName, companyId, post: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data?.error?.message || `${agentName} could not draft a reply.`);
        return;
      }
      setDraft(data.draft as string);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `${agentName} could not draft a reply.`);
    } finally {
      setDrafting(false);
    }
  }

  async function postReply() {
    if (!thread || !draft.trim()) return;
    setPosting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/github/issues/${thread.issue.number}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: repositoryName, companyId, post: true, body: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data?.error?.message || "Could not post the reply.");
        return;
      }
      setPostedUrl(data.commentUrl as string);
      setThread({ issue: data.issue as Issue, comments: data.comments as Comment[] });
      loadIssues();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not post the reply.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <section aria-labelledby="issues-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2
          id="issues-heading"
          className="text-[1.25rem] font-semibold tracking-[-0.025em] text-ink sm:text-[1.5rem]"
        >
          Open issues
        </h2>
        <p className="font-mono text-[0.8125rem] text-ink-3">{repositoryName}</p>
      </div>
      <p className="mt-1 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
        {agentName} answers with your company knowledge and this repository&apos;s real files.
        Nothing is posted until you read it and press post.
      </p>

      <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(260px,20rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          {list.phase === "loading" && (
            <ul className="space-y-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li key={i} className="border-b border-rule pb-3">
                  <span className="block h-3.5 rounded-[2px] bg-sunken" style={{ width: `${88 - i * 12}%` }} />
                  <span className="mt-2 block h-3 w-24 rounded-[2px] bg-sunken" />
                </li>
              ))}
            </ul>
          )}

          {list.phase === "error" && (
            <div role="alert">
              <p className="text-[0.9375rem] leading-6 text-ink-2">{list.message}</p>
              <Button className="mt-3" size="sm" variant="secondary" onClick={loadIssues}>
                Try again
              </Button>
            </div>
          )}

          {list.phase === "ready" && list.issues.length === 0 && (
            <p className="max-w-[68ch] text-[0.9375rem] leading-6 text-ink-3">
              There are no open issues on this repository. Open one on GitHub and it will appear
              here for {agentName} to answer.
            </p>
          )}

          {list.phase === "ready" && list.issues.length > 0 && (
            <ul className="-mx-2 divide-y divide-rule">
              {list.issues.map((issue) => {
                const active = selected === issue.number;
                return (
                  <li key={issue.number}>
                    <button
                      type="button"
                      onClick={() => openIssue(issue.number)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "w-full min-h-11 rounded-[4px] px-2 py-3 text-left transition-colors duration-[120ms]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                        active ? "bg-active" : "hover:bg-hover",
                      )}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[0.8125rem] tabular-nums text-ink-4">
                          #{issue.number}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 text-[0.9375rem] leading-6",
                            active ? "text-ink" : "text-ink-2",
                          )}
                        >
                          {issue.title}
                        </span>
                      </span>
                      <span className="mt-1 block text-[0.8125rem] text-ink-4">
                        {issue.author} · {shortDate(issue.updatedAt)} · {issue.comments}{" "}
                        {issue.comments === 1 ? "reply" : "replies"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {!selected && (
            <p className="text-[0.9375rem] leading-6 text-ink-3">
              Select an issue to read the thread and draft a reply.
            </p>
          )}

          {selected && threadError && (
            <div role="alert">
              <p className="text-[0.9375rem] leading-6 text-ink-2">{threadError}</p>
              <Button className="mt-3" size="sm" variant="secondary" onClick={() => openIssue(selected)}>
                Try again
              </Button>
            </div>
          )}

          {selected && !thread && !threadError && (
            <div className="space-y-3" aria-hidden>
              <span className="block h-4 w-2/3 rounded-[2px] bg-sunken" />
              <span className="block h-3 w-full rounded-[2px] bg-sunken" />
              <span className="block h-3 w-11/12 rounded-[2px] bg-sunken" />
              <span className="block h-3 w-4/5 rounded-[2px] bg-sunken" />
            </div>
          )}

          {thread && (
            <article className="min-w-0">
              <h3 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
                <a
                  href={thread.issue.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                >
                  {thread.issue.title}
                </a>
              </h3>
              <p className="mt-1 font-mono text-[0.8125rem] text-ink-4">
                #{thread.issue.number} opened by {thread.issue.author}
              </p>

              <div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words border-l-0 pr-1 text-[0.9375rem] leading-6 text-ink-2 scrollbar-thin">
                {thread.issue.body || "This issue has no description."}
              </div>

              {thread.comments.length > 0 && (
                <ol className="mt-4 divide-y divide-rule border-t border-rule">
                  {thread.comments.map((c) => (
                    <li key={c.id} className="py-3">
                      <p className="font-mono text-[0.75rem] text-ink-4">
                        {c.author} · {shortDate(c.createdAt)}
                      </p>
                      <p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[0.9375rem] leading-6 text-ink-2 scrollbar-thin">
                        {c.body}
                      </p>
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-5 border-t border-rule pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h4 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
                    {agentName}&apos;s reply
                  </h4>
                  <Button size="sm" variant="secondary" loading={drafting} loadingLabel="Drafting" onClick={generateDraft}>
                    {draft ? "Draft again" : "Draft a reply"}
                  </Button>
                </div>

                {drafting && !draft && (
                  <div className="mt-3 space-y-2" aria-hidden>
                    <span className="block h-3 w-full rounded-[2px] bg-sunken" />
                    <span className="block h-3 w-11/12 rounded-[2px] bg-sunken" />
                    <span className="block h-3 w-3/4 rounded-[2px] bg-sunken" />
                  </div>
                )}

                {!drafting && !draft && (
                  <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-3">
                    Nothing drafted yet. {agentName} reads the thread, your knowledge base, and the
                    repository tree before writing.
                  </p>
                )}

                {draft && (
                  <>
                    <label htmlFor="issue-reply" className="mt-3 block text-[0.8125rem] text-ink-2">
                      Edit before posting
                    </label>
                    <textarea
                      id="issue-reply"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={14}
                      className="mt-1 w-full resize-y border border-rule-strong bg-surface px-3 py-2 font-mono text-[0.8125rem] leading-6 text-ink outline-none transition-colors duration-[120ms] focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      style={{ borderRadius: 4 }}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <Button loading={posting} loadingLabel="Posting" onClick={postReply}>
                        Post to GitHub
                      </Button>
                      <p className="text-[0.8125rem] text-ink-3">
                        Posts publicly on issue #{thread.issue.number}.
                      </p>
                    </div>
                  </>
                )}

                {postedUrl && (
                  <p className="mt-3 text-[0.9375rem] leading-6 text-ink-2">
                    Posted.{" "}
                    <a
                      href={postedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                    >
                      Read it on GitHub
                    </a>
                  </p>
                )}

                {actionError && (
                  <p role="alert" className="mt-3 max-w-[68ch] text-[0.9375rem] leading-6 text-critical">
                    {actionError}
                  </p>
                )}
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
