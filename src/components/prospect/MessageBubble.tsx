import { ArtifactRenderer } from "@/components/artifacts/ArtifactRenderer";
import { AgentActivity } from "@/components/prospect/AgentActivity";
import { cn, formatTime } from "@/lib/utils";
import type { Message } from "@/types/ui";

/**
 * One turn in the conversation.
 *
 * Deliberately not a chat bubble. Bubbles in bordered, shadowed boxes are the
 * thing DESIGN.md calls out first: a box around every box, stacked shadows,
 * and a layout that reads as a toy rather than a transcript. Speaker and time
 * are set as an editorial byline, the prose is capped at 68ch for readability,
 * and the only structure is whitespace and a single hairline rule.
 *
 * Shared with the company-side conversation views, so the props are stable.
 */

/**
 * Inline **bold** and `code`, rendered as React nodes.
 *
 * This used to build an HTML string and hand it to dangerouslySetInnerHTML.
 * The content is model output rendered on a public, unauthenticated page, so
 * a single `<img src=x onerror=...>` in a generated answer, or in anything the
 * model was talked into echoing back, would have executed as script in the
 * visitor's browser. React escapes text nodes by construction, so building
 * elements instead removes the injection path entirely rather than trying to
 * sanitise it.
 */
function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // One pass over both markers so neither can be smuggled inside the other.
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) nodes.push(line.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b${n++}`} className="font-semibold text-ink">
          {match[1]}
        </strong>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${n++}`}
          className="rounded-[2px] bg-sunken px-1 py-0.5 font-mono text-[0.9em] text-ink"
        >
          {match[2]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
}

function renderContent(content: string) {
  const blocks = content.split(/(```[\s\S]*?```)/g);
  return blocks.map((block, i) => {
    if (block.startsWith("```")) {
      const inner = block.replace(/^```\w*\n?/, "").replace(/```$/, "");
      return (
        <pre
          key={i}
          className="my-3 overflow-x-auto rounded-[var(--radius-control)] bg-sunken p-4 font-mono text-[0.8125rem] leading-[1.6] text-ink-2"
        >
          <code>{inner}</code>
        </pre>
      );
    }

    return (
      <div key={i}>
        {block.split("\n").map((line, j) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={j} className="h-3" />;

          // Grok answers in markdown, so headings and rules arrive as "###"
          // and "---". Rendering those literally leaves raw syntax sitting in
          // the middle of the answer, which reads as a half-built renderer.
          const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
          if (heading) {
            return (
              <p
                key={j}
                className={cn(
                  "max-w-[68ch] text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink",
                  j > 0 && "mt-5",
                )}
              >
                {renderInline(normalizeDashes(heading[2] ?? ""), `${i}-${j}`)}
              </p>
            );
          }

          if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            return <hr key={j} className="my-5 max-w-[68ch] border-t border-rule" />;
          }

          // Strip the marker and set a real hanging indent, rather than
          // printing the raw "- " the model wrote.
          const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
          const numbered = /^(\d+)\.\s+(.*)$/.exec(trimmed);
          if (bullet || numbered) {
            const marker = numbered ? `${numbered[1]}.` : "·";
            const text = (numbered ? numbered[2] : bullet?.[1]) ?? "";
            return (
              <p
                key={j}
                className={cn(
                  "flex max-w-[68ch] gap-2 text-[1rem] leading-[1.6] text-ink-2",
                  j > 0 && "mt-1.5",
                )}
              >
                <span className="shrink-0 select-none text-ink-3">{marker}</span>
                <span>{renderInline(normalizeDashes(text), `${i}-${j}`)}</span>
              </p>
            );
          }

          return (
            <p
              key={j}
              className={cn(
                "max-w-[68ch] text-[1rem] leading-[1.6] text-ink-2",
                j > 0 && "mt-2",
              )}
            >
              {renderInline(normalizeDashes(line), `${i}-${j}`)}
            </p>
          );
        })}
      </div>
    );
  });
}

const LABEL = "font-mono text-[0.6875rem] uppercase tracking-[0.08em]";

/**
 * Em dashes are banned in every user-facing string in this product, and model
 * output is user-facing the moment it is rendered. The prompt asks Grok to
 * avoid them, but a prompt is a request and this is a guarantee, so the render
 * path normalises what slips through.
 *
 * Purely typographic: an em dash between clauses becomes a comma, so the
 * sentence reads identically and no meaning is altered. Applied only on
 * display. What gets persisted to the database stays exactly as it was said.
 */
export function normalizeDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*–\s*/g, ", ")
    .replace(/,\s*,/g, ",");
}

export function MessageBubble({
  message,
  agentName,
}: {
  message: Message;
  agentName: string;
}) {
  // System and call entries are records of something that happened, not turns.
  if (message.channel === "system" || message.role === "system") {
    const learned = Array.isArray(message.metadata?.learned)
      ? (message.metadata.learned as string[])
      : null;
    return (
      <div className="border-t border-rule pt-5">
        <p className={cn(LABEL, "text-ink-3")}>
          {message.channel === "call" ? "Call" : "System"}
          <span className="ml-2 normal-case tracking-normal text-ink-4">
            {formatTime(message.createdAt)}
          </span>
        </p>
        <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-[0.9375rem] leading-[1.55] text-ink-2">
          {normalizeDashes(message.content)}
        </p>
        {learned && learned.length > 0 && (
          <div className="mt-4">
            <p className={cn(LABEL, "text-ink-3")}>{agentName} learned</p>
            <ul className="mt-2 space-y-1.5">
              {learned.map((item) => (
                <li
                  key={item}
                  className="max-w-[68ch] text-[0.9375rem] leading-[1.5] text-ink-2"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const isUser = message.role === "user";
  const channel = message.channel === "email" ? "Email" : null;

  return (
    <article className="max-w-[68ch]">
      <p className={cn(LABEL, isUser ? "text-ink-3" : "text-ink")}>
        {isUser ? "You" : agentName}
        {channel && <span className="ml-2 text-ink-3">{channel}</span>}
        <span className="ml-2 normal-case tracking-normal text-ink-4">
          {formatTime(message.createdAt)}
        </span>
      </p>

      {message.events && message.events.length > 0 && !isUser && (
        <div className="mt-2">
          <AgentActivity events={message.events} />
        </div>
      )}

      <div className="mt-2">
        {isUser ? (
          <p className="max-w-[68ch] text-[1rem] leading-[1.6] text-ink">
            {normalizeDashes(message.content)}
          </p>
        ) : (
          renderContent(message.content)
        )}
      </div>

      {message.artifacts?.map((artifact, i) => (
        <div key={i} className="mt-4">
          <ArtifactRenderer artifact={artifact} />
        </div>
      ))}
    </article>
  );
}
