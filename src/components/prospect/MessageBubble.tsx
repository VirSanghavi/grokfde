import { ArtifactRenderer } from "@/components/artifacts/ArtifactRenderer";
import { AgentActivity } from "@/components/prospect/AgentActivity";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { cn, formatTime } from "@/lib/utils";
import type { Message } from "@/types/ui";

function renderContent(content: string) {
  const blocks = content.split(/(```[\s\S]*?```)/g);
  return blocks.map((block, i) => {
    if (block.startsWith("```")) {
      const inner = block.replace(/^```\w*\n?/, "").replace(/```$/, "");
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg-secondary"
        >
          <code>{inner}</code>
        </pre>
      );
    }

    return (
      <div key={i} className="space-y-2">
        {block.split("\n").map((line, j) => {
          if (!line.trim()) return <div key={j} className="h-2" />;
          const isList = /^(\d+\.|[-*])\s/.test(line.trim());
          const html = line
            .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-fg">$1</strong>')
            .replace(
              /`([^`]+)`/g,
              '<code class="rounded bg-bg px-1 py-0.5 font-mono text-[0.9em] text-brand">$1</code>'
            );
          return (
            <p
              key={j}
              className={cn(
                "text-[15px] leading-relaxed text-fg-secondary",
                isList && "pl-1"
              )}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        })}
      </div>
    );
  });
}

export function MessageBubble({
  message,
  agentName,
}: {
  message: Message;
  agentName: string;
}) {
  if (message.channel === "system" || message.role === "system") {
    return (
      <div className="mx-auto max-w-xl rounded-[var(--radius-lg)] border border-border bg-bg-elevated px-4 py-3 shadow-sm">
        <Badge tone="neutral" className="mb-2">
          {message.channel === "call" ? "call" : "system"}
        </Badge>
        <div className="whitespace-pre-wrap text-sm text-fg-muted">{message.content}</div>
        {message.metadata && Array.isArray(message.metadata.learned) && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-brand">
              {agentName} learned
            </p>
            <ul className="space-y-1">
              {(message.metadata.learned as string[]).map((item) => (
                <li key={item} className="text-sm text-fg-secondary">
                  · {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const isUser = message.role === "user";
  const isEmail = message.channel === "email";
  const isCall = message.channel === "call";

  return (
    <div className={cn("flex gap-3 animate-in", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && <Avatar name={agentName} size="sm" className="mt-1 shrink-0" />}
      <div className={cn("max-w-[min(100%,560px)] space-y-2", isUser && "items-end")}>
        <div className={cn("flex items-center gap-2", isUser && "justify-end")}>
          {(isEmail || isCall) && (
            <Badge tone={isCall ? "call" : "neutral"}>{message.channel}</Badge>
          )}
          <span className="font-mono text-[10px] text-fg-faint">
            {formatTime(message.createdAt)}
          </span>
        </div>

        {message.events && message.events.length > 0 && !isUser && (
          <AgentActivity events={message.events} />
        )}

        <div
          className={cn(
            "rounded-[var(--radius-lg)] px-4 py-3 shadow-sm",
            isUser
              ? "bg-accent text-accent-fg"
              : "border border-border bg-bg-elevated text-fg"
          )}
        >
          <div className={cn(isUser && "[&_strong]:text-accent-fg [&_p]:text-accent-fg/90")}>
            {isUser ? (
              <p className="text-[15px] leading-relaxed">{message.content}</p>
            ) : (
              renderContent(message.content)
            )}
          </div>
        </div>

        {message.artifacts?.map((artifact, i) => (
          <ArtifactRenderer key={i} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}
