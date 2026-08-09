"use client";

import { AgentActivity } from "@/components/prospect/AgentActivity";
import { MessageBubble } from "@/components/prospect/MessageBubble";
import { PromptComposer } from "@/components/assistant/PromptComposer";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import {
  IconLoader,
  IconPhone,
  IconStatusDot,
  IconVideo,
} from "@/components/icons";
import { api } from "@/lib/api/client";
import type { AgentEvent, Message } from "@/types/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  conversationId: string;
  agentName?: string;
  title?: string;
  compact?: boolean;
  showHeader?: boolean;
  onMeet?: () => void;
  onCall?: () => void;
};

export function ThreadChat({
  conversationId,
  agentName: agentNameProp,
  title,
  compact,
  showHeader = true,
  onMeet,
  onCall,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentName, setAgentName] = useState(agentNameProp || "Atlas");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<AgentEvent[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const reload = useCallback(async () => {
    const [detail, company] = await Promise.all([
      api.getConversation(conversationId),
      api.getCompany().catch(() => null),
    ]);
    if (company) setAgentName(company.agentName);
    if (detail) setMessages(detail.messages);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    reload().catch(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    scroll();
  }, [messages, pending, scroll]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const optimistic: Message = {
      id: `tmp_${Date.now()}`,
      conversationId,
      channel: "chat",
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setPending([{ type: "searching_knowledge", label: "Working" }]);
    try {
      const res = await api.sendMessage(conversationId, text);
      setPending(res.events || []);
      await new Promise((r) => setTimeout(r, 400));
      setMessages((prev) => {
        const without = prev.filter((x) => x.id !== optimistic.id);
        return [
          ...without,
          { ...optimistic, id: `user_${Date.now()}` },
          res.message,
        ];
      });
      setPending([]);
    } catch {
      setPending([]);
      setMessages((prev) => prev.filter((x) => x.id !== optimistic.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showHeader && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={agentName} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-fg">
                  {title || agentName}
                </p>
                <IconStatusDot tone="success" />
              </div>
              <p className="truncate text-xs text-fg-muted">
                Forward-Deployed Engineer · always on
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onCall && (
              <Button size="sm" variant="secondary" onClick={onCall} leftIcon={<IconPhone size={14} />}>
                Call
              </Button>
            )}
            {onMeet && (
              <Button size="sm" variant="secondary" onClick={onMeet} leftIcon={<IconVideo size={14} />}>
                Meet
              </Button>
            )}
            <Link href={`/meet/${conversationId}`}>
              <Button size="sm" leftIcon={<IconVideo size={14} />}>
                Video
              </Button>
            </Link>
          </div>
        </header>
      )}

      <div
        className={`min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin px-4 py-5 ${
          compact ? "max-h-[420px]" : ""
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-muted">
            <IconLoader size={16} className="animate-spin" />
            Loading thread…
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-md py-12 text-center">
            <Avatar name={agentName} size="lg" className="mx-auto" />
            <p className="mt-4 text-sm font-medium text-fg">
              Start with {agentName}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Ask about accounts, implementations, blockers, or jump on a video meet.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} agentName={agentName} />
          ))
        )}
        {pending.length > 0 && (
          <div className="pl-11">
            <AgentActivity events={pending} live />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-bg-elevated px-4 py-3">
        <PromptComposer
          value={input}
          onChange={setInput}
          onSubmit={send}
          loading={sending}
          expanded
          autoFocus={!compact}
          placeholder={`Message ${agentName}…`}
          onStartMeet={onMeet || (() => {
            window.location.href = `/meet/${conversationId}`;
          })}
        />
      </div>
    </div>
  );
}
