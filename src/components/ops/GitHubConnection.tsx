"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Connect the company's repository, once, from the agent's own settings.
 *
 * The connection used to live inside a single prospect's implementation
 * workspace, which meant there was no way to answer "connect our GitHub" and
 * every conversation started from an unconnected repository. This is the
 * company-level surface: what the server can reach, which repositories it can
 * actually branch, and which one this agent works on.
 *
 * Repositories the token can only read are filtered out upstream, because one
 * the agent cannot branch is one it cannot open a pull request against, and
 * offering it here would only fail later.
 */

type Status =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "disconnected"; reason: string }
  | { phase: "ready"; login: string; remaining: number | null };

type Repo = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  openIssues: number;
};

type Connection = {
  fullName: string;
  url: string | null;
  defaultBranch: string;
  private: boolean;
};

export function GitHubConnection({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState<Status>({ phase: "loading" });
  const [connection, setConnection] = useState<Connection | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setStatus({ phase: "loading" });
    setActionError(null);
    try {
      const [statusRes, connRes] = await Promise.all([
        fetch("/api/github/status", { cache: "no-store" }),
        fetch(`/api/github/connection?companyId=${encodeURIComponent(companyId)}`, {
          cache: "no-store",
        }),
      ]);
      const statusBody = await statusRes.json();
      if (!statusRes.ok) {
        setStatus({
          phase: "error",
          message: statusBody?.error?.message ?? "GitHub could not be reached.",
        });
        return;
      }
      if (connRes.ok) {
        const connBody = await connRes.json();
        setConnection(connBody?.connection ?? null);
      }
      if (!statusBody.connected) {
        setStatus({
          phase: "disconnected",
          reason: statusBody.reason ?? "GitHub is not configured on this deployment.",
        });
        return;
      }
      setStatus({
        phase: "ready",
        login: statusBody.user?.login ?? "unknown",
        remaining: statusBody.rateLimit?.remaining ?? null,
      });
    } catch {
      setStatus({ phase: "error", message: "GitHub could not be reached." });
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadRepos = useCallback(async () => {
    setReposError(null);
    try {
      const res = await fetch("/api/github/repos", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not list repositories.");
      setRepos((body.repositories ?? []) as Repo[]);
    } catch (err) {
      setRepos([]);
      setReposError(err instanceof Error ? err.message : "Could not list repositories.");
    }
  }, []);

  function beginPicking() {
    setPicking(true);
    setActionError(null);
    if (!repos) void loadRepos();
    // The list can be long, so the cursor starts where it is useful.
    window.setTimeout(() => filterRef.current?.focus(), 0);
  }

  async function connect(fullName: string) {
    setBusy(fullName);
    setActionError(null);
    try {
      const res = await fetch("/api/github/connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, repository: fullName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not connect that repository.");
      setConnection(body.connection as Connection);
      setPicking(false);
      setFilter("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not connect that repository.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("__disconnect__");
    setActionError(null);
    try {
      const res = await fetch(
        `/api/github/connection?companyId=${encodeURIComponent(companyId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Could not disconnect.");
      }
      setConnection(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setBusy(null);
    }
  }

  const shown = useMemo(() => {
    if (!repos) return [];
    const q = filter.trim().toLowerCase();
    const matched = q
      ? repos.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q),
        )
      : repos;
    return matched.slice(0, 40);
  }, [repos, filter]);

  if (status.phase === "loading") {
    return (
      <div className="space-y-2" aria-hidden>
        <div className="skeleton h-4 w-[42%]" />
        <div className="skeleton h-4 w-[28%]" />
      </div>
    );
  }

  if (status.phase === "error") {
    return (
      <div>
        <p className="max-w-[64ch] text-body text-ink-2">{status.message}</p>
        <Button size="md" variant="secondary" className="mt-3" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (status.phase === "disconnected") {
    return (
      <div>
        <p className="max-w-[64ch] text-body text-ink-2">{status.reason}</p>
        <p className="mt-2 max-w-[64ch] text-caption">
          Set <span className="font-mono text-[0.8125rem]">GITHUB_TOKEN</span> on the
          deployment with repo scope, then reload. Without it the agent can read your
          documentation but cannot branch, commit, or open a pull request.
        </p>
        <Button size="md" variant="secondary" className="mt-3" onClick={() => void load()}>
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-body text-ink">
          Connected as <span className="font-mono text-[0.875rem]">{status.login}</span>
        </p>
        {status.remaining !== null && (
          <p className="font-mono text-[0.8125rem] tabular-nums text-ink-3">
            {status.remaining} API calls left this hour
          </p>
        )}
      </div>

      {connection ? (
        <div className="mt-4 border-t border-rule pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div className="min-w-0">
              <p className="truncate font-mono text-[0.9375rem] text-ink">
                {connection.fullName}
              </p>
              <p className="mt-1 text-caption">
                Default branch{" "}
                <span className="font-mono text-[0.8125rem]">{connection.defaultBranch}</span>
                {connection.private ? " · private" : " · public"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {connection.url && (
                <a
                  href={connection.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-rule-strong px-4 text-[0.9375rem] font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-hover active:scale-[0.99]"
                >
                  Open on GitHub
                </a>
              )}
              <Button size="md" variant="secondary" onClick={beginPicking}>
                Change
              </Button>
              <Button
                size="md"
                variant="secondary"
                loading={busy === "__disconnect__"}
                onClick={() => void disconnect()}
              >
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      ) : (
        !picking && (
          <div className="mt-4 border-t border-rule pt-4">
            <p className="max-w-[64ch] text-body text-ink-2">
              No repository yet. Connect one and the agent reads it on every chat and
              every call, works your issues against it, and opens pull requests on a
              branch. It never pushes to your default branch.
            </p>
            <Button size="md" className="mt-3" onClick={beginPicking}>
              Connect a repository
            </Button>
          </div>
        )
      )}

      {picking && (
        <div className="mt-4 border-t border-rule pt-4">
          <label htmlFor="repo-filter" className="sr-only">
            Filter repositories
          </label>
          <input
            ref={filterRef}
            id="repo-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter repositories"
            className={cn(
              "h-11 w-full max-w-[26rem] rounded-[var(--radius-control)] border border-rule bg-surface px-3.5",
              "text-body text-ink placeholder:text-ink-4",
              "transition-[border-color] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
              "hover:border-rule-strong focus:border-rule-strong",
            )}
          />

          {repos === null ? (
            <div className="mt-4 space-y-2" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="skeleton h-5 w-full" />
              ))}
            </div>
          ) : reposError ? (
            <div className="mt-4">
              <p className="text-body text-ink-2">{reposError}</p>
              <Button size="md" variant="secondary" className="mt-3" onClick={() => void loadRepos()}>
                Try again
              </Button>
            </div>
          ) : shown.length === 0 ? (
            <p className="mt-4 max-w-[64ch] text-body text-ink-2">
              {filter.trim()
                ? "Nothing matches that."
                : "This token cannot push to any repository, so there is none the agent could branch."}
            </p>
          ) : (
            <ul className="mt-4 border-t border-rule">
              {shown.map((repo) => (
                <li key={repo.fullName} className="border-b border-rule">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void connect(repo.fullName)}
                    className={cn(
                      "flex min-h-11 w-full items-baseline justify-between gap-6 py-3 text-left",
                      "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                      "hover:bg-hover disabled:cursor-not-allowed disabled:text-ink-4",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[0.875rem] text-ink">
                        {repo.fullName}
                      </span>
                      {repo.description && (
                        <span className="mt-0.5 block max-w-[68ch] truncate text-caption">
                          {repo.description}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[0.8125rem] tabular-nums text-ink-3">
                      {busy === repo.fullName
                        ? "Connecting"
                        : `${repo.openIssues} open`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button
            size="md"
            variant="secondary"
            className="mt-4"
            onClick={() => {
              setPicking(false);
              setFilter("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-3 max-w-[64ch] text-body text-critical">
          {actionError}
        </p>
      )}
    </div>
  );
}
