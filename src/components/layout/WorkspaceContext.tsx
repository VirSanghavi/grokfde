"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DrawerPayload = {
  title: string;
  subtitle?: string;
  kind?: "mcp" | "event" | "file" | "tool" | "generic";
  body?: ReactNode;
  meta?: Record<string, unknown>;
};

type WorkspaceContextValue = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  drawerOpen: boolean;
  drawer: DrawerPayload | null;
  openDrawer: (payload: DrawerPayload) => void;
  closeDrawer: () => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerPayload | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  const openDrawer = useCallback((payload: DrawerPayload) => {
    setDrawer(payload);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
      drawerOpen,
      drawer,
      openDrawer,
      closeDrawer,
      commandOpen,
      setCommandOpen,
    }),
    [
      sidebarCollapsed,
      toggleSidebar,
      drawerOpen,
      drawer,
      openDrawer,
      closeDrawer,
      commandOpen,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
