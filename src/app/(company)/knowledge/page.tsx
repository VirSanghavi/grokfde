"use client";

import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { StatusDot } from "@/components/ui/StatusDot";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api/client";
import { cn, errorMessage, formatRelativeTime } from "@/lib/utils";
import type { KnowledgeSource, McpServer } from "@/types/ui";
import {
  IconFile,
  IconGlobe,
  IconKnowledge,
  IconServer,
  IconUpload,
} from "@/components/icons";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ModalKind = "upload" | "paste" | "url" | "mcp" | null;

const TYPE_LABEL: Record<KnowledgeSource["type"], string> = {
  file: "File",
  paste: "Pasted",
  url: "URL",
  mcp: "MCP",
};

const TYPE_ICON = {
  file: IconFile,
  paste: IconFile,
  url: IconGlobe,
  mcp: IconServer,
};

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { push } = useToast();
  const router = useRouter();

  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [url, setUrl] = useState("");
  const [mcpLabel, setMcpLabel] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [mcpWrite, setMcpWrite] = useState(false);

  // Polling must never overwrite good data with an error, and a failed poll must
  // never surface as an unhandled rejection in the console.
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([api.getKnowledge(), api.getMcpServers()]);
      setSources(s);
      setMcpServers(m);
      setLoadError(null);
      loadedOnce.current = true;
    } catch (err) {
      if (!loadedOnce.current) {
        setLoadError(
          errorMessage(err, "We could not load what your engineer knows. Try again."),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Only poll while something is still being read. A finished list does not need
  // a request every two seconds for the rest of the day.
  const hasWork = sources.some((s) => s.status === "processing");
  useEffect(() => {
    if (!hasWork) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [hasWork, load]);

  function closeModal() {
    setModal(null);
    setFormError(null);
  }

  async function handleUpload(files: File[]) {
    setBusy(true);
    setFormError(null);
    try {
      for (const file of files) {
        // The text goes with the file. Without it the server stores a placeholder
        // line and the engineer learns nothing from the upload.
        const content = await file.text().catch(() => "");
        await api.uploadKnowledge({
          title: file.name,
          type: "file",
          file,
          content: content || undefined,
        });
      }
      push(files.length === 1 ? "File added" : `${files.length} files added`, "success");
      closeModal();
      void load();
    } catch (err) {
      setFormError(errorMessage(err, "That upload did not go through. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handlePaste() {
    setBusy(true);
    setFormError(null);
    try {
      await api.pasteKnowledge({
        title: pasteTitle.trim() || "Pasted note",
        content: pasteContent,
      });
      push("Knowledge added", "success");
      setPasteTitle("");
      setPasteContent("");
      closeModal();
      void load();
    } catch (err) {
      setFormError(errorMessage(err, "We could not save that. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleUrl() {
    setBusy(true);
    setFormError(null);
    try {
      const source = await api.addUrlKnowledge({ url: url.trim() });
      push(`Read ${source.title}`, "success");
      setUrl("");
      closeModal();
      void load();
    } catch (err) {
      setFormError(errorMessage(err, "We could not read that page. Try another link."));
    } finally {
      setBusy(false);
    }
  }

  async function handleMcp() {
    setBusy(true);
    setFormError(null);
    try {
      await api.connectMcp({
        label: mcpLabel.trim(),
        serverUrl: mcpUrl.trim(),
        authToken: mcpToken.trim() || undefined,
        allowWrite: mcpWrite,
      });
      push("MCP server connected", "success");
      setMcpLabel("");
      setMcpUrl("");
      setMcpToken("");
      setMcpWrite(false);
      closeModal();
      void load();
    } catch (err) {
      setFormError(errorMessage(err, "We could not reach that MCP server. Check the URL."));
    } finally {
      setBusy(false);
    }
  }

  const readyCount = sources.filter((s) => s.status === "ready").length;
  // Landing here before onboarding is a missing workspace, not a failure. Retrying
  // would never fix it, so it gets an empty state with the action that does.
  const noCompanyYet = Boolean(loadError && /no company yet/i.test(loadError));
  const isEmpty = !loading && !loadError && sources.length === 0 && mcpServers.length === 0;

  return (
    <>
      <TopNav
        title="Knowledge"
        subtitle={
          loading
            ? "Loading sources"
            : sources.length === 0
              ? "Nothing learned yet"
              : `${readyCount} of ${sources.length} sources ready`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<IconUpload size={14} />}
              onClick={() => setModal("upload")}
            >
              Upload files
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<IconFile size={14} />}
              onClick={() => setModal("paste")}
            >
              Paste text
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<IconServer size={14} />}
              onClick={() => setModal("mcp")}
            >
              Connect MCP
            </Button>
            {/* One primary per view. When the page is empty the empty state owns
                it, so this row steps back to secondary. */}
            <Button
              size="sm"
              variant={isEmpty ? "secondary" : "primary"}
              leftIcon={<IconGlobe size={14} />}
              onClick={() => setModal("url")}
            >
              Add a URL
            </Button>
          </div>
        }
      />

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="w-full px-5 py-8 sm:px-8 lg:px-12">
          {loading ? (
            <LoadingState variant="table" rows={4} label="Loading knowledge sources" />
          ) : noCompanyYet ? (
            <EmptyState
              icon={<IconKnowledge size={20} />}
              title="No workspace on this browser yet"
              description="Knowledge belongs to a company. Create one, which takes a company name and about ten seconds, and this page fills up."
              action={
                <Button onClick={() => router.push("/onboarding")}>Create your workspace</Button>
              }
            />
          ) : loadError ? (
            <ErrorState
              title="Knowledge did not load"
              message={loadError}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : isEmpty ? (
            <EmptyState
              icon={<IconKnowledge size={20} />}
              title="Your engineer has nothing to read yet"
              description="Point it at your docs site and it reads the page, strips the navigation, and indexes the text. Files, pasted text, and MCP servers work too."
              action={<Button onClick={() => setModal("url")}>Add a URL</Button>}
              hint="PDF · Markdown · TXT · DOCX"
            />
          ) : (
            <div className="space-y-12">
              {sources.length > 0 && (
                <section>
                  <h2 className="text-label">Sources</h2>
                  <div className="mt-3 w-full overflow-x-auto">
                    <table className="w-full min-w-[36rem] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-rule">
                          <th scope="col" className="py-2.5 pr-4 text-[0.8125rem] font-medium text-ink-3">
                            Source
                          </th>
                          <th scope="col" className="w-24 py-2.5 pr-4 text-[0.8125rem] font-medium text-ink-3">
                            Type
                          </th>
                          <th scope="col" className="w-32 py-2.5 pr-4 text-right text-[0.8125rem] font-medium text-ink-3">
                            Added
                          </th>
                          <th scope="col" className="w-36 py-2.5 text-right text-[0.8125rem] font-medium text-ink-3">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sources.map((source) => {
                          const Icon = TYPE_ICON[source.type] ?? IconFile;
                          return (
                            <tr
                              key={source.id}
                              className="transition-premium border-b border-rule hover:bg-hover"
                            >
                              <td className="py-3.5 pr-4">
                                <div className="flex min-w-0 items-start gap-3">
                                  <Icon size={16} className="mt-0.5 shrink-0 text-ink-3" />
                                  <div className="min-w-0">
                                    <p className="truncate text-[0.9375rem] font-medium text-ink">
                                      {source.title}
                                    </p>
                                    {source.sourceUrl && (
                                      <p className="mt-0.5 truncate font-mono text-[0.75rem] text-ink-4">
                                        {source.sourceUrl}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 pr-4 text-[0.875rem] text-ink-2">
                                {TYPE_LABEL[source.type] ?? source.type}
                              </td>
                              <td className="py-3.5 pr-4 text-right font-mono text-[0.75rem] tabular-nums text-ink-3">
                                {formatRelativeTime(source.createdAt)}
                              </td>
                              <td className="py-3.5 text-right">
                                <span className="inline-flex items-center gap-2">
                                  <StatusDot
                                    status={
                                      source.status === "ready"
                                        ? "ready"
                                        : source.status === "processing"
                                          ? "processing"
                                          : "error"
                                    }
                                  />
                                  <span
                                    className={cn(
                                      "text-[0.875rem]",
                                      source.status === "ready" && "text-positive",
                                      source.status === "processing" && "text-caution",
                                      source.status === "error" && "text-critical",
                                    )}
                                  >
                                    {source.status === "ready"
                                      ? "Ready"
                                      : source.status === "processing"
                                        ? "Reading"
                                        : "Failed"}
                                  </span>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {mcpServers.length > 0 && (
                <section>
                  <h2 className="text-label">MCP servers</h2>
                  <ul className="mt-3 divide-y divide-rule border-t border-rule">
                    {mcpServers.map((server) => (
                      <li key={server.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:gap-6">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <IconServer size={16} className="mt-0.5 shrink-0 text-ink-3" />
                          <div className="min-w-0">
                            <p className="text-[0.9375rem] font-medium text-ink">
                              {server.label}
                            </p>
                            <p className="mt-0.5 font-mono text-[0.75rem] tabular-nums text-ink-4">
                              {server.tools.length} tools · write{" "}
                              {server.allowWrite ? "on" : "off"}
                            </p>
                          </div>
                        </div>
                        <p className="min-w-0 font-mono text-[0.75rem] leading-6 text-ink-3 sm:max-w-[24rem] sm:text-right">
                          {server.tools.length > 0
                            ? server.tools.map((t) => t.name).join(", ")
                            : "No tools reported"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modal === "upload"}
        onClose={closeModal}
        title="Upload files"
        description="Drop documentation your engineer should read."
      >
        <FileDropzone onFiles={handleUpload} busy={busy} error={formError ?? undefined} />
      </Modal>

      <Modal
        open={modal === "paste"}
        onClose={closeModal}
        title="Paste anything your engineer should know"
      >
        <div className="space-y-1">
          <Input
            label="Title"
            name="paste-title"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="API reference"
            hint="Optional. We name it for you if you leave this blank."
          />
          <Textarea
            label="Content"
            name="paste-content"
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Pricing, architecture notes, security answers, objection handling"
            className="min-h-[12rem]"
            error={formError ?? undefined}
            required
          />
          <Button
            fullWidth
            loading={busy}
            loadingLabel="Saving"
            disabled={!pasteContent.trim()}
            onClick={handlePaste}
          >
            Add knowledge
          </Button>
        </div>
      </Modal>

      <Modal
        open={modal === "url"}
        onClose={closeModal}
        title="Read a page"
        description="We fetch it, strip the chrome, and index the text."
      >
        <div className="space-y-1">
          <Input
            label="Page address"
            name="knowledge-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="docs.yourcompany.com"
            error={formError ?? undefined}
            hint="A docs index, a pricing page, or a product overview works best."
            required
          />
          <Button
            fullWidth
            loading={busy}
            loadingLabel="Reading the page"
            disabled={!url.trim()}
            onClick={handleUrl}
          >
            Read this page
          </Button>
        </div>
      </Modal>

      <Modal
        open={modal === "mcp"}
        onClose={closeModal}
        title="Connect an MCP server"
        description="Give your engineer live tools and real company data."
      >
        <div className="space-y-1">
          <Input
            label="Name"
            name="mcp-label"
            value={mcpLabel}
            onChange={(e) => setMcpLabel(e.target.value)}
            placeholder="Internal platform"
            required
          />
          <Input
            label="Server URL"
            name="mcp-url"
            type="url"
            inputMode="url"
            value={mcpUrl}
            onChange={(e) => setMcpUrl(e.target.value)}
            placeholder="https://mcp.yourcompany.com"
            error={formError ?? undefined}
            required
          />
          <Input
            label="Authorization token"
            name="mcp-token"
            type="password"
            value={mcpToken}
            onChange={(e) => setMcpToken(e.target.value)}
            placeholder="Leave blank if the server is open"
            hint="Optional. Stored server side and never shown again."
          />
          <label className="flex cursor-pointer items-start justify-between gap-4 border-t border-rule py-4">
            <span>
              <span className="block text-[0.9375rem] font-medium text-ink">
                Allow write actions
              </span>
              <span className="mt-1 block text-[0.875rem] leading-relaxed text-ink-3">
                Off by default. Keep it read only unless you trust this server to change
                things.
              </span>
            </span>
            <input
              type="checkbox"
              checked={mcpWrite}
              onChange={(e) => setMcpWrite(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-ink)]"
            />
          </label>
          <Button
            fullWidth
            loading={busy}
            loadingLabel="Connecting"
            disabled={!mcpLabel.trim() || !mcpUrl.trim()}
            onClick={handleMcp}
          >
            Connect server
          </Button>
        </div>
      </Modal>
    </>
  );
}
