"use client";

import { ProspectMemoryPanel } from "@/components/company/ProspectMemoryPanel";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api/client";
import type { Message, Prospect } from "@/types/ui";
import { IconArrowLeft, IconBuilding, IconCode } from "@/components/icons";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [agentName, setAgentName] = useState("Atlas");
  const [loading, setLoading] = useState(true);
  const [implStatus, setImplStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [data, company, ws] = await Promise.all([
        api.getConversation(params.id),
        api.getCompany(),
        api.getWorkspaceByConversation(params.id),
      ]);
      setAgentName(company.agentName);
      if (data) {
        setMessages(data.messages);
        setProspect(data.prospect);
      }
      if (ws) {
        setImplStatus(ws.status);
      }
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <LoadingState className="flex-1" />;
  if (!prospect) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-fg-muted">Conversation not found</p>
        <Link href="/conversations">
          <Button variant="secondary">Back</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <TopNav
        title={prospect.companyName}
        subtitle="Unified timeline across chat, email, and calls"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {prospect && (
              <Link href={`/accounts/${prospect.id}`}>
                <Button size="sm" variant="secondary" leftIcon={<IconBuilding className="h-3.5 w-3.5" />}>
                  Account Room
                </Button>
              </Link>
            )}
            <Link href={`/conversations/${params.id}/workspace`}>
              <Button size="sm" leftIcon={<IconCode className="h-3.5 w-3.5" />}>
                {implStatus && implStatus !== "discovery"
                  ? "Open Implementation"
                  : "Start Implementation"}
              </Button>
            </Link>
            <Link href="/conversations">
              <Button size="sm" variant="ghost" leftIcon={<IconArrowLeft className="h-3.5 w-3.5" />}>
                Inbox
              </Button>
            </Link>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 scrollbar-thin sm:px-8">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} agentName={agentName} />
            ))}
            <div className="mx-auto max-w-xl rounded-[var(--radius-lg)] border border-border bg-bg-elevated p-4 shadow-sm">
              <p className="text-sm font-medium text-fg">
                {agentName} can move from conversation into implementation
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                Connect their codebase, propose changes, build on a branch, and prepare a PR for
                review.
                {implStatus ? ` Current status: ${implStatus.replace(/_/g, " ")}.` : ""}
              </p>
              <Link href={`/conversations/${params.id}/workspace`} className="mt-3 inline-flex">
                <Button size="sm" leftIcon={<IconCode className="h-3.5 w-3.5" />}>
                  {implStatus && implStatus !== "discovery"
                    ? "Continue Implementation"
                    : "Start Implementation"}
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="hidden w-[300px] shrink-0 lg:block">
          <ProspectMemoryPanel name={prospect.companyName} memory={prospect.memory} />
        </div>
      </div>
    </>
  );
}
