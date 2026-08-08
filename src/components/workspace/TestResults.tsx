import { Badge } from "@/components/ui/Badge";
import type { ImplementationTest } from "@/types/ui";
import { IconCheckCircle, IconCircle, IconLoader, IconXCircle } from "@/components/icons";


export function TestResults({ tests }: { tests: ImplementationTest[] }) {
  if (!tests.length) {
    return <p className="text-sm text-fg-muted">No tests yet.</p>;
  }

  return (
    <div className="space-y-2">
      {tests.map((test) => {
        const status = String(test.status).toLowerCase();
        const Icon =
          status === "passed"
            ? IconCheckCircle
            : status === "failed"
              ? IconXCircle
              : status === "running"
                ? IconLoader
                : IconCircle;
        const tone =
          status === "passed"
            ? "success"
            : status === "failed"
              ? "danger"
              : status === "running"
                ? "warning"
                : "neutral";

        return (
          <div
            key={test.name}
            className="rounded-[var(--radius-md)] border border-border bg-bg-elevated px-3 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    status === "passed"
                      ? "text-success"
                      : status === "failed"
                        ? "text-danger"
                        : status === "running"
                          ? "animate-spin text-warning"
                          : "text-fg-faint"
                  }`}
                />
                <span className="truncate text-sm font-medium text-fg">{test.name}</span>
              </div>
              <Badge tone={tone as "success" | "danger" | "warning" | "neutral"}>
                {status}
              </Badge>
            </div>
            {test.output && (
              <pre className="mt-2 overflow-x-auto rounded-[var(--radius-sm)] bg-bg px-2.5 py-2 font-mono text-[11px] text-fg-muted">
                {test.output}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
