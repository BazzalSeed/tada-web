import { Fragment, type CSSProperties, type ReactNode } from "react";
import styles from "./markdown.module.css";

// Minimal, dependency-free Markdown for notes preview + research reports:
// headings (#1-#6 ramp), unordered lists (-/*), bold (**x**), inline code (`x`),
// fenced code blocks (```), blockquotes (> ), links [t](href), and paragraphs.
// Deliberately small — a fuller GFM renderer can swap in behind this.

// In-note link to another todo (e.g. a prep summary → its full research report).
const todoLinkStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "var(--color-accent)",
  textDecoration: "underline",
  cursor: "pointer",
};

// Inline spans: **bold**, `code`, and [text](href).
// href "todo:<id>" → an in-app link that opens that todo (onTodoLink);
// http(s) → a normal external link.
function inline(
  text: string,
  keyBase: string,
  onTodoLink?: (id: string) => void,
): ReactNode[] {
  const out: ReactNode[] = [];
  // Match: inline code first, then bold, then links.
  const re = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      // Inline code — do not parse bold/links inside
      out.push(<code key={`${keyBase}-c${i++}`}>{m[1]}</code>);
    } else if (m[2] !== undefined) {
      out.push(<strong key={`${keyBase}-b${i++}`}>{m[2]}</strong>);
    } else {
      const label = m[3];
      const href = m[4];
      if (href.startsWith("todo:") && onTodoLink) {
        const id = href.slice("todo:".length);
        out.push(
          <button
            key={`${keyBase}-t${i++}`}
            type="button"
            style={todoLinkStyle}
            onClick={() => onTodoLink(id)}
          >
            {label}
          </button>,
        );
      } else if (/^https?:/.test(href)) {
        out.push(
          <a key={`${keyBase}-a${i++}`} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>,
        );
      } else {
        out.push(label);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({
  source,
  onTodoLink,
}: {
  source: string;
  onTodoLink?: (id: string) => void;
}) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] | null = null;
  let blockquote: string[] | null = null;
  let fence: string[] | null = null; // null = not in fence; string[] = collecting lines
  let key = 0;

  const flushList = () => {
    if (list) {
      const items = list;
      blocks.push(
        <ul key={`ul${key++}`}>
          {items.map((li, i) => (
            <li key={i}>{inline(li, `li${key}-${i}`, onTodoLink)}</li>
          ))}
        </ul>,
      );
      list = null;
    }
  };

  const flushBlockquote = () => {
    if (blockquote) {
      const lines = blockquote;
      blocks.push(
        <blockquote key={`bq${key++}`}>
          {lines.map((l, i) => (
            <p key={i}>{inline(l, `bq${key}-${i}`, onTodoLink)}</p>
          ))}
        </blockquote>,
      );
      blockquote = null;
    }
  };

  const flushAll = () => {
    flushList();
    flushBlockquote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Fenced code block toggle
    if (/^```/.test(line)) {
      if (fence === null) {
        // entering fence — flush other open blocks first
        flushAll();
        fence = [];
      } else {
        // closing fence — emit pre/code
        const codeLines = fence;
        blocks.push(
          <pre key={`pre${key++}`}>
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        fence = null;
      }
      continue;
    }

    if (fence !== null) {
      // Inside fence: collect raw lines verbatim, no inline parsing
      fence.push(raw);
      continue;
    }

    // Blockquote lines
    const quoteMatch = /^>\s?(.*)$/.exec(line);
    if (quoteMatch) {
      flushList();
      (blockquote ??= []).push(quoteMatch[1]);
      continue;
    }

    // Anything else ends an open blockquote
    flushBlockquote();

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);

    if (bullet) {
      (list ??= []).push(bullet[1]);
      continue;
    }

    flushList();

    if (heading) {
      const level = Math.min(heading[1].length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(
        <Tag key={`h${key++}`}>{inline(heading[2], `h${key}`, onTodoLink)}</Tag>,
      );
    } else if (line.trim() === "") {
      // skip blank lines (paragraph separators)
    } else {
      blocks.push(<p key={`p${key++}`}>{inline(line, `p${key}`, onTodoLink)}</p>);
    }
  }

  flushAll();
  // If file ended mid-fence, emit what we have
  if (fence !== null) {
    blocks.push(
      <pre key={`pre${key++}`}>
        <code>{fence.join("\n")}</code>
      </pre>,
    );
  }

  return <div className={styles.md}>{blocks}</div>;
}
