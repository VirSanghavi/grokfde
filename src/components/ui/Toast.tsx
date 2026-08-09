"use client";

import { cn } from "@/lib/utils";
import { IconAlert, IconCheck, IconX } from "@/components/icons";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconButton } from "./IconButton";

/**
 * `info` is a neutral notice. It reads exactly like `default` on purpose: the
 * vermilion is reserved for live state, so an informational toast never earns
 * a colour of its own.
 */
type ToastTone = "default" | "info" | "success" | "error";

interface ToastOptions {
  /** Milliseconds on screen. Errors default to longer because they matter. */
  duration?: number;
  /** A single real recovery action, for example "Try again". */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, string> = {
  default: "border-rule bg-surface text-ink",
  info: "border-rule bg-surface text-ink",
  success: "border-positive-rule bg-surface text-ink",
  error: "border-critical-rule bg-surface text-ink",
};

const toneIconColor: Record<ToastTone, string> = {
  default: "text-ink-3",
  info: "text-ink-3",
  success: "text-positive-ink",
  error: "text-critical",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = "default", options?: ToastOptions) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = options?.duration ?? (tone === "error" ? 7000 : 4000);

      setItems((prev) => [...prev.slice(-3), { id, message, tone, ...options }]);
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setItems((prev) => prev.filter((t) => t.id !== id));
        }, duration),
      );
    },
    [],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[360px]"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-sheet pointer-events-auto flex items-start gap-3 rounded-[var(--radius-panel)] border px-4 py-3 shadow-[var(--elevation-2)]",
              toneStyles[t.tone],
            )}
          >
            {(t.tone === "success" || t.tone === "error") && (
              <span className={cn("mt-0.5 shrink-0", toneIconColor[t.tone])}>
                {t.tone === "success" ? <IconCheck size={16} /> : <IconAlert size={16} />}
              </span>
            )}
            <p className="min-w-0 flex-1 text-[0.875rem] leading-5 break-words">
              {t.message}
            </p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="transition-premium shrink-0 rounded-[var(--radius-control)] text-[0.875rem] font-medium text-ink underline underline-offset-2 hover:text-ink-2 active:scale-[0.98]"
              >
                {t.action.label}
              </button>
            )}
            <IconButton
              label="Dismiss notification"
              size="sm"
              onClick={() => dismiss(t.id)}
              className="-my-1 -mr-2 shrink-0"
            >
              <IconX size={14} />
            </IconButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
