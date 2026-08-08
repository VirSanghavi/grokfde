"use client";

import { TopNav } from "@/components/layout/TopNav";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusDot } from "@/components/ui/StatusDot";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api/client";
import type { Company, McpServer } from "@/types/ui";
import { Check, Copy, ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function AgentPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [mcp, setMcp] = useState<McpServer[]>([]);
  const [sourceCount, setSourceCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    (async () => {
      const [c, sources, servers] = await Promise.all([
        api.getCompany(),
        api.getKnowledge(),
        api.getMcpServers(),
      ]);
      setCompany(c);
      setSourceCount(sources.length);
      setMcp(servers);
    })();
  }, []);

  if (!company) return <LoadingState className="flex-1" />;

  const prospectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/fde/${company.slug}`
      : `/fde/${company.slug}`;

  return (
    <>
      <TopNav title="Agent" subtitle="Identity, share link, and runtime status" />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-2xl space-y-5 px-5 py-8 sm:px-8">
          <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <Avatar name={company.agentName} size="xl" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-fg">{company.agentName}</h2>
                  <StatusDot status="online" />
                  <Badge tone="success">Online</Badge>
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  Forward-Deployed Engineer at {company.name}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-6">
              <Stat label="Knowledge" value={String(sourceCount)} />
              <Stat
                label="MCP tools"
                value={String(mcp.reduce((n, s) => n + s.tools.length, 0))}
              />
              <Stat label="Voice" value={company.agentVoice ?? "default"} />
            </div>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              Prospect link
            </p>
            <p className="mt-2 break-all rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2 font-mono text-sm text-fg-secondary">
              {prospectUrl}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                leftIcon={
                  copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
                }
                onClick={async () => {
                  await navigator.clipboard.writeText(prospectUrl);
                  setCopied(true);
                  push("Link copied", "success");
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                Copy link
              </Button>
              <Link href={`/fde/${company.slug}`}>
                <Button size="sm" rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>
                  Open as prospect
                </Button>
              </Link>
            </div>
          </div>

          {company.knowledgeSummary && (
            <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                Company understanding
              </p>
              <dl className="mt-4 space-y-3">
                <div>
                  <dt className="text-xs text-fg-faint">What you sell</dt>
                  <dd className="text-sm text-fg-secondary">
                    {company.knowledgeSummary.whatYouSell}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-faint">Primary buyers</dt>
                  <dd className="text-sm text-fg-secondary">
                    {company.knowledgeSummary.primaryBuyers.join(" · ")}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-5 shadow-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              Demo controls
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              Reset local mock data to the seeded Grok FDE / Globex demo.
            </p>
            <Button
              className="mt-4"
              size="sm"
              variant="outline"
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={async () => {
                await api.resetDemo();
                push("Demo reset", "success");
                window.location.reload();
              }}
            >
              Reset demo data
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-lg text-fg">{value}</p>
      <p className="text-xs text-fg-muted">{label}</p>
    </div>
  );
}
