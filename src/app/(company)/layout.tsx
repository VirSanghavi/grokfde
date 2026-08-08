"use client";

import { CompanyShell } from "@/components/layout/CompanyShell";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function CompanyLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Onboarding is full-bleed without company chrome
  if (pathname?.startsWith("/onboarding")) {
    return <>{children}</>;
  }
  return <CompanyShell>{children}</CompanyShell>;
}
