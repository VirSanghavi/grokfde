"use client";

import { AtlasConsole } from "@/components/marketing/AtlasConsole";
import { LiveMemory } from "@/components/marketing/LiveMemory";
import { cn } from "@/lib/utils";
import type { ProspectMemory } from "@/types/ui";
import { useState } from "react";

/**
 * The console and the memory it builds, side by side, sharing one conversation.
 *
 * They are one client component rather than two because the memory panel is not
 * commentary about the console, it is an output of it: the same stream that
 * carries the answer carries what the agent worked out about the person asking.
 * Seeing your own stack appear in the left column while the answer streams on
 * the right is the product's actual claim, made without a word of copy.
 *
 * The console is a fixed height, and the memory sits in a sticky column beside
 * it, so nothing here moves the page when an answer arrives.
 */
export function LiveEngineer() {
  const [memory, setMemory] = useState<ProspectMemory | null>(null);

  return (
    /*
      Three blocks, two orders. On a phone the console has to come second, right
      after the headline, because it is the reason to be here; the memory it
      builds reads afterwards. On a laptop the memory belongs beside the console
      where it can be seen filling in while the answer streams, so it moves into
      the left column. Explicit placement rather than `order`, which grid
      auto-placement would otherwise reshuffle.
    */
    <div
      style={{ "--stage-h": "clamp(30rem, 72svh, 44rem)" } as React.CSSProperties}
      className={cn(
        "flex flex-col gap-10",
        "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,11fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-16 lg:gap-y-10",
        // Pinned to the console's height on a laptop, so the whole section is a
        // fixed frame: an answer arriving, or memory filling in beside it, can
        // never change how tall this page is or move anything under the cursor.
        "lg:h-[var(--stage-h)]",
      )}
    >
      <div className="order-1 lg:col-start-1 lg:row-start-1">
        <h2 className="max-w-[18ch] text-display-l text-ink">
          It answers technical questions from your documentation.
        </h2>
        <p className="mt-5 max-w-[52ch] text-body-l text-ink-2">
          Trained once on your docs, your API reference, and your repository. It
          answers in the language your buyer already used.
        </p>
      </div>

      <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:min-h-0">
        <AtlasConsole onMemory={setMemory} />
      </div>

      <div className="order-3 border-t border-rule pt-8 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:pt-0">
        <LiveMemory memory={memory} />
      </div>
    </div>
  );
}
