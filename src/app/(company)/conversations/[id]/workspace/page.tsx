"use client";

import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DiffViewer } from "@/components/workspace/DiffViewer";
import { FileChangeList } from "@/components/workspace/FileChangeList";
import { ImplementationStatus } from "@/components/workspace/ImplementationStatus";
import { IssueSupport } from "@/components/workspace/IssueSupport";
import { RepositoryPicker, type ConnectedRepository } from "@/components/workspace/RepositoryPicker";
import { RunTimeline } from "@/components/workspace/RunTimeline";
import { TestResults } from "@/components/workspace/TestResults";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type {
  FileOperation,
  ImplementationFile,
  ImplementationPlan,
  Prospect,
  Workspace,
  WorkspaceAnalysis,
} from "@/types/ui";
import { IconArrowLeft, IconExternalLink } from "@/components/icons";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The implementation workspace. Full bleed on a laptop, because this is a
 * working surface: a file list, a diff, and a check list all want horizontal
 * room, and a centred column would waste it.
 *
 * Everything on this page is real. The repository is a repository the server
 * can push to, the diff is the diff GitHub will show on the pull request, and
 * the pull request link is a link to a pull request that exists. When the
 * offline sample is connected instead, the page says so in plain words rather
 * than dressing a fixture up as a live run.
 */

type RunView = {
  id: string;
  status: string;
  branchName: string;
  summary: string;
  files: ImplementationFile[];
  tests: Array<{ name: string; status: string; output?: string }>;
  events: Array<{ type: string; label: string; at?: string }>;
  pullRequest: {
    pullRequestUrl: string;
    number?: number;
    title: string;
    branchName: string;
    base?: string;
    mode?: string;
  } | null;
  mode: "real" | "offline-fixture";
  repository: string | null;
  defaultBranch: string | null;
  repairAttempts: number;
  errorMessage: string | null;
};

const TERMINAL = ["ready_for_review", "pr_ready", "failed"];

/**
 * Grok writes the analysis, plan, and run summaries, and it reaches for an em
 * dash now and then. The house style does not use them, so normalise on the way
 * to the screen. Punctuation only, nothing else about the model's words changes.
 */
function prose(text: string | undefined | null): string {
  return (text || "").replace(/\s*[—–]\s*/g, ", ");
}

/**
 * The shared client mapper drops summary_json, and this page needs what lives
 * there: whether the run was real, and which branch it targeted. So it reads
 * the endpoint directly rather than widening a mapper other surfaces share.
 */
async function fetchRun(runId: string): Promise<RunView | null> {
  const res = await fetch(`/api/implementation-runs/${runId}`, { cache: "no-store" });
  if (!res.ok) return null;
  const raw = (await res.json()) as Record<string, unknown>;
  const summary = (raw.summaryJson || {}) as Record<string, unknown>;
  const pr = raw.pullRequest as Record<string, unknown> | null;
  return {
    id: String(raw.id),
    status: String(raw.status),
    branchName: String(raw.branchName || ""),
    summary: String(raw.summary || ""),
    files: ((raw.files as Array<Record<string, unknown>>) || []).map((f) => ({
      path: String(f.path),
      operation: String(f.operation) as FileOperation,
      diff: f.diff ? String(f.diff) : undefined,
    })),
    tests: ((raw.tests as Array<Record<string, unknown>>) || []).map((t) => ({
      name: String(t.name),
      status: String(t.status),
      output: t.output ? String(t.output) : undefined,
    })),
    events: ((raw.events as Array<Record<string, unknown>>) || []).map((e) => ({
      type: String(e.type || "event"),
      label: String(e.label || ""),
      at: e.at ? String(e.at) : undefined,
    })),
    pullRequest: pr
      ? {
          pullRequestUrl: String(pr.pullRequestUrl || pr.url || ""),
          number: typeof pr.number === "number" ? pr.number : undefined,
          title: String(pr.title || "Integrate Grok FDE"),
          branchName: String(pr.branchName || raw.branchName || ""),
          base: pr.base ? String(pr.base) : undefined,
          mode: pr.mode ? String(pr.mode) : undefined,
        }
      : null,
    mode: summary.mode === "real" ? "real" : "offline-fixture",
    repository: summary.repository ? String(summary.repository) : null,
    defaultBranch: summary.defaultBranch ? String(summary.defaultBranch) : null,
    repairAttempts: Number(raw.repairAttempts || 0),
    errorMessage: raw.errorMessage ? String(raw.errorMessage) : null,
  };
}

