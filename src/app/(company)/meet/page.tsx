"use client";

import { IconLoader, IconUser, IconVideo } from "@/components/icons";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Fluid page frame — grows with the viewport instead of a narrow column. */
const FRAME = "mx-auto w-full max-w-[1600px] px-5 sm:px-8 2xl:px-12";

const CHANNELS = ["Camera", "Mic", "Live transcript", "Tools", "Shared thread"];

export default function MeetIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<"solo" | "duo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(mode: "solo" | "duo") {
    setLoading(mode);
    setError(null);
    try {
      const t = await api.createThread({
        title: mode === "duo" ? "Team meet with Atlas" : "Video with Atlas",
      });
      router.push(
        mode === "duo"
          ? `/meet/${t.conversation.id}?mode=duo`
          : `/meet/${t.conversation.id}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start meet");
      setLoading(null);
    }
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin bg-bg">
      <section className="border-b border-border bg-bg-elevated">
        <div className={cn(FRAME, "py-12 sm:py-16 2xl:py-20")}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">
                Meet
              </p>
              <h1 className="marketing-display mt-2 max-w-[22ch] text-[clamp(1.9rem,4.2vw,3.1rem)] font-medium leading-[1.04] tracking-[-0.04em] text-fg">
                Face to face with your engineer.
              </h1>
              <p className="marketing-body mt-4 max-w-[34rem] text-[15px] leading-[1.5] text-fg-muted sm:text-[16px]">
                Browser video with Atlas — camera, mic, and the same memory as
                the thread. Bring a teammate when you need two humans on the
                call.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium text-fg-secondary"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={cn(FRAME, "py-10 sm:py-12 2xl:py-16")}>
        <div className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border shadow-sm md:grid-cols-2">
          <article className="flex flex-col bg-bg-elevated p-6 sm:p-8 2xl:p-10">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg">
              <IconVideo size={20} />
            </span>
            <h2 className="marketing-display mt-5 text-[clamp(1.25rem,2.2vw,1.7rem)] font-medium leading-[1.12] tracking-[-0.03em] text-fg">
              Just me + Atlas
            </h2>
            <p className="marketing-body mt-2 max-w-[38ch] text-[14px] leading-[1.5] text-fg-muted">
              One seat, full stage. Fastest way to walk an architecture or a
              blocker in front of the FDE.
            </p>
            <button
              type="button"
              disabled={loading === "solo"}
              onClick={() => start("solo")}
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-fg px-6 text-[14.5px] font-semibold tracking-[-0.01em] text-bg-elevated transition-premium hover:opacity-90 active:scale-[0.985] disabled:opacity-50 sm:w-fit"
            >
              {loading === "solo" ? (
                <IconLoader size={16} className="animate-spin" />
              ) : (
                <IconVideo size={16} />
              )}
              Start solo meet
            </button>
          </article>

          <article className="flex flex-col bg-bg-elevated p-6 sm:p-8 2xl:p-10">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg">
              <IconUser size={20} />
            </span>
            <h2 className="marketing-display mt-5 text-[clamp(1.25rem,2.2vw,1.7rem)] font-medium leading-[1.12] tracking-[-0.03em] text-fg">
              Me + teammate + Atlas
            </h2>
            <p className="marketing-body mt-2 max-w-[38ch] text-[14px] leading-[1.5] text-fg-muted">
              Two human seats plus the FDE. Share the invite link and they land
              in the same room on the same thread.
            </p>
            <button
              type="button"
              disabled={loading === "duo"}
              onClick={() => start("duo")}
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-bg-elevated px-6 text-[14.5px] font-medium text-fg transition-premium hover:bg-bg-hover disabled:opacity-50 sm:w-fit"
            >
              {loading === "duo" ? (
                <IconLoader size={16} className="animate-spin" />
              ) : (
                <IconUser size={16} />
              )}
              Start team meet
            </button>
          </article>
        </div>

        <div className="mt-5 flex min-h-[24px] flex-wrap items-center gap-x-4 gap-y-2">
          {error && <p className="text-[13px] text-danger">{error}</p>}
          {loading && (
            <p className="inline-flex items-center gap-2 text-[13px] text-fg-muted">
              <IconLoader size={14} className="animate-spin" />
              Opening room…
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
