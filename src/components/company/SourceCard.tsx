import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatRelativeTime } from "@/lib/utils";
import type { KnowledgeSource } from "@/types/ui";
import { FileText, Globe, Link2, Server } from "lucide-react";

const icons = {
  file: FileText,
  paste: FileText,
  url: Globe,
  mcp: Server,
};

export function SourceCard({ source }: { source: KnowledgeSource }) {
  const Icon = icons[source.type] ?? Link2;
  const tone =
    source.status === "ready"
      ? "success"
      : source.status === "processing"
        ? "warning"
        : "danger";

  return (
    <div className="group flex items-center gap-4 rounded-[var(--radius-lg)] border border-border bg-bg-elevated px-4 py-3.5 shadow-sm transition-colors hover:bg-bg-hover">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg text-fg-secondary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-fg">{source.title}</p>
          <Badge tone="neutral" className="hidden sm:inline-flex">
            {source.type}
          </Badge>
        </div>
        <p className="mt-0.5 font-mono text-xs text-fg-muted">
          {formatRelativeTime(source.createdAt)}
          {source.sourceUrl ? ` · ${source.sourceUrl}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusDot
          status={
            source.status === "ready"
              ? "ready"
              : source.status === "processing"
                ? "processing"
                : "error"
          }
          pulse={source.status === "processing"}
        />
        <Badge tone={tone}>{source.status}</Badge>
      </div>
    </div>
  );
}
