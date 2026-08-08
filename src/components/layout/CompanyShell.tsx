"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { IconButton } from "@/components/ui/IconButton";
import { api } from "@/lib/api/client";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function CompanyShell({ children }: { children: ReactNode }) {
  const [agentName, setAgentName] = useState("Atlas");
  const [companyName, setCompanyName] = useState("Grok FDE");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    api.getCompany().then((c) => {
      setAgentName(c.agentName);
      setCompanyName(c.name);
    });
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <div className="hidden md:flex">
        <Sidebar agentName={agentName} companyName={companyName} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            className="absolute inset-0 bg-fg/30 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full shadow-lg animate-in">
            <Sidebar agentName={agentName} companyName={companyName} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-bg-elevated px-3 py-2.5 md:hidden">
          <IconButton label="Menu" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </IconButton>
          <span className="text-sm font-semibold text-fg">{companyName}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
