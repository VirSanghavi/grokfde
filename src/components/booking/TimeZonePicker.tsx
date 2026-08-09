"use client";

import { IconChevronDown, IconGlobe, IconSearch } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A real timezone selector, not a label. Changing it re-renders every time on
 * the page and re-fetches availability, because day boundaries move with the
 * zone. Searchable, because there are several hundred zones and nobody scrolls
 * to find one.
 */

/** Every IANA zone the runtime knows, with a small guaranteed fallback. */
function allZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported?.length) return supported;
  } catch {
    /* fall through */
  }
  return [
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Madrid",
    "Africa/Lagos",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland",
    "UTC",
  ];
}

/** "GMT-7" style offset, read from the zone itself so DST is always right. */
function offsetLabel(zone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function prettyZone(zone: string): string {
  return zone.replace(/_/g, " ");
}

export function TimeZonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (zone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const now = useMemo(() => new Date(), []);
  const zones = useMemo(() => (open ? allZones() : []), [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? zones.filter(
          (z) =>
            z.toLowerCase().includes(q) ||
            prettyZone(z).toLowerCase().includes(q) ||
            offsetLabel(z, now).toLowerCase().includes(q),
        )
      : zones;
    return list.slice(0, 200);
  }, [zones, query, now]);

  // Close on outside click or Escape, and hand focus back to the trigger.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(Math.max(0, allZones().indexOf(value)));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function commit(zone: string) {
    onChange(zone);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const zone = results[active];
      if (zone) commit(zone);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(results.length - 1);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Timezone, currently ${prettyZone(value)}. Change it`}
        className={cn(
          "group -mx-2 flex h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-[8px] px-2 text-left",
          "transition-[background-color,color] duration-[120ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          "hover:bg-hover",
        )}
      >
        <IconGlobe size={16} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2">
          {prettyZone(value)}
        </span>
        <IconChevronDown
          size={14}
          className={cn(
            "shrink-0 text-ink-3 transition-transform duration-[120ms]",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden",
            "rounded-[12px] border border-rule bg-surface elevation-2",
          )}
        >
          <div className="flex items-center gap-2 border-b border-rule px-3">
            <IconSearch size={14} className="shrink-0 text-ink-3" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder="Search timezone"
              aria-label="Search timezone"
              aria-controls="tz-listbox"
              className="h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>

          {results.length === 0 ? (
            <p className="px-3 py-4 text-[14px] text-ink-3">
              No timezone matches {`"${query}"`}.
            </p>
          ) : (
            <ul
              id="tz-listbox"
              ref={listRef}
              role="listbox"
              aria-label="Timezone"
              className="max-h-[min(18rem,50dvh)] overflow-y-auto py-1"
            >
              {results.map((zone, i) => {
                const selected = zone === value;
                return (
                  <li key={zone} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-index={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => commit(zone)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[14px]",
                        "transition-[background-color] duration-[120ms]",
                        i === active ? "bg-hover" : "bg-transparent",
                        selected ? "font-medium text-ink" : "text-ink-2",
                      )}
                    >
                      <span className="min-w-0 truncate">{prettyZone(zone)}</span>
                      <span className="shrink-0 font-mono tabular text-[12px] text-ink-3">
                        {offsetLabel(zone, now)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
