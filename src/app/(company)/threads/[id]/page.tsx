"use client";

import { ThreadChat } from "@/components/assistant/ThreadChat";
import { IconArrowLeft, IconPhone, IconVideo } from "@/components/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

/** Fluid page frame — grows with the viewport instead of a narrow column. */
const FRAME = "mx-auto w-full max-w-[1600px] px-5 sm:px-8 2xl:px-12";
const PILL_GHOST =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border-strong bg-bg-elevated px-4 text-[13px] font-medium text-fg transition-premium hover:bg-bg-hover";

export default function ThreadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="shrink-0 border-b border-border bg-bg-elevated">
        <div className={cn(FRAME, "flex flex-wrap items-center gap-2.5 py-3.5")}>
          <Link href="/threads" className={PILL_GHOST}>
            <IconArrowLeft size={14} />
            Threads
          </Link>
          <Link href="/overview" className={cn(PILL_GHOST, "hidden sm:inline-flex")}>
            Overview
          </Link>
          <p className="mono-ts ml-auto hidden uppercase tracking-[0.14em] sm:block">
            Chat · voice · video share one memory
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] gap-6 xl:px-8 2xl:px-12">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden xl:my-6 xl:rounded-3xl xl:border xl:border-border xl:bg-bg-elevated xl:shadow-sm">
            <ThreadChat
              conversationId={id}
              onMeet={() => router.push(`/meet/${id}?mode=duo`)}
              onCall={() => router.push(`/meet/${id}`)}
            />
          </div>

          {/* Wide-screen rail — the same actions the chat header exposes, given room. */}
          <aside className="hidden w-[320px] shrink-0 flex-col gap-3 py-6 2xl:flex">
            <div className="rounded-2xl border border-border bg-bg-elevated p-5 shadow-sm">
              <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">
                This thread
              </p>
              <h2 className="marketing-display mt-1.5 text-[1.35rem] font-medium leading-[1.12] tracking-[-0.03em] text-fg">
                Take it live.
              </h2>
              <p className="marketing-body mt-2 text-[13.5px] leading-[1.5] text-fg-muted">
                Atlas carries everything from this thread into a call — stack,
                stage, and open questions.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/meet/${id}?mode=duo`)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-fg px-6 text-[14px] font-semibold tracking-[-0.01em] text-bg-elevated transition-premium hover:opacity-90 active:scale-[0.985]"
                >
                  <IconVideo size={15} />
                  Meet face to face
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/meet/${id}`)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border-strong bg-bg-elevated px-6 text-[14px] font-medium text-fg transition-premium hover:bg-bg-hover"
                >
                  <IconPhone size={15} />
                  Voice call
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg-elevated p-5 shadow-sm">
              <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">
                Channels
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Chat", "FaceTime", "Email", "Slack", "PR"].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-border px-3 py-1.5 text-[12.5px] font-medium text-fg-secondary"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
