"use client";

import { ProspectMemoryPanel } from "@/components/company/ProspectMemoryPanel";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api/client";
import type { Message, Prospect } from "@/types/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [agentName, setAgentName] = useState("Atlas");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [data, company] = await Promise.all([
        api.getConversation(params.id),
        api.getCompany(),
      ]);
      setAgentName(company.agentName);
      if (data) {
        setMessages(data.messages);
        setProspect(data.prospect);
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
          <Link href="/conversations">
            <Button size="sm" variant="ghost" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
              Inbox
            </Button>
          </Link>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 scrollbar-thin sm:px-8">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} agentName={agentName} />
            ))}
          </div>
        </div>
        <div className="hidden w-[300px] shrink-0 lg:block">
          <ProspectMemoryPanel name={prospect.companyName} memory={prospect.memory} />
        </div>
      </div>
    </>
  );
}
