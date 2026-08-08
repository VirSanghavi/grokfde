"use client";

import { ArchitectureCard } from "@/components/artifacts/ArchitectureCard";
import { TopNav } from "@/components/layout/TopNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/components/ui/Toast";
import { DiffViewer } from "@/components/workspace/DiffViewer";
import { FileChangeList } from "@/components/workspace/FileChangeList";
import { ImplementationStatus } from "@/components/workspace/ImplementationStatus";
import { RunTimeline } from "@/components/workspace/RunTimeline";
import { TestResults } from "@/components/workspace/TestResults";
import { api } from "@/lib/api/client";
import type {
  ArchitectureData,
  ImplementationFile,
  ImplementationPlan,
  ImplementationRun,
  Prospect,
  Workspace,
  WorkspaceAnalysis,
} from "@/types/ui";
import {
  ArrowLeft,
  Check,
  FolderGit,
  GitPullRequest,
  Loader2,
  Play,
  Server,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Phase =
  | "loading"
  | "connect"
  | "analyze"
  | "analysis_results"
  | "plan"
  | "build"
  | "review";

export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [companyName, setCompanyName] = useState("Grok FDE");
  const [agentName, setAgentName] = useState("Atlas");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [analysis, setAnalysis] = useState<WorkspaceAnalysis | null>(null);
  const [plan, setPlan] = useState<ImplementationPlan | null>(null);
  const [run, setRun] = useState<ImplementationRun | null>(null);
  const [selectedFile, setSelectedFile] = useState<ImplementationFile | null>(null);
  const [analyzingStep, setAnalyzingStep] = useState(0);
  const [fitArch, setFitArch] = useState<{
    current: ArchitectureData;
    withFde: ArchitectureData;
  } | null>(null);
  const [objective, setObjective] = useState(
    "Integrate Grok FDE into this application."
  );

  const phase: Phase = useMemo(() => {
    if (loading) return "loading";
    if (!workspace?.repository) return "connect";
    if (run && (run.status === "ready_for_review" || run.status === "pr_ready")) return "review";
    if (run) return "build";
    if (plan) return "plan";
    if (analysis) return "analysis_results";
    if (workspace.status === "analyzing" || analyzingStep > 0) return "analyze";
    return "connect";
  }, [loading, workspace, analysis, plan, run, analyzingStep]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const [conv, company] = await Promise.all([
        api.getConversation(conversationId),
        api.getCompany(),
      ]);
      if (!conv) return;
      setProspect(conv.prospect);
      setCompanyName(company.name);
      setAgentName(company.agentName);

      let ws = await api.getWorkspaceByConversation(conversationId);
      if (!ws) {
        ws = await api.createWorkspace({
          prospectId: conv.prospect.id,
          conversationId,
        });
      }
      setWorkspace(ws);
      if (ws.analysis) setAnalysis(ws.analysis);
      if (ws.plan) setPlan(ws.plan);
      if (ws.activeRunId) {
        const r = await api.getImplementationRun(ws.activeRunId);
        if (r) {
          setRun(r);
          if (r.files[0]) setSelectedFile(r.files[0]);
        }
      }
      setObjective(ws.objective || objective);
      const arch = await api.getFitArchitecture(
        conv.prospect.companyName,
        company.name
      );
      setFitArch(arch);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Poll run while active
  useEffect(() => {
    if (!run) return;
    if (["ready_for_review", "pr_ready", "failed"].includes(run.status)) return;

    const t = setInterval(async () => {
      const fresh = await api.getImplementationRun(run.id);
      if (!fresh) return;
      setRun(fresh);
      if (fresh.files.length) {
        setSelectedFile((prev) => {
          if (prev && fresh.files.find((f) => f.path === prev.path)) return prev;
          return fresh.files[fresh.files.length - 1];
        });
      }
      if (fresh.status === "ready_for_review") {
        push("Implementation ready for review", "success");
      }
    }, 900);

    return () => clearInterval(t);
  }, [run, push]);

  async function connectDemo() {
    if (!workspace) return;
    setBusy(true);
    try {
      const repo = await api.connectRepository(workspace.id, {
        provider: "demo",
        repository: "globex/platform",
      });
      setWorkspace((w) => (w ? { ...w, repository: repo, status: "connected" } : w));
      push("Repository connected", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Connect failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (!workspace) return;
    setBusy(true);
    setAnalyzingStep(1);
    const steps = [1, 2, 3, 4];
    for (const s of steps) {
      setAnalyzingStep(s);
      await new Promise((r) => setTimeout(r, 450));
    }
    try {
      const result = await api.analyzeWorkspace(workspace.id);
      setAnalysis(result);
      setWorkspace((w) => (w ? { ...w, analysis: result, status: "analyzed" } : w));
      setAnalyzingStep(0);
      push("Codebase analyzed", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Analyze failed", "error");
      setAnalyzingStep(0);
    } finally {
      setBusy(false);
    }
  }

  async function createPlan() {
    if (!workspace) return;
    setBusy(true);
    try {
      const p = await api.createImplementationPlan(workspace.id, { objective });
      setPlan(p);
      setWorkspace((w) => (w ? { ...w, plan: p, status: "planned" } : w));
      push("Implementation plan ready", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Plan failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function buildThis() {
    if (!workspace || !plan) return;
    setBusy(true);
    try {
      const { runId } = await api.startBuild(workspace.id, { planId: plan.planId });
      const r = await api.getImplementationRun(runId);
      setRun(r);
      setWorkspace((w) =>
        w ? { ...w, activeRunId: runId, status: "building" } : w
      );
      push("Build started on a branch", "default");
    } catch (e) {
      push(e instanceof Error ? e.message : "Build failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function preparePr() {
    if (!run) return;
    setBusy(true);
    try {
      const r = await api.preparePullRequest(run.id);
      setRun(r);
      push("Pull request ready for review", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "PR failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !prospect) {
    return <LoadingState className="flex-1" label="Opening implementation workspace" />;
  }

  const stack = [
    ...new Set([
      ...prospect.memory.currentStack,
      ...(analysis?.stack ?? []),
    ]),
  ];

  const displayStatus =
    run?.status ||
    workspace?.status ||
    "discovery";

  const liveBuild = Boolean(
    run && !["ready_for_review", "pr_ready", "failed"].includes(run.status)
  );

  return (
    <>
      <TopNav
        title={`${prospect.companyName} · Implementation`}
        subtitle={`${agentName} is implementing the integration — you stay in control of review`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ImplementationStatus status={displayStatus} large />
            <Link href={`/conversations/${conversationId}`}>
              <Button size="sm" variant="ghost" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
                Conversation
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-5xl space-y-6 px-5 py-6 sm:px-8">
          {/* Overview strip */}
          <section className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                  Implementation workspace
                </p>
                <h2 className="mt-1 text-xl font-semibold text-fg">{prospect.companyName}</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  Stage: Technical evaluation → Implementation
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-fg-faint">Objective</p>
                <p className="mt-1 max-w-xs text-sm text-fg-secondary">
                  {workspace?.objective || objective}
                </p>
              </div>
            </div>
            {stack.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {stack.map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg-secondary"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-fg-muted">
              Flow: read → understand → plan → build on branch → test → show diff → human review → PR.
              Nothing deploys without your approval.
            </p>
          </section>

          {/* CONNECT */}
          {phase === "connect" && (
            <section className="animate-in rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-6 shadow-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                Connect customer environment
              </p>
              <h3 className="mt-2 text-lg font-semibold text-fg">Connect repository</h3>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">
                {agentName} needs read access to understand the codebase, then will propose
                changes on a branch for your review.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={connectDemo}
                  disabled={busy}
                  className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-bg p-4 text-left transition-colors hover:border-border-strong hover:bg-bg-hover"
                >
                  <Server className="h-5 w-5 text-brand" />
                  <div>
                    <p className="text-sm font-semibold text-fg">Use demo repository</p>
                    <p className="mt-1 text-xs text-fg-muted">globex/platform · one click</p>
                  </div>
                </button>
                <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-bg/50 p-4 opacity-70">
                  <FolderGit className="h-5 w-5 text-fg-faint" />
                  <div>
                    <p className="text-sm font-semibold text-fg">Connect GitHub</p>
                    <p className="mt-1 text-xs text-fg-muted">Coming soon via Person B</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* REPO CONNECTED + ANALYZE */}
          {workspace?.repository && !analysis && phase !== "analyze" && (
            <section className="animate-in rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="success">Connected</Badge>
                    <span className="font-mono text-sm text-fg">
                      {workspace.repository.repositoryName}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    Default branch · {workspace.repository.defaultBranch}
                  </p>
                </div>
                <Button
                  size="lg"
                  loading={busy}
                  onClick={analyze}
                  leftIcon={<Play className="h-4 w-4" />}
                >
                  Analyze codebase
                </Button>
              </div>
            </section>
          )}

          {/* ANALYZING SEQUENCE */}
          {phase === "analyze" && (
            <section className="animate-in rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-6 shadow-sm">
              <ImplementationStatus status="analyzing" large />
              <h3 className="mt-4 text-lg font-semibold text-fg">
                Analyzing customer environment
              </h3>
              <ul className="mt-5 space-y-3">
                {[
                  "Repository connected",
                  "Reading project structure…",
                  "Identifying framework…",
                  "Finding authentication…",
                  "Locating integration points…",
                ].map((label, i) => {
                  const done = analyzingStep > i || (analyzingStep === 0 && i === 0);
                  const active = analyzingStep === i;
                  return (
                    <li key={label} className="flex items-center gap-2.5 text-sm">
                      {done && !active ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : active ? (
                        <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-border" />
                      )}
                      <span className={done || active ? "text-fg" : "text-fg-faint"}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ANALYSIS RESULTS */}
          {analysis && (
            <section className="animate-in space-y-4">
              <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <ImplementationStatus status="analyzed" large />
                    <h3 className="mt-3 text-lg font-semibold text-fg">Codebase understanding</h3>
                    <p className="mt-1 max-w-2xl text-sm text-fg-muted">
                      {analysis.architectureSummary}
                    </p>
                  </div>
                  {!plan && (
                    <Button size="lg" loading={busy} onClick={createPlan}>
                      Create implementation plan
                    </Button>
                  )}
                </div>

                <div className="mt-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                    Detected stack
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {analysis.stack.map((s) => (
                      <Badge key={s} tone="accent">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                      Important files
                    </p>
                    <ul className="mt-2 space-y-2">
                      {analysis.importantFiles.map((f) => (
                        <li key={f.path} className="rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2">
                          <p className="font-mono text-xs text-fg">{f.path}</p>
                          <p className="mt-0.5 text-xs text-fg-muted">{f.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                        Integration points
                      </p>
                      <ul className="mt-2 space-y-1">
                        {analysis.integrationPoints.map((p) => (
                          <li key={p} className="text-sm text-fg-secondary">
                            · {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                        Risks
                      </p>
                      <ul className="mt-2 space-y-1">
                        {analysis.risks.map((r) => (
                          <li key={r} className="text-sm text-warning">
                            · {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {fitArch && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <ArchitectureCard data={fitArch.current} />
                  <ArchitectureCard data={fitArch.withFde} />
                </div>
              )}
            </section>
          )}

          {/* PLAN */}
          {plan && (
            <section className="animate-in rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-6 shadow-sm">
              <ImplementationStatus status="planned" large />
              <h3 className="mt-3 text-lg font-semibold text-fg">Implementation plan</h3>
              <p className="mt-2 max-w-2xl text-sm text-fg-muted">{plan.summary}</p>

              <div className="mt-5 space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                  Proposed changes
                </p>
                {plan.changes.map((c) => (
                  <div
                    key={c.path}
                    className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2.5"
                  >
                    <Badge
                      tone={
                        c.operation === "create"
                          ? "success"
                          : c.operation === "delete"
                            ? "danger"
                            : "info"
                      }
                    >
                      {c.operation}
                    </Badge>
                    <span className="font-mono text-sm text-fg">{c.path}</span>
                    <span className="text-xs text-fg-muted">— {c.purpose}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                    Tests
                  </p>
                  <ul className="mt-2 space-y-1">
                    {plan.tests.map((t) => (
                      <li key={t} className="flex items-center gap-2 text-sm text-fg-secondary">
                        <Check className="h-3.5 w-3.5 text-success" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                    Risks
                  </p>
                  <ul className="mt-2 space-y-1">
                    {plan.risks.map((r) => (
                      <li key={r} className="text-sm text-fg-secondary">
                        · {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {plan.requiresApproval && !run && (
                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
                  <Button size="lg" loading={busy} onClick={buildThis} className="glow-accent">
                    Build this
                  </Button>
                  <p className="text-xs text-fg-muted">
                    Builds on a branch. You review the diff before any PR is prepared.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* BUILD / RUN */}
          {run && (
            <section className="animate-in space-y-4">
              <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <ImplementationStatus status={run.status} large />
                    <h3 className="mt-3 text-lg font-semibold text-fg">
                      {run.status === "pr_ready"
                        ? "Pull request ready"
                        : run.status === "ready_for_review"
                          ? "Ready for review"
                          : run.status === "repairing"
                            ? "Repairing failure"
                            : "Building integration"}
                    </h3>
                    <p className="mt-1 font-mono text-sm text-fg-muted">
                      Branch · {run.branchName}
                    </p>
                    {run.summary && (
                      <p className="mt-2 max-w-2xl text-sm text-fg-secondary">{run.summary}</p>
                    )}
                  </div>
                  {run.status === "ready_for_review" && (
                    <Button
                      size="lg"
                      loading={busy}
                      onClick={preparePr}
                      leftIcon={<GitPullRequest className="h-4 w-4" />}
                    >
                      Prepare pull request
                    </Button>
                  )}
                  {run.pr && (
                    <a
                      href={run.pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex"
                    >
                      <Button size="lg" variant="secondary" leftIcon={<GitPullRequest className="h-4 w-4" />}>
                        Open PR #{run.pr.number ?? ""}
                      </Button>
                    </a>
                  )}
                </div>

                {run.pr && (
                  <div className="mt-4 rounded-[var(--radius-md)] border border-success/25 bg-success/5 px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-success">
                      PR ready — human review required
                    </p>
                    <p className="mt-1 text-sm font-medium text-fg">{run.pr.title}</p>
                    <p className="mt-0.5 font-mono text-xs text-fg-muted">
                      {run.pr.branchName} → main · nothing merges without approval
                    </p>
                  </div>
                )}

                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                    Activity
                  </p>
                  <RunTimeline events={run.events} live={liveBuild} />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                    Changed files
                  </p>
                  <FileChangeList
                    files={run.files}
                    selectedPath={selectedFile?.path}
                    onSelect={setSelectedFile}
                  />
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                      Checks
                    </p>
                    <TestResults tests={run.tests} />
                  </div>
                </div>
                <div>
                  {selectedFile ? (
                    <DiffViewer
                      path={selectedFile.path}
                      operation={selectedFile.operation}
                      diff={selectedFile.diff}
                    />
                  ) : (
                    <div className="flex h-full min-h-[200px] items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-bg-elevated text-sm text-fg-muted">
                      Select a file to inspect the diff
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Footer nav */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-8 pt-2">
            <Link href={`/conversations/${conversationId}`}>
              <Button variant="secondary">Back to conversation</Button>
            </Link>
            {run?.status === "pr_ready" && (
              <p className="text-sm text-fg-muted">
                {agentName} prepared the PR. Your team owns merge.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
