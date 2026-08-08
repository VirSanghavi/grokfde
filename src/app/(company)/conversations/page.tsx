"use client";

import { ConversationRow } from "@/components/company/ConversationRow";
import { ProspectMemoryPanel } from "@/components/company/ProspectMemoryPanel";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { TopNav } from "@/components/layout/TopNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { api } from "@/lib/api/client";
import type { Conversation, Message, Prospect } from "@/types/ui";
import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [agentName, setAgentName] = useState("Atlas");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [list, company] = await Promise.all([api.getConversations(), api.getCompany()]);
      setConversations(list);
      setAgentName(company.agentName);
      if (list[0]) setSelectedId(list[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    api.getConversation(selectedId).then((data) => {
      if (data) {
        setMessages(data.messages);
        setProspect(data.prospect);
      }
      setDetailLoading(false);
    });
  }, [selectedId]);

  if (loading) return <LoadingState className="flex-1" label="Loading conversations" />;

  return (
    <>
      <TopNav title="Conversations" subtitle="One timeline per prospect — chat, email, and calls" />

      <div className="flex min-h-0 flex-1">
        {/* List */}
        <div className="flex w-full flex-col border-r border-border bg-bg-elevated md:w-[320px] lg:w-[360px]">
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {conversations.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-5 w-5" />}
                title="No conversations yet"
                description="When prospects talk to your FDE, they show up here."
              />
            ) : (
              conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  name={c.prospect?.companyName ?? "Prospect"}
                  channel={c.lastChannel ?? "chat"}
                  preview={c.lastMessagePreview ?? ""}
                  updatedAt={c.updatedAt}
                  active={c.id === selectedId}
                  onClick={() => {
                    setSelectedId(c.id);
                    if (window.innerWidth < 768) {
                      router.push(`/conversations/${c.id}`);
                    }
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="hidden min-w-0 flex-1 flex-col md:flex">
          {detailLoading ? (
            <LoadingState className="flex-1" />
          ) : selectedId && prospect ? (
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="border-b border-border bg-bg-elevated px-5 py-3.5">
                  <h2 className="text-sm font-semibold text-fg">{prospect.companyName}</h2>
                  <p className="text-xs text-fg-muted">
                    Unified timeline · {prospect.personName ?? "Prospect"}
                  </p>
                </div>
                <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 scrollbar-thin">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} agentName={agentName} />
                  ))}
                </div>
              </div>
              <div className="hidden w-[280px] shrink-0 border-l border-border bg-bg-elevated xl:block">
                <ProspectMemoryPanel name={prospect.companyName} memory={prospect.memory} />
              </div>
            </div>
          ) : (
            <EmptyState
              className="flex-1"
              title="Select a conversation"
              description="Inspect the full multi-channel relationship."
            />
          )}
        </div>
      </div>
    </>
  );
}
