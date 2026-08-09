"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Connects the workspace to a repository the agent can actually branch. The list
 * comes from GitHub and is already filtered to repositories the server token
 * can push to, because offering one it cannot push to would only fail later.
 *
 * The offline sample is available too, and it says out loud that it is a
 * sample. A demo that quietly falls back to a fixture is how a product ends up
 * claiming a pull request it never opened.
 */

export type ConnectedRepository = {
  id: string;
  repositoryName: string;
  repositoryUrl: string | null;
  defaultBranch: string;
  provider: "demo" | "github";
  mode: "real" | "offline-fixture";
  status: string;
};

type Repo = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  pushedAt: string | null;
  openIssues: number;
};

type Status =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "disconnected"; reason: string }
  | { phase: "ready"; login: string };

function relativeDay(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function RepositoryPicker({
  workspaceId,
  agentName,
  onConnected,
}: {
  workspaceId: string;
  agentName: string;
  onConnected: (repo: ConnectedRepository) => void;
}) {
  const [status, setStatus] = useState<Status>({ phase: "loading" });
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus({ phase: "loading" });
    setReposError(null);
    try {
      const res = await fetch("/api/github/status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ phase: "error", message: data?.error?.message || "Could not reach GitHub." });
        return;
      }
      if (!data.connected) {
        setStatus({ phase: "disconnected", reason: data.reason || "GitHub is not configured." });
        return;
      }
      setStatus({ phase: "ready", login: data.user.login });

      const listRes = await fetch("/api/github/repos", { cache: "no-store" });
      const listData = await listRes.json();
      if (!listRes.ok) {
        setReposError(listData?.error?.message || "Could not list repositories.");
        setRepos([]);
        return;
      }
      setRepos(listData.repositories as Repo[]);
    } catch (err) {
      setStatus({
        phase: "error",
        message: err instanceof Error ? err.message : "Could not reach GitHub.",
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = repos ?? [];
    return q ? list.filter((r) => r.fullName.toLowerCase().includes(q)) : list;
  }, [repos, filter]);

  async function connect(body: Record<string, unknown>, key: string) {
    setConnecting(key);
    setConnectError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data?.error?.message || "Could not connect that repository.");
        return;
      }
      onConnected(data as ConnectedRepository);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Could not connect that repository.");
    } finally {
      setConnecting(null);
    }
  }

  return (
    <section aria-labelledby="connect-heading" className="max-w-none">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
        Step 1 of 4
      </p>
      <h2 id="connect-heading" className="mt-2 text-[1.5rem] font-semibold tracking-[-0.025em] text-ink sm:text-[2rem]">
        Connect the repository
      </h2>
      <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
        {agentName} reads the codebase, proposes a change, writes it to a new branch, and opens a
        pull request. It never commits to your default branch and it never touches secrets.
      </p>

      {status.phase === "loading" && <RepoSkeleton />}

      {status.phase === "error" && (
        <Retryable
          title="GitHub did not answer"
          message={status.message}
          onRetry={load}
        />
      )}

      {status.phase === "disconnected" && (
        <div className="mt-6 border-t border-rule pt-5">
          <h3 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
            No GitHub connection on this server
          </h3>
          <p className="mt-1 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
            {status.reason} Add a token to <code className="font-mono text-[0.875rem]">.env.local</code>{" "}
            as <code className="font-mono text-[0.875rem]">GITHUB_TOKEN</code> and reload, or work
            against the offline sample below.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={load}>
              Check again
            </Button>
          </div>
        </div>
      )}

      {status.phase === "ready" && (
        <div className="mt-6 border-t border-rule pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h3 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
              Your repositories
            </h3>
            <p className="text-[0.8125rem] text-ink-3">
              Signed in as <span className="font-mono text-ink-2">{status.login}</span>. Only
              repositories this token can push to are listed.
            </p>
          </div>

          <label htmlFor="repo-filter" className="mt-4 block text-[0.8125rem] text-ink-2">
            Filter
          </label>
          <input
            id="repo-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="owner/name"
            className="mt-1 h-11 w-full max-w-md border border-rule-strong bg-surface px-3 font-mono text-[0.875rem] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-4 focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            style={{ borderRadius: 4 }}
          />

          {reposError ? (
            <Retryable title="Could not list repositories" message={reposError} onRetry={load} />
          ) : repos === null ? (
            <RepoSkeleton />
          ) : visible.length === 0 ? (
            <p className="mt-5 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-3">
              {repos.length === 0
                ? `This token cannot push to any repository, so there is nothing ${agentName} could branch. Grant it repo scope, or use the offline sample below.`
                : `No repository matches "${filter}".`}
            </p>
          ) : (
            // Stacks on a phone, columnar from sm up. Nothing scrolls sideways.
            <ul className="mt-4 border-t border-rule">
              {visible.map((repo) => (
                <li
                  key={repo.fullName}
                  className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-rule py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    <span className="block break-all font-mono text-[0.875rem] text-ink">
                      {repo.fullName}
                    </span>
                    {repo.description && (
                      <span className="mt-0.5 block max-w-[68ch] text-[0.8125rem] leading-5 text-ink-3">
                        {repo.description}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[0.8125rem] tabular-nums text-ink-4">
                    {repo.defaultBranch} · {repo.openIssues} open · {relativeDay(repo.pushedAt)}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={connecting === repo.fullName}
                    loadingLabel="Connecting"
                    onClick={() =>
                      connect({ provider: "github", repository: repo.fullName }, repo.fullName)
                    }
                  >
                    Connect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {connectError && (
        <p role="alert" className="mt-4 max-w-[68ch] text-[0.9375rem] leading-6 text-critical">
          {connectError}
        </p>
      )}

      <div className="mt-8 border-t border-rule pt-5">
        <h3 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
          No repository handy
        </h3>
        <p className="mt-1 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
          Run the same pipeline against a bundled sample codebase. It is offline: the branch, the
          diff, and the checks are real, and no pull request is opened because there is no remote.
        </p>
        <div className="mt-3">
          <Button
            variant="ghost"
            loading={connecting === "demo"}
            loadingLabel="Connecting"
            onClick={() => connect({ provider: "demo", repository: "globex/platform" }, "demo")}
          >
            Use the offline sample
          </Button>
        </div>
      </div>
    </section>
  );
}

function RepoSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between gap-6 border-b border-rule pb-3">
          <span className="h-3.5 rounded-[2px] bg-sunken" style={{ width: `${34 - i * 3}%` }} />
          <span className="h-3.5 w-16 rounded-[2px] bg-sunken" />
        </div>
      ))}
      <span className="sr-only">Loading repositories</span>
    </div>
  );
}

function Retryable({
  title,
  message,
  onRetry,
  className,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mt-6 border-t border-rule pt-5", className)} role="alert">
      <h3 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      <p className="mt-1 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">{message}</p>
      <div className="mt-3">
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
