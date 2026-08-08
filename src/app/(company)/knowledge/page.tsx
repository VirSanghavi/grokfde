"use client";

import { SourceCard } from "@/components/company/SourceCard";
import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/ui/Button";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api/client";
import type { KnowledgeSource, McpServer } from "@/types/ui";
import { FileText, Globe, Plus, Server, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ModalKind = "upload" | "paste" | "url" | "mcp" | null;

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [url, setUrl] = useState("");
  const [mcpLabel, setMcpLabel] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [mcpWrite, setMcpWrite] = useState(false);

  const load = useCallback(async () => {
    const [s, m] = await Promise.all([api.getKnowledge(), api.getMcpServers()]);
    setSources(s);
    setMcpServers(m);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  async function handleUpload(files: File[]) {
    setBusy(true);
    try {
      for (const f of files) {
        await api.uploadKnowledge({ title: f.name, type: "file" });
      }
      push("Upload started", "success");
      setModal(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handlePaste() {
    setBusy(true);
    try {
      await api.pasteKnowledge({ title: pasteTitle, content: pasteContent });
      push("Knowledge pasted", "success");
      setPasteTitle("");
      setPasteContent("");
      setModal(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleUrl() {
    setBusy(true);
    try {
      await api.addUrlKnowledge({ url });
      push("URL queued", "success");
      setUrl("");
      setModal(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleMcp() {
    setBusy(true);
    try {
      await api.connectMcp({
        label: mcpLabel,
        serverUrl: mcpUrl,
        authToken: mcpToken,
        allowWrite: mcpWrite,
      });
      push("MCP connected", "success");
      setMcpLabel("");
      setMcpUrl("");
      setMcpToken("");
      setMcpWrite(false);
      setModal(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopNav
        title="Knowledge"
        subtitle="Everything your FDE knows"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" leftIcon={<Upload className="h-3.5 w-3.5" />} onClick={() => setModal("upload")}>
              Upload
            </Button>
            <Button size="sm" variant="secondary" leftIcon={<FileText className="h-3.5 w-3.5" />} onClick={() => setModal("paste")}>
              Paste
            </Button>
            <Button size="sm" variant="secondary" leftIcon={<Globe className="h-3.5 w-3.5" />} onClick={() => setModal("url")}>
              URL
            </Button>
            <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal("mcp")}>
              MCP
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl space-y-8 px-5 py-8 sm:px-8">
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <section className="space-y-2.5">
                {sources.map((s) => (
                  <SourceCard key={s.id} source={s} />
                ))}
              </section>

              {mcpServers.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-semibold text-fg">MCP servers</h2>
                  <div className="space-y-3">
                    {mcpServers.map((server) => (
                      <div
                        key={server.id}
                        className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-4 shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg text-call">
                            <Server className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-fg">{server.label}</p>
                            <p className="mt-0.5 font-mono text-xs text-fg-muted">
                              {server.tools.length} tools · write {server.allowWrite ? "on" : "off"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {server.tools.map((t) => (
                                <span
                                  key={t.name}
                                  className="rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11px] text-fg-secondary"
                                >
                                  {t.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={modal === "upload"}
        onClose={() => setModal(null)}
        title="Upload files"
        description="Drop documentation your FDE should learn."
      >
        <FileDropzone onFiles={handleUpload} />
      </Modal>

      <Modal
        open={modal === "paste"}
        onClose={() => setModal(null)}
        title="Paste anything your FDE should know"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="API Reference"
          />
          <Textarea
            label="Content"
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Paste docs, FAQs, pricing, architecture notes..."
            className="min-h-[200px]"
          />
          <Button
            className="w-full"
            loading={busy}
            disabled={!pasteContent.trim()}
            onClick={handlePaste}
          >
            Add knowledge
          </Button>
        </div>
      </Modal>

      <Modal open={modal === "url"} onClose={() => setModal(null)} title="Add URL">
        <div className="space-y-4">
          <Input
            label="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.yourcompany.com"
          />
          <Button className="w-full" loading={busy} disabled={!url.trim()} onClick={handleUrl}>
            Ingest URL
          </Button>
        </div>
      </Modal>

      <Modal
        open={modal === "mcp"}
        onClose={() => setModal(null)}
        title="Connect MCP server"
        description="Expose company tools to your FDE."
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={mcpLabel}
            onChange={(e) => setMcpLabel(e.target.value)}
            placeholder="Internal Platform"
          />
          <Input
            label="Server URL"
            value={mcpUrl}
            onChange={(e) => setMcpUrl(e.target.value)}
            placeholder="https://mcp.yourcompany.com"
          />
          <Input
            label="Authorization token"
            type="password"
            value={mcpToken}
            onChange={(e) => setMcpToken(e.target.value)}
            placeholder="Optional"
          />
          <label className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-bg-elevated px-3 py-3">
            <div>
              <p className="text-sm font-medium text-fg">Allow write actions</p>
              <p className="text-xs text-fg-muted">Default off. Keep read-only unless you trust it.</p>
            </div>
            <input
              type="checkbox"
              checked={mcpWrite}
              onChange={(e) => setMcpWrite(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
          </label>
          <Button
            className="w-full"
            loading={busy}
            disabled={!mcpLabel.trim() || !mcpUrl.trim()}
            onClick={handleMcp}
          >
            Connect
          </Button>
        </div>
      </Modal>
    </>
  );
}
