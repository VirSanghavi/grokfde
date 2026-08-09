import { PageSkeleton } from "@/components/prospect/ProspectStates";
import { Suspense } from "react";

/**
 * The pages below read search params, so they suspend. The fallback is the
 * page's own skeleton rather than the word "Loading", so the first paint is
 * already the shape of the real thing and nothing jumps when it arrives.
 */
export default function FdeLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}
