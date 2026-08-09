import { ArtifactRenderer } from "@/components/artifacts/ArtifactRenderer";
import { AgentActivity } from "@/components/prospect/AgentActivity";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { cn, formatTime } from "@/lib/utils";
import type { Message } from "@/types/ui";
import type { ReactNode } from "react";

/* ─────────────────────────── inline markdown ─────────────────────────── */

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Inline markdown → html string. Handles `code`, **bold**, *italic* and
 * [links](url). Input is escaped first, so raw html in model output is inert.
 */
function inline(value: string) {
  let html = escapeHtml(value);

  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded-[4px] border border-border bg-bg px-[0.35em] py-[0.1em] font-mono text-[0.85em] text-fg">$1</code>'
  );
  html = html.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-fg">$1</strong>'
  );
  html = html.replace(
    /(^|[\s(])\*([^\s*][^*]*)\*(?=$|[\s.,;:)!?])/g,
    '$1<em class="italic">$2</em>'
  );
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer noopener" class="font-medium text-brand underline decoration-brand-border underline-offset-2 hover:decoration-brand">$1</a>'
  );

  return html;
}

/* ────────────────────────────── block parsing ────────────────────────── */

const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)(?:([-*•])|(\d+)[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

function splitRow(line: string) {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((cell) => cell.trim());
}

function isTableRow(line: string) {
  return line.includes("|") && Boolean(line.trim());
}

/** A table only starts where a pipe row is followed by a `---|---` divider. */
function startsTable(lines: string[], index: number) {
  return (
    isTableRow(lines[index]) &&
    index + 1 < lines.length &&
    TABLE_DIVIDER.test(lines[index + 1]) &&
    lines[index + 1].includes("-")
  );
}

function alignmentOf(spec: string) {
  const trimmed = spec.trim();
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");
  if (left && right) return "text-center";
  if (right) return "text-right";
  return "text-left";
}

type ListEntry = { marker: string; text: string; depth: number };

function renderProse(text: string, keyBase: string) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;

  const push = (node: ReactNode) => nodes.push(node);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    /* Tables — pipe syntax with a divider row underneath the header. */
    if (startsTable(lines, i)) {
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(alignmentOf);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      push(
        <div
          key={`${keyBase}-table-${i}`}
          className="my-3 overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg-elevated scrollbar-thin"
        >
          <table className="w-full border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="bg-bg">
                {header.map((cell, ci) => (
                  <th
                    key={ci}
                    className={cn(
                      "whitespace-nowrap border-b border-border px-3 py-2 font-semibold text-fg",
                      aligns[ci] ?? "text-left"
                    )}
                    dangerouslySetInnerHTML={{ __html: inline(cell) }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border last:border-b-0">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        "px-3 py-2 align-top leading-[1.5] text-fg-secondary",
                        aligns[ci] ?? "text-left"
                      )}
                      dangerouslySetInnerHTML={{ __html: inline(cell) }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    /* Horizontal rule */
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      push(<hr key={`${keyBase}-hr-${i}`} className="my-3 border-t border-border" />);
      i += 1;
      continue;
    }

    /* Headings */
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      push(
        <p
          key={`${keyBase}-h-${i}`}
          className={cn(
            "mt-3 mb-1 font-semibold text-fg first:mt-0",
            level <= 2 ? "text-[15.5px] tracking-[-0.01em]" : "text-[14px]"
          )}
          dangerouslySetInnerHTML={{ __html: inline(heading[2]) }}
        />
      );
      i += 1;
      continue;
    }

    /* Blockquote */
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(QUOTE.exec(lines[i])![1]);
        i += 1;
      }
      push(
        <blockquote
          key={`${keyBase}-q-${i}`}
          className="my-2 border-l-2 border-border-strong pl-3 text-[14.5px] italic leading-[1.65] text-fg-muted"
          dangerouslySetInnerHTML={{ __html: inline(quoted.join(" ")) }}
        />
      );
      continue;
    }

    /* Lists (bulleted or numbered, one flat render with per-depth indent) */
    if (LIST_ITEM.test(line)) {
      const entries: ListEntry[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const [, indent, bullet, ordinal, rest] = LIST_ITEM.exec(lines[i])!;
        entries.push({
          marker: bullet ? "•" : `${ordinal}.`,
          text: rest,
          depth: Math.min(2, Math.floor(indent.replace(/\t/g, "  ").length / 2)),
        });
        i += 1;
      }
      push(
        <ul key={`${keyBase}-ul-${i}`} className="my-2 space-y-1.5">
          {entries.map((entry, ei) => (
            <li
              key={ei}
              className={cn(
                "flex gap-2 text-[15px] leading-[1.65] text-fg-secondary",
                entry.depth === 1 && "ml-4",
                entry.depth >= 2 && "ml-8"
              )}
            >
              <span className="mt-[0.05em] shrink-0 font-mono text-[12px] leading-[1.9] text-fg-faint">
                {entry.marker}
              </span>
              <span
                className="min-w-0 flex-1"
                dangerouslySetInnerHTML={{ __html: inline(entry.text) }}
              />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    /* Paragraph — consecutive plain lines keep their line breaks */
    const paragraph: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !startsTable(lines, i) &&
      !HEADING.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    push(
      <p
        key={`${keyBase}-p-${i}`}
        className="text-[15px] leading-[1.68] text-fg-secondary [&+p]:mt-2"
        dangerouslySetInnerHTML={{ __html: paragraph.map(inline).join("<br />") }}
      />
    );
  }

  return nodes;
}

export function renderContent(content: string) {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return segments.map((segment, i) => {
    if (segment.startsWith("```")) {
      const language = /^```(\w+)/.exec(segment)?.[1] ?? "";
      const inner = segment.replace(/^```\w*\n?/, "").replace(/```\s*$/, "");
      return (
        <div
          key={i}
          className="my-3 overflow-hidden rounded-[var(--radius-md)] border border-border bg-bg"
        >
          {language && (
            <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              {language}
            </div>
          )}
          <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-fg-secondary scrollbar-thin">
            <code>{inner.replace(/\n$/, "")}</code>
          </pre>
        </div>
      );
    }

    if (!segment.trim()) return null;
    return <div key={i}>{renderProse(segment, `b${i}`)}</div>;
  });
}

/* ──────────────────────────────── bubble ─────────────────────────────── */

export function MessageBubble({
  message,
  agentName,
  streaming,
}: {
  message: Message;
  agentName: string;
  /** Renders a caret at the end of the content while tokens are arriving. */
  streaming?: boolean;
}) {
  if (message.channel === "system" || message.role === "system") {
    return (
      <div className="mx-auto max-w-xl animate-in rounded-[var(--radius-lg)] border border-border bg-bg-elevated px-4 py-3 shadow-sm">
        <Badge tone="neutral" className="mb-2">
          {message.channel === "call" ? "call" : "system"}
        </Badge>
        <div className="whitespace-pre-wrap text-[14px] leading-[1.6] text-fg-muted">
          {message.content}
        </div>
        {message.metadata && Array.isArray(message.metadata.learned) && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-brand">
              {agentName} learned
            </p>
            <ul className="space-y-1">
              {(message.metadata.learned as string[]).map((item) => (
                <li key={item} className="text-[14px] leading-[1.6] text-fg-secondary">
                  · {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const isUser = message.role === "user";
  const isEmail = message.channel === "email";
  const isCall = message.channel === "call";

  if (isUser) {
    return (
      <div className="flex w-full animate-in justify-end">
        <div className="flex min-w-0 max-w-[min(85%,34rem)] flex-col items-end gap-1.5">
          <div className="flex items-center gap-2 pr-1">
            {(isEmail || isCall) && (
              <Badge tone={isCall ? "call" : "neutral"}>{message.channel}</Badge>
            )}
            <span className="text-[12px] font-semibold tracking-[-0.01em] text-fg-secondary">
              You
            </span>
            <span className="mono-ts">{formatTime(message.createdAt)}</span>
          </div>

          <div className="rounded-[var(--radius-xl)] rounded-tr-[var(--radius-sm)] bg-accent px-4 py-2.5 shadow-sm">
            <p className="whitespace-pre-wrap text-[15px] leading-[1.6] text-accent-fg">
              {message.content}
            </p>
          </div>

          {message.artifacts?.map((artifact, i) => (
            <div key={i} className="w-full">
              <ArtifactRenderer artifact={artifact} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full animate-in gap-3">
      <Avatar name={agentName} size="sm" className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 max-w-[min(100%,42rem)] flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2 pl-1">
          <span className="text-[12px] font-semibold tracking-[-0.01em] text-fg">
            {agentName}
          </span>
          {(isEmail || isCall) && (
            <Badge tone={isCall ? "call" : "neutral"}>{message.channel}</Badge>
          )}
          <span className="mono-ts">{formatTime(message.createdAt)}</span>
        </div>

        {message.events && message.events.length > 0 && (
          <AgentActivity events={message.events} className="pl-1" />
        )}

        <div className="w-full rounded-[var(--radius-xl)] rounded-tl-[var(--radius-sm)] border border-border bg-bg-elevated px-4 py-3 text-fg shadow-sm">
          {renderContent(message.content)}
          {streaming && (
            <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.2em] animate-pulse rounded-full bg-fg-muted align-baseline" />
          )}
        </div>

        {message.artifacts?.map((artifact, i) => (
          <ArtifactRenderer key={i} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}
