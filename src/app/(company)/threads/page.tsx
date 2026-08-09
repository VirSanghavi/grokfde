"use client";

import {
  IconMessage,
  IconPlus,
  IconSearch,
  IconVideo,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation } from "@/types/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function ThreadsPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.getConversations();
      setThreads(
        [...list].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
      );
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((t) => {
      const name = (
        t.prospect?.companyName ||
        t.prospect?.personName ||
        ""
      ).toLowerCase();
      const preview = (t.lastMessagePreview || "").toLowerCase();
      return name.includes(needle) || preview.includes(needle);
    });
  }, [threads, q]);

  async function newThread() {
    setCreating(true);
    try {
      const t = await api.createThread({ title: "New thread" });
      router.push(`/threads/${t.conversation.id}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="shrink-0 border-b border-border bg-bg-elevated px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-ts uppercase tracking-[0.14em]">Threads</p>
            <h1 className="text-xl font-semibold tracking-tight text-fg">
              Conversations with Atlas
            </h1>
          </div>
          <div className="flex gap-2">
            <Link href="/meet">
              <Button size="sm" variant="secondary" leftIcon={<IconVideo size={14} />}>
                Meet
              </Button>
            </Link>
            <Button
              size="sm"
              loading={creating}
              onClick={newThread}
              leftIcon={<IconPlus size={14} />}
            >
              New thread
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-3xl">
          <label className="flex h-10 items-center gap-2 rounded-full border border-border bg-bg px-3.5">
            <IconSearch size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search threads…"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
            />
          </label>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-5 py-5 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-[14px]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-border bg-bg-elevated px-6 py-14 text-center">
              <IconMessage size={22} className="mx-auto opacity-50" />
              <p className="mt-3 text-sm font-medium text-fg">No threads yet</p>
              <p className="mt-1 text-sm text-fg-muted">
                Start from Overview or create a new thread here.
              </p>
              <Button className="mt-4" size="sm" onClick={newThread} loading={creating}>
                Start a thread
              </Button>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-[16px] border border-border bg-bg-elevated shadow-sm">
              {filtered.map((t, i) => {
                const name =
                  t.prospect?.companyName || t.prospect?.personName || "Thread";
                return (
                  <li key={t.id}>
                    <Link
                      href={`/threads/${t.id}`}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5 transition-premium hover:bg-bg-hover",
                        i > 0 && "border-t border-border",
                      )}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg">
                        <IconMessage size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-fg">{name}</p>
                          {t.lastChannel && (
                            <span className="mono-ts rounded-full border border-border px-1.5 uppercase">
                              {t.lastChannel}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-fg-muted">
                          {t.lastMessagePreview || "No messages yet"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="mono-ts">{formatRelativeTime(t.updatedAt)}</span>
                        <Link
                          href={`/meet/${t.id}?mode=duo`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:text-fg"
                        >
                          <IconVideo size={12} />
                          Meet
                        </Link>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
