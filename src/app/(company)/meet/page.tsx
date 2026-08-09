"use client";

import { IconLoader, IconVideo } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <div className="flex h-full items-center justify-center bg-bg px-5">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-bg-elevated p-8 text-center shadow-md">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg">
          <IconVideo size={22} />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-fg">
          Meet with Atlas
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Face-to-face with your FDE. Bring a teammate when you need two humans on
          the call.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            loading={loading === "solo"}
            onClick={() => start("solo")}
          >
            Just me + Atlas
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            loading={loading === "duo"}
            onClick={() => start("duo")}
          >
            Me + teammate + Atlas
          </Button>
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        {loading && (
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-fg-muted">
            <IconLoader size={14} className="animate-spin" />
            Opening room…
          </p>
        )}
      </div>
    </div>
  );
}
