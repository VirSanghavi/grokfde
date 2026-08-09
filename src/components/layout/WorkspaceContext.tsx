"use client";

import { agentDisplayName, resolvePersona, type Persona } from "@/lib/personas";
import { clearStoredCompany, getStoredCompanyId, setStoredCompany } from "@/lib/session";
import { errorMessage, fetchJson, isAbortError } from "@/lib/utils";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/* ── The company whose control room this is ──────────────────────────────── */

/**
 * Everything the product surfaces need to speak in the customer's own terms:
 * their name, their agent's name, what they sell, who they sell to. A law firm
 * and a Kubernetes vendor read the same screens and both see themselves.
 */
export interface CompanyProfile {
  id: string;
  name: string;
  slug: string;
  description?: string;
  /** Always from `agentDisplayName`. Never the literal "Atlas". */
  agentName: string;
  /** The coherent identity: name, voice, and drawn appearance all agree. */
  persona: Persona;
  agentVoice?: string;
  agentGreeting?: string;
  /** One sentence describing what this company sells, from their knowledge. */
  whatWeSell?: string;
  /** Who they sell to, from their knowledge. Empty until knowledge is added. */
  buyerTypes: string[];
  products: string[];
  createdAt: string;
}

export interface CompanyOption {
  id: string;
  name: string;
  slug: string;
  agentName: string;
}

const str = (v: unknown, fallback = "") => (v == null ? fallback : String(v));
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

function toProfile(raw: Record<string, unknown>): CompanyProfile {
  // The knowledge summary is written by the extraction pass and its keys differ
  // by vintage, so every field is read defensively and may legitimately be absent.
  const summary = (raw.knowledgeSummary ?? raw.knowledge_summary_json ?? {}) as Record<
    string,
    unknown
  >;

  // The agent belongs to this company, so its name and voice come from the
  // persona resolver, never from a literal in a component.
  const identity = {
    slug: str(raw.slug) || null,
    agent_name: str(raw.agentName ?? raw.agent_name) || null,
    agent_voice: str(raw.agentVoice ?? raw.agent_voice) || null,
    agent_persona: str(raw.agentPersona ?? raw.agent_persona) || null,
  };
  const persona = resolvePersona(identity);

  return {
    id: str(raw.id),
    name: str(raw.name, "Your company"),
    slug: str(raw.slug),
    description: str(raw.description) || undefined,
    agentName: agentDisplayName(identity),
    persona,
    agentVoice: str(raw.agentVoice ?? raw.agent_voice) || persona.voice,
    agentGreeting: str(raw.agentGreeting ?? raw.agent_greeting) || undefined,
    whatWeSell:
      str(summary.companyDescription) ||
      str(summary.whatYouSell) ||
      str(summary.valueProposition) ||
      undefined,
    buyerTypes: strList(summary.buyerTypes ?? summary.primaryBuyers),
    products: strList(summary.products),
    createdAt: str(raw.createdAt ?? raw.created_at, new Date().toISOString()),
  };
}

function toOption(raw: Record<string, unknown>): CompanyOption {
  return {
    id: str(raw.id),
    name: str(raw.name, "Untitled company"),
    slug: str(raw.slug),
    agentName: agentDisplayName({
      slug: str(raw.slug) || null,
      agent_name: str(raw.agentName ?? raw.agent_name) || null,
      agent_voice: str(raw.agentVoice ?? raw.agent_voice) || null,
      agent_persona: str(raw.agentPersona ?? raw.agent_persona) || null,
    }),
  };
}

export type CompanyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** More than one company exists and none is chosen. Never guess for them. */
  | { status: "choosing"; options: CompanyOption[] }
  | { status: "none" }
  | { status: "ready"; company: CompanyProfile; options: CompanyOption[] };

interface CompanyContextValue {
  state: CompanyState;
  select: (id: string) => void;
  switchCompany: () => void;
  retry: () => void;
  refresh: () => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CompanyState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState({ status: "loading" });

    (async (): Promise<CompanyState> => {
      const wanted = chosenId ?? getStoredCompanyId();

      // The picker needs the full list either way, and it is one cheap query.
      const listed = await fetchJson<{ companies?: Record<string, unknown>[] }>(
        "/api/company",
        { signal: controller.signal },
      );
      const options = (listed.companies ?? []).map(toOption).filter((c) => c.id);

      if (options.length === 0) return { status: "none" };

      const resolvedId =
        (wanted && options.some((c) => c.id === wanted) ? wanted : null) ??
        (options.length === 1 ? options[0]!.id : null);

      if (!resolvedId) return { status: "choosing", options };

      const detail = await fetchJson<{ company: Record<string, unknown> }>(
        `/api/company?id=${encodeURIComponent(resolvedId)}`,
        { signal: controller.signal },
      );
      const company = toProfile(detail.company);
      setStoredCompany(company.id, company.slug);
      return { status: "ready", company, options };
    })()
      .then((next) => {
        if (active) setState(next);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setState({
          status: "error",
          message: errorMessage(err, "We could not load your workspace."),
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey, chosenId]);

  const select = useCallback((id: string) => {
    setStoredCompany(id);
    setChosenId(id);
  }, []);

  const switchCompany = useCallback(() => {
    clearStoredCompany();
    setChosenId(null);
    setState((current) =>
      current.status === "ready"
        ? { status: "choosing", options: current.options }
        : current,
    );
  }, []);

  const retry = useCallback(() => setReloadKey((n) => n + 1), []);

  const value = useMemo<CompanyContextValue>(
    () => ({ state, select, switchCompany, retry, refresh: retry }),
    [state, select, switchCompany, retry],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyState() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyState must be used within CompanyProvider");
  return ctx;
}

/**
 * The shell only renders page content once a company is resolved, so pages can
 * read it directly instead of every screen re-deriving it.
 */
export function useActiveCompany(): CompanyProfile {
  const { state } = useCompanyState();
  if (state.status !== "ready") {
    throw new Error("useActiveCompany used outside a resolved company");
  }
  return state.company;
}

/* ── Shell chrome state ──────────────────────────────────────────────────── */

interface WorkspaceContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);

  const value = useMemo(
    () => ({ sidebarCollapsed, toggleSidebar, commandOpen, setCommandOpen }),
    [sidebarCollapsed, toggleSidebar, commandOpen],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <CompanyProvider>{children}</CompanyProvider>
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
