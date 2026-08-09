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
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3">
        <div className="min-w-0">
          <p className="mono-ts uppercase tracking-[0.14em]">Live meet</p>
          <p className="truncate text-sm font-semibold text-fg">
            {duo ? "You · Teammate · " : "You · "}
            {agentName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {duo && (
            <Button size="sm" variant="secondary" onClick={copyInvite} leftIcon={<IconCopy size={14} />}>
              {copied ? "Link copied" : "Invite teammate"}
            </Button>
          )}
          <Link href={`/threads/${id}`}>
            <Button size="sm" variant="ghost">
              Open thread
            </Button>
          </Link>
          <Button
            size="sm"
            variant="danger"
            leftIcon={<IconPhoneOff size={14} />}
            onClick={() => router.push("/overview")}
          >
            Leave
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        {/* Video stage */}
        <div className="flex min-h-0 flex-col gap-3 p-4">
          <div
            className={cn(
              "grid min-h-0 flex-1 gap-3",
              duo ? "sm:grid-cols-2" : "grid-cols-1",
            )}
          >
            {/* You — a camera tile, so it stays ink even on the light page */}
            <div className="relative overflow-hidden rounded-[18px] border border-border bg-fg">
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Avatar name="You" size="xl" />
                  <p className="text-sm text-white/70">
                    {camOff ? "Camera off" : "Camera permission needed"}
                  </p>
                </div>
              )}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">
                <IconStatusDot tone="success" />
                You
              </div>
            </div>

            {/* Teammate seat — empty until they join, so it reads as a light placeholder */}
            {duo && (
              <div className="relative overflow-hidden rounded-[18px] border border-dashed border-border-strong bg-bg-elevated">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-bg">
                    <IconVideo size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-fg">Teammate seat</p>
                    <p className="mt-1 max-w-xs text-xs text-fg-muted">
                      Share the invite link. When they open it, they join this room on the same
                      thread.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={copyInvite}>
                    {copied ? "Copied" : "Copy invite link"}
                  </Button>
                </div>
                <div className="absolute bottom-3 left-3 rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-fg-muted">
                  Waiting…
                </div>
              </div>
            )}
          </div>

          {/* Atlas strip */}
          <div className="flex items-center justify-between gap-3 rounded-[16px] border border-border bg-bg-elevated px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar name={agentName} size="md" />
              <div>
                <p className="text-sm font-semibold text-fg">{agentName}</p>
                <p className="text-xs text-fg-muted">FDE on this thread · ready for voice</p>
              </div>
            </div>
            <Button size="sm" onClick={() => setCallOpen(true)} leftIcon={<IconPhone size={14} />}>
              Connect voice
            </Button>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 pb-2">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full border transition-premium",
                muted
                  ? "border-danger/40 bg-danger-dim text-danger"
                  : "border-border bg-bg-elevated text-fg-secondary hover:bg-bg-hover",
              )}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <IconMicOff size={18} /> : <IconMic size={18} />}
            </button>
            <button
              type="button"
              onClick={() => setCamOff((c) => !c)}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full border transition-premium",
                camOff
                  ? "border-danger/40 bg-danger-dim text-danger"
                  : "border-border bg-bg-elevated text-fg-secondary hover:bg-bg-hover",
              )}
              aria-label={camOff ? "Camera on" : "Camera off"}
            >
              {camOff ? <IconVideoOff size={18} /> : <IconVideo size={18} />}
            </button>
            <button
              type="button"
              onClick={() => router.push("/overview")}
              className="flex h-12 min-w-[120px] items-center justify-center gap-2 rounded-full bg-danger px-5 text-sm font-semibold text-white transition-premium hover:opacity-90"
            >
              <IconPhoneOff size={16} />
              Leave
            </button>
          </div>
        </div>

        {/* Side thread — keep talking to Atlas in text during meet */}
        <div className="hidden min-h-0 border-l border-border bg-bg-elevated lg:flex lg:flex-col">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-medium text-fg">Thread alongside the meet</p>
            <p className="text-[11px] text-fg-muted">
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