export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "analyze" | "plan" | "build" | "pr">(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [companyId, setCompanyId] = useState<string>("");
  // The agent's name comes from the company record; never hardcode one.
  const [agentName, setAgentName] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [analysis, setAnalysis] = useState<WorkspaceAnalysis | null>(null);
  const [plan, setPlan] = useState<ImplementationPlan | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [objective, setObjective] = useState(
    "Integrate Grok FDE so technical prospects can talk to an AI forward-deployed engineer.",
  );

  const objectiveTouched = useRef(false);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setBootError(null);
    try {
      const [conv, company] = await Promise.all([
        api.getConversation(conversationId),
        api.getCompany(),
      ]);
      if (!conv) {
        setBootError("That conversation no longer exists.");
        return;
      }
      setProspect(conv.prospect);
      setCompanyId(company.id);
      setAgentName(company.agentName);

      let ws = await api.getWorkspaceByConversation(conversationId);
      if (!ws) {
        ws = await api.createWorkspace({ prospectId: conv.prospect.id, conversationId });
      }
      setWorkspace(ws);
      // A new workspace carries an empty analysis_json object, which is truthy
      // and would render an "analysis" section with nothing in it. Only treat
      // an analysis as present when it actually says something.
      if (
        ws.analysis &&
        (ws.analysis.stack?.length ||
          ws.analysis.architectureSummary ||
          ws.analysis.importantFiles?.length)
      ) {
        setAnalysis(ws.analysis);
      }
      if (ws.plan?.changes?.length || ws.plan?.summary) setPlan(ws.plan);
      if (!objectiveTouched.current && ws.objective) setObjective(ws.objective);
      if (ws.activeRunId) {
        const r = await fetchRun(ws.activeRunId);
        if (r) {
          setRun(r);
          setSelectedPath(r.files[0]?.path ?? null);
        }
      }
    } catch (err) {
      setBootError(
        err instanceof Error ? err.message : "The workspace could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Poll only while a run is genuinely in flight.
  useEffect(() => {
    if (!run || TERMINAL.includes(run.status)) return;
    const id = run.id;
    const timer = setInterval(async () => {
      const fresh = await fetchRun(id);
      if (!fresh) return;
      setRun(fresh);
      setSelectedPath((prev) =>
        prev && fresh.files.some((f) => f.path === prev) ? prev : (fresh.files[0]?.path ?? null),
      );
      if (fresh.status === "ready_for_review") push("Implementation ready for review", "success");
    }, 1500);
    return () => clearInterval(timer);
  }, [run, push]);

  const repository = workspace?.repository;
  const isReal = repository?.provider === "github";
  const selectedFile = useMemo(
    () => run?.files.find((f) => f.path === selectedPath) ?? null,
    [run, selectedPath],
  );

  const stage = useMemo(() => {
    if (!repository) return 0;
    if (!analysis) return 1;
    if (!plan) return 2;
    if (!run || !TERMINAL.includes(run.status)) return 3;
    return 4;
  }, [repository, analysis, plan, run]);

  async function withBusy(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "That step failed.";
      setActionError(message);
      push(message, "error");
    } finally {
      setBusy(null);
    }
  }

  const analyze = () =>
    withBusy("analyze", async () => {
      if (!workspace) return;
      const result = await api.analyzeWorkspace(workspace.id);
      setAnalysis(result);
      push("Codebase analyzed", "success");
    });

  const createPlan = () =>
    withBusy("plan", async () => {
      if (!workspace) return;
      const p = await api.createImplementationPlan(workspace.id, { objective });
      setPlan(p);
      push("Plan ready for your approval", "success");
    });

  const build = () =>
    withBusy("build", async () => {
      if (!workspace || !plan) return;
      const { runId } = await api.startBuild(workspace.id, { planId: plan.planId });
      const r = await fetchRun(runId);
      if (r) {
        setRun(r);
        setSelectedPath(r.files[0]?.path ?? null);
      }
    });

  const openPullRequest = () =>
    withBusy("pr", async () => {
      if (!run) return;
      const res = await fetch(`/api/implementation-runs/${run.id}/pull-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "The pull request could not be opened.");
      const fresh = await fetchRun(run.id);
      if (fresh) setRun(fresh);
      push(
        data.simulated
          ? "Offline sample, so no pull request was opened"
          : `Pull request #${data.number} opened`,
        data.simulated ? "default" : "success",
      );
    });

  if (loading) {
    return (
      <>
        <TopNav title="Implementation" subtitle="Opening the workspace" />
        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12">
          <div className="space-y-4" aria-hidden>
            <span className="block h-8 w-64 rounded-[2px] bg-sunken" />
            <span className="block h-4 w-full max-w-xl rounded-[2px] bg-sunken" />
            <span className="block h-4 w-3/4 max-w-lg rounded-[2px] bg-sunken" />
          </div>
          <span className="sr-only">Loading the implementation workspace</span>
        </div>
      </>
    );
  }

  if (bootError || !prospect) {
    return (
      <>
        <TopNav title="Implementation" subtitle="This workspace could not be opened" />
        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12">
          <h1 className="text-[1.5rem] font-semibold tracking-[-0.025em] text-ink">
            The workspace did not load
          </h1>
          <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
            {bootError || "The prospect behind this conversation is missing."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={bootstrap}>Try again</Button>
            <Link href={`/conversations/${conversationId}`}>
              <Button variant="secondary">Back to the conversation</Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav
        title={`${prospect.companyName} · Implementation`}
        subtitle={`${agentName} writes the change. Your team owns the merge.`}
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <ImplementationStatus status={run?.status || workspace?.status || "discovery"} />
            <Link href={`/conversations/${conversationId}`}>
              <Button size="sm" variant="ghost" leftIcon={<IconArrowLeft className="h-4 w-4" />}>
                Conversation
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-5 pb-16 pt-6 sm:px-8 lg:px-12">
          {/* Repository identity. The one line that says what is real. */}
          {repository && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-rule pb-4">
              <div className="min-w-0">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                  {isReal ? "Live repository" : "Offline sample repository"}
                </p>
                <p className="mt-1 break-all font-mono text-[0.9375rem] text-ink">
                  {repository.repositoryName}
                  <span className="text-ink-4"> · {repository.defaultBranch}</span>
                </p>
              </div>
              <p className="max-w-[52ch] text-[0.9375rem] leading-6 text-ink-2">
                {isReal
                  ? `${agentName} branches from the default branch, commits once, and opens a pull request. It never writes to the default branch.`
                  : "A bundled sample codebase. The branch, diff, and checks are real. No pull request is opened because there is no remote."}
              </p>
            </div>
          )}

          {/* Stage rail */}
          {repository && (
            <ol className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-b border-rule pb-4">
              {["Analyze", "Plan", "Build", "Review"].map((label, i) => {
                const index = i + 1;
                const done = stage > index;
                const active = stage === index;
                return (
                  <li key={label} className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "font-mono text-[0.75rem] tabular-nums",
                        done || active ? "text-ink" : "text-ink-4",
                      )}
                    >
                      {index}
                    </span>
                    <span
                      className={cn(
                        "text-[0.9375rem]",
                        active ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-4",
                      )}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {actionError && (
            <p role="alert" className="mt-4 max-w-[68ch] text-[0.9375rem] leading-6 text-critical">
              {actionError}
            </p>
          )}

          {/* Step 1: connect */}
          {!repository && workspace && (
            <div className="pt-2">
              <RepositoryPicker
                workspaceId={workspace.id}
                agentName={agentName}
                onConnected={(repo: ConnectedRepository) => {
                  setWorkspace((w) =>
                    w
                      ? {
                          ...w,
                          status: "connected",
                          repository: {
                            id: repo.id,
                            repositoryName: repo.repositoryName,
                            defaultBranch: repo.defaultBranch,
                            provider: repo.provider,
                            status: "connected",
                          },
                        }
                      : w,
                  );
                  push(
                    repo.mode === "real"
                      ? `Connected ${repo.repositoryName}`
                      : "Connected the offline sample repository",
                    "success",
                  );
                }}
              />
            </div>
          )}

          {/* Step 2: analyze */}
          {repository && !analysis && (
            <section className="pt-8" aria-labelledby="analyze-heading">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                Step 2 of 4
              </p>
              <h2
                id="analyze-heading"
                className="mt-2 text-[1.5rem] font-semibold tracking-[-0.025em] text-ink sm:text-[2rem]"
              >
                Read the codebase
              </h2>
              <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
                {agentName} walks the tree, reads the files that matter, and reports what this
                service actually is: the stack, the auth pattern, and where an integration belongs.
                This is read-only.
              </p>
              <div className="mt-5">
                <Button
                  size="lg"
                  loading={busy === "analyze"}
                  loadingLabel="Reading the repository"
                  onClick={analyze}
                >
                  Analyze the codebase
                </Button>
              </div>
              {busy === "analyze" && (
                <p className="mt-3 text-[0.8125rem] text-ink-3">
                  Grok is reading real files. This takes a minute or two on a cold repository.
                </p>
              )}
            </section>
          )}

          {/* Analysis result */}
          {analysis && (
            <section className="pt-8" aria-labelledby="analysis-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
                <h2
                  id="analysis-heading"
                  className="text-[1.25rem] font-semibold tracking-[-0.025em] text-ink sm:text-[1.5rem]"
                >
                  What {agentName} found
                </h2>
                {analysis.stack.length > 0 && (
                  <p className="font-mono text-[0.8125rem] text-ink-3">
                    {analysis.stack.join(" · ")}
                  </p>
                )}
              </div>
              <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
                {prose(analysis.architectureSummary)}
              </p>

              <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-3">
                <div className="min-w-0">
                  <h3 className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                    Files that matter
                  </h3>
                  <ul className="mt-2 divide-y divide-rule">
                    {analysis.importantFiles.length === 0 && (
                      <li className="py-2 text-[0.9375rem] text-ink-3">Nothing flagged.</li>
                    )}
                    {analysis.importantFiles.map((f) => (
                      <li key={f.path} className="py-2">
                        <p className="break-all font-mono text-[0.8125rem] text-ink">{f.path}</p>
                        <p className="mt-0.5 text-[0.9375rem] leading-6 text-ink-2">{prose(f.reason)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0">
                  <h3 className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                    Where it plugs in
                  </h3>
                  <ul className="mt-2 divide-y divide-rule">
                    {analysis.integrationPoints.length === 0 && (
                      <li className="py-2 text-[0.9375rem] text-ink-3">Nothing flagged.</li>
                    )}
                    {analysis.integrationPoints.map((p) => (
                      <li key={p} className="py-2 text-[0.9375rem] leading-6 text-ink-2">
                        {prose(p)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0">
                  <h3 className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                    Risks called out
                  </h3>
                  <ul className="mt-2 divide-y divide-rule">
                    {analysis.risks.length === 0 && (
                      <li className="py-2 text-[0.9375rem] text-ink-3">None flagged.</li>
                    )}
                    {analysis.risks.map((r) => (
                      <li key={r} className="py-2 text-[0.9375rem] leading-6 text-ink-2">
                        {prose(r)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Step 3: plan */}
          {analysis && !plan && (
            <section className="mt-8 border-t border-rule pt-8" aria-labelledby="plan-heading">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                Step 3 of 4
              </p>
              <h2
                id="plan-heading"
                className="mt-2 text-[1.5rem] font-semibold tracking-[-0.025em] text-ink sm:text-[2rem]"
              >
                Agree on the change
              </h2>
              <label
                htmlFor="objective"
                className="mt-5 block text-[0.8125rem] text-ink-2"
              >
                What should {agentName} build
              </label>
              <textarea
                id="objective"
                value={objective}
                onChange={(e) => {
                  objectiveTouched.current = true;
                  setObjective(e.target.value);
                }}
                rows={3}
                className="mt-1 w-full max-w-[68ch] resize-y border border-rule-strong bg-surface px-3 py-2 text-[0.9375rem] leading-6 text-ink outline-none transition-colors duration-[120ms] focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                style={{ borderRadius: 4 }}
              />
              <div className="mt-4">
                <Button
                  size="lg"
                  loading={busy === "plan"}
                  loadingLabel="Drafting the plan"
                  onClick={createPlan}
                  disabled={!objective.trim()}
                >
                  Draft the plan
                </Button>
              </div>
            </section>
          )}

          {/* Plan result */}
          {plan && (
            <section className="mt-8 border-t border-rule pt-8" aria-labelledby="plan-result">
              <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
                <h2
                  id="plan-result"
                  className="text-[1.25rem] font-semibold tracking-[-0.025em] text-ink sm:text-[1.5rem]"
                >
                  The plan
                </h2>
                <p className="font-mono text-[0.8125rem] tabular-nums text-ink-3">
                  {plan.changes.length} file{plan.changes.length === 1 ? "" : "s"}
                </p>
              </div>
              <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
                {prose(plan.summary)}
              </p>

              {/* Stacks at 375px and becomes columnar from sm up. A scrolling
                  table here pushed the reason column off a phone screen and
                  left tall empty rows behind it. */}
              <ul className="mt-5 border-t border-rule">
                {plan.changes.map((c) => (
                  <li
                    key={c.path}
                    className="grid gap-x-6 gap-y-1 border-b border-rule py-3 last:border-b-0 sm:grid-cols-[minmax(0,18rem)_5rem_minmax(0,1fr)] lg:grid-cols-[minmax(0,24rem)_6rem_minmax(0,1fr)]"
                  >
                    <span className="min-w-0 break-all font-mono text-[0.8125rem] text-ink">
                      {c.path}
                    </span>
                    <span className="text-[0.8125rem] text-ink-3">{c.operation}</span>
                    <span className="min-w-0 text-[0.9375rem] leading-6 text-ink-2">
                      {prose(c.purpose)}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.risks.length > 0 && (
                <div className="mt-5">
                  <h3 className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                    Risks
                  </h3>
                  <ul className="mt-2 max-w-[68ch] divide-y divide-rule">
                    {plan.risks.map((r) => (
                      <li key={r} className="py-2 text-[0.9375rem] leading-6 text-ink-2">
                        {prose(r)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!run && (
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <Button
                    size="lg"
                    loading={busy === "build"}
                    loadingLabel="Building on a branch"
                    onClick={build}
                  >
                    Approve and build
                  </Button>
                  <p className="max-w-[52ch] text-[0.9375rem] leading-6 text-ink-2">
                    Writes to a new branch only. You read the diff before anything opens.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Step 4: the run */}
          {run && (
            <section className="mt-8 border-t border-rule pt-8" aria-labelledby="run-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
                <h2
                  id="run-heading"
                  className="text-[1.25rem] font-semibold tracking-[-0.025em] text-ink sm:text-[1.5rem]"
                >
                  {run.status === "failed"
                    ? "The build did not pass its checks"
                    : run.pullRequest
                      ? "Pull request open"
                      : run.status === "ready_for_review"
                        ? "Ready for your review"
                        : "Building"}
                </h2>
                <p className="font-mono text-[0.8125rem] text-ink-3">
                  {run.branchName}
                  {run.defaultBranch ? ` → ${run.defaultBranch}` : ""}
                </p>
              </div>

              {run.summary && (
                <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
                  {prose(run.summary)}
                </p>
              )}

              {run.errorMessage && (
                <p role="alert" className="mt-2 max-w-[68ch] text-[0.9375rem] leading-6 text-critical">
                  {run.errorMessage}
                  {run.repairAttempts > 0 &&
                    ` ${agentName} attempted ${run.repairAttempts} repair${run.repairAttempts === 1 ? "" : "s"} first.`}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4">
                {run.status === "ready_for_review" && !run.pullRequest && (
                  <Button
                    size="lg"
                    loading={busy === "pr"}
                    loadingLabel="Opening the pull request"
                    onClick={openPullRequest}
                  >
                    {isReal ? "Open the pull request" : "Finish the run"}
                  </Button>
                )}
                {run.pullRequest && run.mode === "real" && (
                  <a
                    href={run.pullRequest.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <Button size="lg" rightIcon={<IconExternalLink className="h-4 w-4" />}>
                      Open pull request #{run.pullRequest.number}
                    </Button>
                  </a>
                )}
                {run.pullRequest && run.mode !== "real" && (
                  <p className="max-w-[68ch] text-[0.9375rem] leading-6 text-ink-2">
                    This run used the offline sample, so there is no pull request to open. Connect a
                    GitHub repository to get a real one.
                  </p>
                )}
              </div>

              {/* Files, checks, diff */}
              <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
                    <h3 className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                      Changed files
                    </h3>
                    <span className="font-mono text-[0.75rem] tabular-nums text-ink-4">
                      {run.files.length}
                    </span>
                  </div>
                  <div className="mt-2">
                    <FileChangeList
                      files={run.files}
                      selectedPath={selectedPath}
                      onSelect={(f) => setSelectedPath(f.path)}
                      loading={!TERMINAL.includes(run.status) && run.files.length === 0}
                    />
                  </div>

                  <div className="mt-8">
                    <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
                      <h3 className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                        Checks
                      </h3>
                      <span className="font-mono text-[0.75rem] tabular-nums text-ink-4">
                        {run.tests.length}
                      </span>
                    </div>
                    <div className="mt-2">
                      <TestResults
                        tests={run.tests}
                        loading={!TERMINAL.includes(run.status) && run.tests.length === 0}
                      />
                    </div>
                  </div>

                  <div className="mt-8">
                    <h3 className="border-b border-rule pb-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
                      Activity
                    </h3>
                    <div className="mt-2">
                      <RunTimeline
                        events={run.events}
                        live={!TERMINAL.includes(run.status)}
                        loading={run.events.length === 0 && !TERMINAL.includes(run.status)}
                      />
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  {selectedFile ? (
                    <DiffViewer
                      path={selectedFile.path}
                      operation={selectedFile.operation}
                      diff={selectedFile.diff}
                    />
                  ) : !TERMINAL.includes(run.status) ? (
                    <DiffViewer path="Writing files" operation="modify" loading />
                  ) : (
                    <p className="text-[0.9375rem] leading-6 text-ink-3">
                      This run wrote no files. Check the activity log for what {agentName} rejected.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Issues, on a real repository only */}
          {repository && isReal && companyId && (
            <div className="mt-10 border-t border-rule pt-8">
              <IssueSupport
                repositoryName={repository.repositoryName}
                companyId={companyId}
                agentName={agentName}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
