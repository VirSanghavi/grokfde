"use client";

import { useActiveCompany } from "@/components/layout/WorkspaceContext";
import { CopyLinkButton } from "@/components/ops/CopyLink";
import { Eyebrow, Note, RowList, Section, StateMark } from "@/components/ops/primitives";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { IconExternalLink } from "@/components/icons";
import {
  cn,
  errorMessage,
  fetchJson,
  formatRelativeTime,
  humanize,
  isAbortError,
} from "@/lib/utils";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const FRAME = "w-full px-5 sm:px-8 lg:px-12";

interface ToolServer {
  id: string;
  label: string;
  serverUrl: string;
  allowWrite: boolean;
  tools: Array<{ name: string; description?: string }>;
  createdAt: string;
}

interface KnowledgeSummaryRow {
  id: string;
  title: string;
  status: string;
}

interface AgentView {
  servers: ToolServer[];
  knowledge: KnowledgeSummaryRow[];
  degraded: { tools: boolean; knowledge: boolean };
}

const str = (v: unknown, fallback = "") => (v == null ? fallback : String(v));

async function loadAgent(companyId: string, signal: AbortSignal): Promise<AgentView> {
  const id = encodeURIComponent(companyId);

  const bail = (err: unknown) => {
    if (isAbortError(err) || signal.aborted) throw err;
    return null;
  };

  const [mcpRes, companyRes] = await Promise.all([
    fetchJson<{ servers?: Array<Record<string, unknown>> }>(`/api/mcp?companyId=${id}`, {
      signal,
    }).catch(bail),
    fetchJson<{ knowledgeSources?: Array<Record<string, unknown>> }>(
      `/api/company?id=${id}`,
      { signal },
    ).catch(bail),
  ]);

  return {
    servers: (mcpRes?.servers ?? []).map((s) => ({
      id: str(s.id),
      label: str(s.label, "Unnamed server"),
      serverUrl: str(s.serverUrl ?? s.server_url),
      allowWrite: Boolean(s.allowWrite ?? s.allow_write),
      tools: Array.isArray(s.tools)
        ? (s.tools as Array<{ name?: string; description?: string }>)
            .filter((t) => t?.name)
            .map((t) => ({ name: String(t.name), description: t.description }))
        : [],
      createdAt: str(s.createdAt ?? s.created_at, new Date().toISOString()),
    })),
    knowledge: (companyRes?.knowledgeSources ?? []).map((k) => ({
      id: str(k.id),
      title: str(k.title, "Untitled source"),
      status: str(k.status, "ready"),
    })),
    degraded: { tools: mcpRes === null, knowledge: companyRes === null },
  };
}

/* ── Connect a tool server. One real POST, one real result. ──────────────── */

