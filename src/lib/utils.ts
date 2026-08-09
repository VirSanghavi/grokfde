export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function formatRelativeTime(iso: string) {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "unknown time";
  const sec = Math.floor((Date.now() - at) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return formatDate(iso);
}

export function formatTime(iso: string) {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "unknown time";
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string) {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "unknown date";
  return at.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A sentence a person can read, from anything that was thrown. Raw error
 * objects and stack traces never reach the UI.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === "string" && err.trim()) return err.trim();
  return fallback;
}

/** `ready_for_review` / `technical-evaluation` becomes `Ready for review`. */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Aborts are expected on unmount and must never surface as an error state. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Reads a JSON route and turns a failure into an Error carrying the server's
 * own sentence, so screens can show a human message instead of a status code.
 */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* Non-JSON body: fall through to the status-based message. */
    }
  }

  if (!res.ok) {
    const message = (parsed as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message || `That request failed (${res.status}).`);
  }

  return parsed as T;
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function isMockMode() {
  // Default to live APIs; set NEXT_PUBLIC_MOCK_AI=true for offline UI demos
  return process.env.NEXT_PUBLIC_MOCK_AI === "true";
}
