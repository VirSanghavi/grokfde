"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { IconCheck, IconCopy } from "@/components/icons";
import { useCallback, useState } from "react";

/** Turns an app path into the absolute link a prospect would actually receive. */
export function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/**
 * Copies a real link and says so. When the browser blocks the clipboard, the
 * link is still on screen, so the failure is stated rather than swallowed.
 */
export function CopyLinkButton({
  path,
  label = "Copy link",
  copiedLabel = "Copied",
  toast = "Link copied",
  size = "md",
  variant = "secondary",
  className,
}: {
  path: string;
  label?: string;
  copiedLabel?: string;
  toast?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "outline" | "ghost";
  className?: string;
}) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl(path));
      setCopied(true);
      push(toast, "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      push("Your browser blocked the clipboard. The link is shown on screen.", "error");
    }
  }, [path, push, toast]);

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={copy}
      leftIcon={copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
