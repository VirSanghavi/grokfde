import { Suspense } from "react";

export default function FdeLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="flex h-dvh items-center justify-center bg-bg text-sm text-fg-muted">Loading…</div>}>{children}</Suspense>;
}
