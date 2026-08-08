"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { Escalation } from "@/types/ui";
import { useState } from "react";

export function EscalationCard({
  escalation,
  onRespond,
}: {
  escalation: Escalation;
  onRespond?: (id: string, response: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="rounded-[var(--radius-xl)] border border-danger/20 bg-bg-elevated p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="danger">Needs you</Badge>
            <span className="text-sm font-medium text-fg">{escalation.prospectName}</span>
          </div>
          <p className="mt-2 text-sm text-fg">
            <span className="text-fg-muted">Question: </span>
            {escalation.question}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            <span className="text-fg-faint">Reason: </span>
            {escalation.reason}
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Respond
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <Textarea
            label="Your response"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Write the definitive answer for the prospect..."
            className="min-h-[100px]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={loading}
              disabled={!response.trim()}
              onClick={async () => {
                if (!onRespond) return;
                setLoading(true);
                try {
                  await onRespond(escalation.id, response.trim());
                  setOpen(false);
                  setResponse("");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Send response
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
