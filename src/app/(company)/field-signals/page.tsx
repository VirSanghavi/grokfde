"use client";

import { useActiveCompany } from "@/components/layout/WorkspaceContext";
import { Eyebrow, Note, RowList, Section, StateMark } from "@/components/ops/primitives";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn, errorMessage, fetchJson, humanize, isAbortError } from "@/lib/utils";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const FRAME = "w-full px-5 sm:px-8 lg:px-12";

interface Signal {
  key: string;
  type: string;
  title: string;
  accountCount: number;
  occurrenceCount: number;
  recommendation: string | null;
  sampleSummary: string | null;
}

const str = (v: unknown, fallback = "") => (v == null ? fallback : String(v));

async function loadSignals(companyId: string, signal: AbortSignal): Promise<Signal[]> {
  const data = await fetchJson<{ signals?: Array<Record<string, unknown>> }>(
    `/api/field-signals?companyId=${encodeURIComponent(companyId)}`,
    { signal },
  );

  // The aggregator groups by normalized key, so that is the stable identity.
  return (data.signals ?? []).map((s, i) => ({
    key: str(s.key ?? s.id, `signal-${i}`),
    type: str(s.type, "signal"),
    title: str(s.title, "Untitled signal"),
    accountCount: Number(s.accountCount) || 0,
    occurrenceCount: Number(s.occurrenceCount) || 0,
    recommendation: str(s.recommendation) || null,
    sampleSummary: str(s.sampleSummary) || null,
  }));
}

export default function FieldSignalsPage() {
  const company = useActiveCompany();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    loadSignals(company.id, controller.signal)
      .then((next) => {
        if (active) setSignals(next);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setSignals([]);
        setError(errorMessage(err, "Signals could not be loaded."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [company.id, reloadKey]);

  const repeated = signals.filter((s) => s.occurrenceCount >= 2);

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <header className={cn(FRAME, "pt-8 pb-7 sm:pt-10")}>
        <Eyebrow>{company.name}</Eyebrow>
        <h1 className="text-display-l mt-2 text-ink">What keeps coming up</h1>
        <p className="mt-3 max-w-[62ch] text-body-l text-ink-2">
          {company.agentName} works every account, so it is the only one who sees the same
          question asked by five different prospects. Anything it hears more than once
          shows up here, because that is product information, not a support ticket.
        </p>
      </header>

      <div className={cn(FRAME, "pb-20")}>
        {loading ? (
          <div className="space-y-4 border-t border-rule pt-6" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-3.5" style={{ width: `${58 - i * 8}%` }} />
                <div className="skeleton h-3" style={{ width: `${42 - i * 6}%` }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState title="Signals did not load" message={error} onRetry={retry} />
        ) : signals.length === 0 ? (
          <Section
            title="Nothing repeated yet"
            note={`A signal is recorded when ${company.agentName} hits the same need or gap in more than one conversation.`}
          >
            <Note>
              This stays empty until there is real repetition, which is the point: an
              invented trend is worse than an honest blank. Put the prospect link in front
              of more people and this fills itself in.
            </Note>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/fde/${company.slug}`}>
                <Button size="md">Open the prospect link</Button>
              </Link>
              <Link href="/conversations">
                <Button size="md" variant="secondary">
                  See conversations
                </Button>
              </Link>
            </div>
          </Section>
        ) : (
          <Section
            title={`${signals.length} ${signals.length === 1 ? "signal" : "signals"}`}
            note={
              repeated.length > 0
                ? `${repeated.length} of these came up more than once, which is usually where a product decision hides.`
                : "None of these has repeated yet. They are listed so you can see what is being asked."
            }
          >
            <RowList>
              {signals.map((s) => (
                <li key={s.key} className="py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <StateMark tone={s.occurrenceCount >= 2 ? "caution" : "neutral"}>
                      {humanize(s.type)}
                    </StateMark>
                    <span className="mono-ts tabular">
                      {s.occurrenceCount}{" "}
                      {s.occurrenceCount === 1 ? "mention" : "mentions"}
                      {s.accountCount > 0
                        ? ` · ${s.accountCount} ${s.accountCount === 1 ? "account" : "accounts"}`
                        : ""}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[72ch] text-body font-medium text-ink">
                    {s.title}
                  </p>
                  {s.sampleSummary ? (
                    <p className="mt-1 max-w-[72ch] text-caption">{s.sampleSummary}</p>
                  ) : null}
                  {s.recommendation ? (
                    <p className="mt-1.5 max-w-[72ch] text-caption">{s.recommendation}</p>
                  ) : null}
                </li>
              ))}
            </RowList>
          </Section>
        )}
      </div>
    </div>
  );
}
