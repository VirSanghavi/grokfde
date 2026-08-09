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

/** Fluid page frame — grows with the viewport instead of a narrow column. */
const FRAME = "mx-auto w-full max-w-[1600px] px-5 sm:px-8 2xl:px-12";
/** Landing-page pill, translated to the light theme. */
const PILL_GHOST =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border-strong bg-bg-elevated px-4 text-[13px] font-medium text-fg transition-premium hover:bg-bg-hover";

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
      <header className="shrink-0 border-b border-border bg-bg-elevated">
        <div className={cn(FRAME, "py-8 sm:py-10")}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">
                Threads
              </p>
              <h1 className="marketing-display mt-1.5 text-[clamp(1.6rem,3.2vw,2.35rem)] font-medium leading-[1.08] tracking-[-0.035em] text-fg">
                Conversations with Atlas.
              </h1>
              <p className="marketing-body mt-2.5 max-w-[34rem] text-[14px] leading-[1.5] text-fg-muted sm:text-[15px]">
                Chat and video share the same memory. Pick up any thread exactly
                where it stopped.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/meet">
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full! h-10! px-5!"
                  leftIcon={<IconVideo size={14} />}
                >
                  Meet
                </Button>
              </Link>
              <Button
                size="sm"
                loading={creating}
                onClick={newThread}
                className="rounded-full! h-10! px-5!"
                leftIcon={<IconPlus size={14} />}
              >
                New thread
              </Button>
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-bg px-4 transition-premium focus-within:border-border-strong">
              <IconSearch size={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search threads…"
                className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
              />
            </label>
            <p className="mono-ts shrink-0 uppercase tracking-[0.14em] sm:pl-2">
              {loading
                ? "Loading…"
                : `${filtered.length} thread${filtered.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className={cn(FRAME, "py-6 sm:py-8")}>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-[168px] rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border-strong bg-bg-elevated px-6 py-20 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg">
                <IconMessage size={20} />
              </span>
              <h2 className="marketing-display mt-5 text-[clamp(1.25rem,2.4vw,1.6rem)] font-medium leading-[1.15] tracking-[-0.03em] text-fg">
                No threads yet.
              </h2>
              <p className="marketing-body mx-auto mt-2 max-w-sm text-[14px] leading-[1.5] text-fg-muted">
                Start from Overview or open a new thread here. Atlas keeps the
                context across chat and video.
              </p>
              <Button
                className="mt-6 rounded-full! h-11! px-6!"
                onClick={newThread}
                loading={creating}
              >
                Start a thread
              </Button>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((t) => {
                const name =
                  t.prospect?.companyName || t.prospect?.personName || "Thread";
                return (
                  <li
                    key={t.id}
                    className="group relative flex flex-col rounded-2xl border border-border bg-bg-elevated p-5 shadow-sm transition-premium hover:border-border-strong hover:shadow-md"
                  >
                    <Link
                      href={`/threads/${t.id}`}
                      aria-label={name}
                      className="absolute inset-0 rounded-2xl"
                    />
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg">
                        <IconMessage size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold tracking-[-0.015em] text-fg">
                          {name}
                        </p>
                        {t.lastChannel && (
                          <span className="mono-ts mt-1 inline-flex rounded-full border border-border px-2 py-0.5 uppercase tracking-[0.12em]">
                            {t.lastChannel}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="mt-4 line-clamp-2 min-h-[2.6em] text-[13.5px] leading-snug text-fg-muted">
                      {t.lastMessagePreview || "No messages yet"}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                      <span className="mono-ts">
                        {formatRelativeTime(t.updatedAt)}
                      </span>
                      <Link
                        href={`/meet/${t.id}?mode=duo`}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(PILL_GHOST, "relative z-10")}
                      >
                        <IconVideo size={13} />
                        Meet
                      </Link>
                    </div>
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