function ConnectServer({
  companyId,
  agentName,
  onConnected,
}: {
  companyId: string;
  agentName: string;
  onConnected: () => void;
}) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [allowWrite, setAllowWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Connect a server
      </Button>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || !serverUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fetchJson<{ mcp?: { label?: string }; tools?: unknown[] }>(
        "/api/mcp",
        {
          method: "POST",
          body: JSON.stringify({
            companyId,
            label: label.trim(),
            serverUrl: serverUrl.trim(),
            auth: authToken.trim() || undefined,
            allowWrite,
          }),
        },
      );
      const found = Array.isArray(result.tools) ? result.tools.length : 0;
      push(
        found > 0
          ? `Connected. ${agentName} found ${found} ${found === 1 ? "tool" : "tools"}.`
          : `Connected. No tools were listed, so ${agentName} has nothing to call yet.`,
        found > 0 ? "success" : "default",
      );
      setOpen(false);
      setLabel("");
      setServerUrl("");
      setAuthToken("");
      setAllowWrite(false);
      onConnected();
    } catch (err) {
      setError(errorMessage(err, "That server could not be connected."));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "transition-premium mt-1.5 h-11 w-full rounded-[var(--radius-sm)] border border-rule-strong bg-surface px-3 text-body text-ink placeholder:text-ink-4 hover:border-ink-3";

  return (
    <form onSubmit={submit} className="w-full max-w-[38rem]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="mcp-label" className="text-body font-medium text-ink">
            Name
          </label>
          <input
            id="mcp-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Billing API"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="mcp-url" className="text-body font-medium text-ink">
            Server URL
          </label>
          <input
            id="mcp-url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://tools.example.com/mcp"
            className={field}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="mcp-auth" className="text-body font-medium text-ink">
            Auth token
          </label>
          <input
            id="mcp-auth"
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Optional"
            className={field}
          />
          <p className="mt-1.5 text-caption">
            Stored on the server and never sent back to this page.
          </p>
        </div>
      </div>

      <label className="mt-4 flex min-h-11 items-center gap-3 text-body text-ink-2">
        <input
          type="checkbox"
          checked={allowWrite}
          onChange={(e) => setAllowWrite(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-ink)]"
        />
        Allow {agentName} to call tools that change data
      </label>

      <div className="mt-2 min-h-[1.25rem]">
        {error ? <p className="text-caption text-critical">{error}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="md"
          loading={busy}
          loadingLabel="Connecting and listing tools"
          disabled={!label.trim() || !serverUrl.trim()}
        >
          Connect
        </Button>
        <Button size="md" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function AgentPage() {
  const company = useActiveCompany();
  const [view, setView] = useState<AgentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    loadAgent(company.id, controller.signal)
      .then((next) => {
        if (active) setView(next);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setView(null);
        setError(errorMessage(err, "This page could not be loaded."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [company.id, reloadKey]);

  const prospectPath = `/fde/${company.slug}`;
  const bookingPath = `/book/${company.slug}`;

  const readyKnowledge = view?.knowledge.filter((k) => k.status === "ready").length ?? 0;
  const toolCount = view?.servers.reduce((n, s) => n + s.tools.length, 0) ?? 0;

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <header className={cn(FRAME, "pt-8 pb-7 sm:pt-10")}>
        <Eyebrow>{company.name}</Eyebrow>
        <h1 className="text-display-l mt-2 text-ink">{company.agentName}</h1>
        <p className="mt-3 max-w-[62ch] text-body-l text-ink-2">
          {company.agentName} is the forward-deployed engineer your prospects meet. It
          answers from what you have taught it and says so when a question falls outside
          that, instead of guessing.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {loading ? (
            <span className="skeleton h-3 w-40" aria-hidden />
          ) : (
            <>
              <StateMark tone={readyKnowledge > 0 ? "positive" : "critical"}>
                {readyKnowledge > 0 ? "Ready to answer" : "No knowledge yet"}
              </StateMark>
              <span className="mono-ts tabular">
                {readyKnowledge} knowledge {readyKnowledge === 1 ? "source" : "sources"} ·{" "}
                {toolCount} {toolCount === 1 ? "tool" : "tools"}
              </span>
            </>
          )}
          {company.agentVoice ? (
            <span className="mono-ts">voice: {company.agentVoice}</span>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className={FRAME}>
          <ErrorState
            title={`We could not read ${company.agentName}'s setup.`}
            message={error}
            onRetry={reload}
          />
        </div>
      ) : (
        <div className={cn(FRAME, "space-y-10 pb-20")}>
          <Section
            title={`How people reach ${company.agentName}`}
            note="Two real links. Anyone with them talks to your agent, with your knowledge behind it."
          >
            <RowList>
              <li className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-4">
                <div className="min-w-0 flex-1 basis-[22rem]">
                  <p className="text-body font-medium text-ink">Talk now</p>
                  <p className="mt-1 max-w-[64ch] text-caption">
                    Chat or a live voice call with {company.agentName}, right away.
                  </p>
                  <p className="mt-1.5 truncate font-mono text-[0.8125rem] text-ink-2">
                    {prospectPath}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <CopyLinkButton
                    size="sm"
                    path={prospectPath}
                    toast="Prospect link copied"
                  />
                  <Link href={prospectPath}>
                    <Button size="sm" rightIcon={<IconExternalLink className="h-4 w-4" />}>
                      Open
                    </Button>
                  </Link>
                </div>
              </li>

              <li className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-4">
                <div className="min-w-0 flex-1 basis-[22rem]">
                  <p className="text-body font-medium text-ink">Book a demo</p>
                  <p className="mt-1 max-w-[64ch] text-caption">
                    {company.agentName} is available at any hour, so this page offers real
                    slots rather than whatever is left on a human calendar.
                  </p>
                  <p className="mt-1.5 truncate font-mono text-[0.8125rem] text-ink-2">
                    {bookingPath}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <CopyLinkButton size="sm" path={bookingPath} toast="Booking link copied" />
                  <Link href={bookingPath}>
                    <Button
                      size="sm"
                      variant="secondary"
                      rightIcon={<IconExternalLink className="h-4 w-4" />}
                    >
                      Open
                    </Button>
                  </Link>
                </div>
              </li>
            </RowList>
          </Section>

          <Section
            title={`What ${company.agentName} understands about ${company.name}`}
            note="Extracted from your knowledge sources. This is the model it reasons from."
            action={
              <Link href="/knowledge">
                <Button size="sm" variant="secondary">
                  Manage knowledge
                </Button>
              </Link>
            }
          >
            {company.whatWeSell || company.buyerTypes.length > 0 ? (
              <dl className="max-w-[74ch] divide-y divide-rule border-y border-rule">
                {company.whatWeSell && (
                  <div className="py-3.5">
                    <dt className="text-label">What you sell</dt>
                    <dd className="mt-1.5 text-body text-ink">{company.whatWeSell}</dd>
                  </div>
                )}
                {company.buyerTypes.length > 0 && (
                  <div className="py-3.5">
                    <dt className="text-label">Who you sell to</dt>
                    <dd className="mt-1.5 text-body text-ink-2">
                      {company.buyerTypes.slice(0, 6).join(", ")}
                    </dd>
                  </div>
                )}
                {company.products.length > 0 && (
                  <div className="py-3.5">
                    <dt className="text-label">What it can talk about</dt>
                    <dd className="mt-1.5 text-body text-ink-2">
                      {company.products.slice(0, 8).join(", ")}
                    </dd>
                  </div>
                )}
                {company.agentGreeting && (
                  <div className="py-3.5">
                    <dt className="text-label">How it opens a conversation</dt>
                    <dd className="mt-1.5 max-w-[64ch] text-body text-ink-2">
                      {company.agentGreeting}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <Note>
                Nothing extracted yet. Add a knowledge source and {company.agentName} builds
                this model of {company.name} from it.
              </Note>
            )}
          </Section>

          <Section
            title={`Tools ${company.agentName} can run`}
            note="An MCP server lets it look things up in your systems during a conversation instead of describing them."
            action={
              !loading && !view?.degraded.tools ? (
                <ConnectServer
                  companyId={company.id}
                  agentName={company.agentName}
                  onConnected={reload}
                />
              ) : null
            }
          >
            {loading ? (
              <div className="space-y-3" aria-hidden>
                <div className="skeleton h-3.5 w-2/3" />
                <div className="skeleton h-3.5 w-1/2" />
              </div>
            ) : view?.degraded.tools ? (
              <Note>
                The tool list could not be read just now. Nothing has changed, this page
                simply could not fetch it.
              </Note>
            ) : (view?.servers.length ?? 0) === 0 ? (
              <Note>
                No servers connected. {company.agentName} still answers from your knowledge;
                tools are what let it act.
              </Note>
            ) : (
              <RowList>
                {view!.servers.map((server) => (
                  <li key={server.id} className="py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <div className="min-w-0">
                        <span className="text-body font-medium text-ink">{server.label}</span>
                        <p className="mono-ts truncate">{server.serverUrl}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <StateMark tone={server.allowWrite ? "caution" : "positive"}>
                          {server.allowWrite ? "Can change data" : "Read only"}
                        </StateMark>
                        <span className="mono-ts tabular">
                          connected {formatRelativeTime(server.createdAt)}
                        </span>
                      </div>
                    </div>
                    {server.tools.length === 0 ? (
                      <p className="mt-2 text-caption">
                        This server listed no tools, so there is nothing for{" "}
                        {company.agentName} to call yet.
                      </p>
                    ) : (
                      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                        {server.tools.map((tool) => (
                          <li
                            key={tool.name}
                            title={tool.description}
                            className="font-mono text-[0.75rem] text-ink-2"
                          >
                            {tool.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </RowList>
            )}
          </Section>

          <Section
            title="Knowledge sources"
            note={`The complete list of what ${company.agentName} is allowed to answer from.`}
          >
            {loading ? (
              <div className="space-y-3" aria-hidden>
                <div className="skeleton h-3.5 w-1/2" />
                <div className="skeleton h-3.5 w-1/3" />
              </div>
            ) : view?.degraded.knowledge ? (
              <Note>Your knowledge sources could not be read just now.</Note>
            ) : (view?.knowledge.length ?? 0) === 0 ? (
              <Note>
                Nothing yet. Until you add a source, {company.agentName} will say it does not
                know rather than invent an answer.
              </Note>
            ) : (
              <RowList>
                {view!.knowledge.map((source) => (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-body text-ink">
                      {source.title}
                    </span>
                    <StateMark
                      tone={
                        source.status === "ready"
                          ? "positive"
                          : source.status === "processing"
                            ? "caution"
                            : "critical"
                      }
                    >
                      {humanize(source.status)}
                    </StateMark>
                  </li>
                ))}
              </RowList>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
