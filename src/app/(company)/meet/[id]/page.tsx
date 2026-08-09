"use client";

import { CallOverlay } from "@/components/prospect/CallOverlay";
import { ThreadChat } from "@/components/assistant/ThreadChat";
import {
  IconCopy,
  IconMic,
  IconMicOff,
  IconPhone,
  IconPhoneOff,
  IconStatusDot,
  IconVideo,
  IconVideoOff,
} from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

/** Pill chrome, borrowed from the marketing language and kept on the light theme. */
const PILL_GHOST =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border-strong bg-bg-elevated px-4 text-[13px] font-medium text-fg transition-premium hover:bg-bg-hover";

/**
 * Two-person (or solo) video meet with Atlas on the thread.
 * Teammate joins via shared link — local camera for you, placeholder seat for invitee,
 * Atlas voice/video via existing call overlay path.
 */
export default function MeetRoomPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = params.id;
  const duo = search.get("mode") === "duo" || search.get("join") === "1";

  const [agentName, setAgentName] = useState("Atlas");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/meet/${id}?mode=duo&join=1`;
  }, [id]);

  useEffect(() => {
    api.getCompany().then((c) => setAgentName(c.agentName)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
        setStreamReady(true);
      } catch {
        setStreamReady(false);
      }
    })();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [muted]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !camOff;
    });
  }, [camOff]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg text-fg">
      <header className="shrink-0 border-b border-border bg-bg-elevated">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-5 py-4 sm:px-8 2xl:px-12">
          <div className="min-w-0">
            <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">
              Live meet
            </p>
            <h1 className="marketing-display mt-0.5 truncate text-[clamp(1.15rem,2.2vw,1.6rem)] font-medium leading-[1.1] tracking-[-0.03em] text-fg">
              {duo ? "You · Teammate · " : "You · "}
              {agentName}
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {duo && (
              <button type="button" onClick={copyInvite} className={PILL_GHOST}>
                <IconCopy size={14} />
                {copied ? "Link copied" : "Invite teammate"}
              </button>
            )}
            <Link href={`/threads/${id}`} className={PILL_GHOST}>
              Open thread
            </Link>
            <Button
              size="sm"
              variant="danger"
              className="rounded-full! h-9! px-4!"
              leftIcon={<IconPhoneOff size={14} />}
              onClick={() => router.push("/overview")}
            >
              Leave
            </Button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,26vw)] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Video stage */}
        <div className="flex min-h-0 flex-col gap-4 p-4 sm:p-5 xl:p-6 2xl:p-8">
          <div
            className={cn(
              "grid min-h-0 flex-1 gap-4",
              duo ? "sm:grid-cols-2" : "grid-cols-1",
            )}
          >
            {/* You — a camera tile, so it stays ink even on the light page */}
            <div className="relative overflow-hidden rounded-3xl border border-border bg-fg shadow-sm">
              <video
                ref={videoRef}
                muted
                playsInline
                className={cn(
                  "absolute inset-0 h-full w-full object-cover",
                  camOff && "opacity-0",
                )}
              />
              {(!streamReady || camOff) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Avatar name="You" size="xl" />
                  <p className="text-sm text-white/70">
                    {camOff ? "Camera off" : "Camera permission needed"}
                  </p>
                </div>
              )}
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur-md">
                <IconStatusDot tone="success" />
                You
              </div>
            </div>

            {/* Teammate seat — empty until they join, so it reads as a light placeholder */}
            {duo && (
              <div className="relative overflow-hidden rounded-3xl border border-dashed border-border-strong bg-bg-elevated">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-bg">
                    <IconVideo size={22} />
                  </div>
                  <div>
                    <p className="marketing-display text-[1.15rem] font-medium leading-[1.15] tracking-[-0.03em] text-fg">
                      Teammate seat
                    </p>
                    <p className="marketing-body mx-auto mt-2 max-w-sm text-[13.5px] leading-[1.5] text-fg-muted">
                      Share the invite link. When they open it, they join this room on the same
                      thread.
                    </p>
                  </div>
                  <button type="button" onClick={copyInvite} className={PILL_GHOST}>
                    <IconCopy size={14} />
                    {copied ? "Copied" : "Copy invite link"}
                  </button>
                </div>
                <div className="absolute bottom-4 left-4 rounded-full border border-border bg-bg px-3 py-1.5 text-[12.5px] font-medium text-fg-muted">
                  Waiting…
                </div>
              </div>
            )}
          </div>

          {/* Atlas strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-elevated px-5 py-4 shadow-sm">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={agentName} size="md" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold tracking-[-0.015em] text-fg">
                  {agentName}
                </p>
                <p className="truncate text-[13px] text-fg-muted">
                  FDE on this thread · ready for voice
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCallOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-fg px-6 text-[14px] font-semibold tracking-[-0.01em] text-bg-elevated transition-premium hover:opacity-90 active:scale-[0.985]"
            >
              <IconPhone size={15} />
              Connect voice
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 pb-1">
            {/* Labelled to match the call overlay: the dotted icon set is
                deliberately low-contrast, so icon-only state reads ambiguously. */}
            <button
              type="button"
              aria-pressed={muted}
              onClick={() => setMuted((m) => !m)}
              className={cn(
                "flex h-12 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-premium",
                muted
                  ? "border-danger/40 bg-danger-dim text-danger"
                  : "border-border bg-bg-elevated text-fg-secondary shadow-sm hover:bg-bg-hover",
              )}
            >
              {muted ? <IconMicOff size={18} /> : <IconMic size={18} />}
              {muted ? "Muted" : "Mic on"}
            </button>
            <button
              type="button"
              aria-pressed={camOff}
              onClick={() => setCamOff((c) => !c)}
              className={cn(
                "flex h-12 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-premium",
                camOff
                  ? "border-danger/40 bg-danger-dim text-danger"
                  : "border-border bg-bg-elevated text-fg-secondary shadow-sm hover:bg-bg-hover",
              )}
            >
              {camOff ? <IconVideoOff size={18} /> : <IconVideo size={18} />}
              {camOff ? "Camera off" : "Camera on"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/overview")}
              className="flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-full bg-danger px-6 text-[14px] font-semibold text-white transition-premium hover:opacity-90 active:scale-[0.985]"
            >
              <IconPhoneOff size={16} />
              Leave
            </button>
          </div>
        </div>

        {/* Side thread — keep talking to Atlas in text during meet */}
        <div className="hidden min-h-0 border-l border-border bg-bg-elevated lg:flex lg:flex-col">
          <div className="border-b border-border px-5 py-4">
            <p className="text-[12px] font-medium tracking-[-0.01em] text-fg-faint">
              Alongside the meet
            </p>
            <p className="marketing-display mt-0.5 text-[1.05rem] font-medium leading-[1.15] tracking-[-0.03em] text-fg">
              Same thread, in text.
            </p>
            <p className="marketing-body mt-1 text-[12.5px] leading-[1.45] text-fg-muted">
              Notes and follow-ups stay on the same conversation.
            </p>
          </div>
          <div className="min-h-0 flex-1">
            <ThreadChat conversationId={id} agentName={agentName} showHeader={false} />
          </div>
        </div>
      </div>

      <CallOverlay
        open={callOpen}
        agentName={agentName}
        conversationId={id}
        onClose={() => setCallOpen(false)}
        onComplete={() => {
          setCallOpen(false);
        }}
      />
    </div>
  );
}
