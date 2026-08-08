"use client";

import { IconActivity, IconStatusDot } from "@/components/icons/DottedIcon";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { cn } from "@/lib/utils";

type StreamItem =
  | {
      id: string;
      kind: "voice";
      ts: string;
      title: string;
      transcript: { who: "user" | "agent"; text: string; intent?: string }[];
    }
  | {
      id: string;
      kind: "email";
      ts: string;
      title: string;
      subject: string;
      body: string;
      attachment: string;
    }
  | {
      id: string;
      kind: "tool";
      ts: string;
      title: string;
      lines: string[];
    }
  | {
      id: string;
      kind: "chat";
      ts: string;
      title: string;
      preview: string;
      tone: "info" | "success" | "warning";
    };

const STREAM: StreamItem[] = [
  {
    id: "v1",
    kind: "voice",
    ts: "14:22:04.18",
    title: "Live call · Acme Corp CTO",
    transcript: [
      {
        who: "user",
        text: "Can this sit under our existing AD-integrated gateway?",
        intent: "architecture.fit",
      },
      {
        who: "agent",
        text: "Yes — keep AD at the edge. I'd mount FDE behind your gateway with service identity, not replace IdP.",
        intent: "recommend",
      },
      {
        who: "user",
        text: "We also need EU-only residency for transcripts.",
        intent: "requirement.residency",
      },
    ],
  },
  {
    id: "t1",
    kind: "tool",
    ts: "14:21:58.04",
    title: "Tool execution trace",
    lines: [
      "Executing tool: hubspot_crm_sync_deal({ deal_id: \"D-4412\", stage: \"technical-evaluation\" })",
      "Reading context vector chunk ID: 829A · namespace=acme/security",
      "MCP handshake · create_sandbox · allow_write=true · OK 41ms",
      "Collections search · query=\"active directory gateway\" · hits=6",
    ],
  },
  {
    id: "e1",
    kind: "email",
    ts: "14:18:12.77",
    title: "Outbound follow-up",
    subject: "Acme + Grok FDE — AD gateway architecture",
    body: "Great speaking earlier. Based on your AD-integrated edge gateway, the cleanest path keeps identity where it is and places FDE as a downstream technical engineer surface.\n\nAttached is the integration sketch we discussed, plus the open question on EU transcript residency.",
    attachment: "architecture-acme-ad-gateway.schema.json",
  },
  {
    id: "c1",
    kind: "chat",
    ts: "14:11:03.40",
    title: "Chat · prospect memory updated",
    preview: "Stack locked: Kubernetes · AWS · AD gateway · EU residency required",
    tone: "success",
  },
  {
    id: "c2",
    kind: "chat",
    ts: "14:09:44.91",
    title: "HITL · security exception",
    preview: "BAA / contractual HIPAA request escalated — awaiting human counsel",
    tone: "warning",
  },
  {
    id: "t2",
    kind: "tool",
    ts: "14:08:01.22",
    title: "Knowledge retrieval",
    lines: [
      "file_search · collection=acme-knowledge · top_k=8",
      "rank[0] enterprise-security.pdf#p12 · score=0.91",
      "rank[1] api-reference.md#auth · score=0.88",
    ],
  },
];

function Waveform() {
  const bars = [3, 8, 14, 9, 16, 11, 7, 15, 18, 12, 6, 13, 17, 10, 5, 14, 9, 16, 8, 4, 12, 15, 7, 11];
  return (
    <div className="flex h-12 items-end gap-[3px] rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2">
      {bars.map((h, i) => (
        <span
          key={i}
          className="wave-bar w-[3px] rounded-full bg-info"
          style={{
            height: `${h * 2}px`,
            animationDelay: `${(i % 8) * 0.08}s`,
            opacity: 0.35 + (h / 18) * 0.65,
          }}
        />
      ))}
    </div>
  );
}

export function ActivityStream() {
  const { openDrawer } = useWorkspace();

  return (
    <section className="surface-elevated flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)]">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg">
            <IconActivity size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-fg">FDE activity center</h2>
            <p className="mono-ts">Multimodal stream · Acme Corp</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border diag-info px-2 py-0.5 text-[10px] font-medium">
          <IconStatusDot tone="info" />
          Live
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-thin p-4">
        {STREAM.map((item) => (
          <article
            key={item.id}
            className="rounded-[var(--radius-lg)] border border-border bg-bg p-3 transition-premium hover:border-border-strong"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <IconStatusDot
                  tone={
                    item.kind === "voice"
                      ? "info"
                      : item.kind === "email"
                        ? "success"
                        : item.kind === "tool"
                          ? "info"
                          : item.kind === "chat" && item.tone === "warning"
                            ? "warning"
                            : "success"
                  }
                />
                <h3 className="truncate text-xs font-semibold text-fg">{item.title}</h3>
              </div>
              <time className="mono-ts shrink-0 tabular">{item.ts}</time>
            </div>

            {item.kind === "voice" && (
              <div className="space-y-2">
                <Waveform />
                <div className="space-y-1.5 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-2.5">
                  {item.transcript.map((line, i) => (
                    <div key={i} className="text-[12px] leading-relaxed">
                      <span
                        className={cn(
                          "mr-2 font-mono text-[10px] uppercase tracking-wide",
                          line.who === "user" ? "text-info" : "text-success",
                        )}
                      >
                        {line.who === "user" ? "CTO" : "Atlas"}
                      </span>
                      <span className="text-fg-secondary">{line.text}</span>
                      {line.intent && (
                        <span className="ml-2 font-mono text-[10px] text-fg-faint">
                          intent:{line.intent}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {item.kind === "email" && (
              <div className="space-y-2">
                <p className="font-mono text-[11px] text-fg-muted">Subject: {item.subject}</p>
                <div className="rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3 text-[12.5px] leading-relaxed text-fg-secondary whitespace-pre-wrap">
                  {item.body}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openDrawer({
                      title: item.attachment,
                      subtitle: "Generated architecture schema",
                      kind: "file",
                      meta: {
                        type: "architecture",
                        nodes: ["AD Gateway", "FDE", "Collections", "MCP"],
                      },
                    })
                  }
                  className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-brand-border bg-brand-dim px-3 py-2 text-left transition-premium hover:bg-brand-dim/80"
                >
                  <span className="font-mono text-[11px] text-brand-fg">{item.attachment}</span>
                  <span className="mono-ts text-brand-strong">Open</span>
                </button>
              </div>
            )}

            {item.kind === "tool" && (
              <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-[#0b1220] p-3 font-mono text-[11px] leading-relaxed text-emerald-100/90">
                {item.lines.map((l) => `› ${l}`).join("\n")}
              </pre>
            )}

            {item.kind === "chat" && (
              <p
                className={cn(
                  "rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px]",
                  item.tone === "warning" ? "diag-warning" : "border-border bg-bg-elevated text-fg-secondary",
                )}
              >
                {item.preview}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
