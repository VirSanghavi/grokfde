"use client";

import { ThreadChat } from "@/components/assistant/ThreadChat";
import { IconArrowLeft } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function ThreadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-elevated px-3 py-2 sm:px-4">
        <Link href="/threads">
          <Button size="sm" variant="ghost" leftIcon={<IconArrowLeft size={14} />}>
            Threads
          </Button>
        </Link>
        <Link href="/overview" className="hidden sm:inline-flex">
          <Button size="sm" variant="ghost">
            Overview
          </Button>
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <ThreadChat
          conversationId={id}
          onMeet={() => router.push(`/meet/${id}?mode=duo`)}
          onCall={() => router.push(`/meet/${id}`)}
        />
      </div>
    </div>
  );
}
