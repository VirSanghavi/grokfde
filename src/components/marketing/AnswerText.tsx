import type { ReactNode } from "react";

/**
 * Renders what the agent actually emits: short paragraphs, `**bold**` runs,
 * `###` headings, numbered steps, and dashed bullets.
 *
 * Two reasons this exists rather than a markdown dependency. First, raw `**`
 * on screen is the single most obvious "we piped a model straight into a div"
 * tell, and this surface is the proof the product is real. Second, the model
 * writes em dashes, which are banned in user-facing copy across this codebase.
 * Both are presentation problems, so they are fixed at the point of render and
 * nothing about the meaning of the answer changes.
 */

/** Em and en dashes become commas, which preserves the sentence exactly. */
function normalize(text: string): string {
  return text
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ")
    .replace(/[ \t]+$/gm, "");
}

/**
 * While tokens are still arriving the text can end mid-emphasis. Dropping the
 * dangling marker stops a stray `**` from flickering at the end of the answer.
 */
function dropDanglingEmphasis(text: string): string {
  const markers = text.match(/\*\*/g);
  if (!markers || markers.length % 2 === 0) return text;
  const last = text.lastIndexOf("**");
  return text.slice(0, last) + text.slice(last + 2);
}

function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={`${key}-b${index}`} className="font-semibold text-ink">
          {match[1]}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={`${key}-c${index}`} className="font-mono text-[0.92em]">
          {match[2]}
        </code>,
      );
    }
    cursor = match.index + match[0].length;
    index += 1;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
/** The agent often writes a standalone bolded line where it means a heading. */
const BOLD_LINE = /^\s*\*\*(.+?)\*\*:?\s*$/;

export function AnswerText({ text }: { text: string }) {
  const lines = normalize(dropDanglingEmphasis(text)).split("\n");
  const blocks: ReactNode[] = [];

  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    const key = `l${blocks.length}`;
    const content = items.map((item, i) => (
      <li key={`${key}-${i}`} className="pl-1">
        {inline(item, `${key}-${i}`)}
      </li>
    ));
    blocks.push(
      ordered ? (
        <ol key={key} className="mt-3 list-decimal space-y-1.5 pl-5 marker:text-ink-4">
          {content}
        </ol>
      ) : (
        <ul key={key} className="mt-3 list-disc space-y-1.5 pl-5 marker:text-ink-4">
          {content}
        </ul>
      ),
    );
    list = null;
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key} className="mt-3 first:mt-0">
        {inline(paragraph.join(" "), key)}
      </p>,
    );
    paragraph = [];
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(HEADING) ?? line.match(BOLD_LINE);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <p
          key={`h${blocks.length}`}
          className="mt-5 text-title text-ink first:mt-0"
        >
          {heading[1]}
        </p>,
      );
      continue;
    }

    const ordered = line.match(ORDERED);
    if (ordered) {
      flushParagraph();
      if (!list?.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[2]);
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      flushParagraph();
      if (list?.ordered !== false) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return <div className="max-w-[68ch] text-body-l text-ink-2">{blocks}</div>;
}
