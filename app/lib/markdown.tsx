import { Fragment, type CSSProperties, type ReactNode } from "react";

// Minimal, dependency-free Markdown for notes preview + research reports:
// headings (#/##/###), unordered lists (-/*), bold (**x**), links [t](href), and
// paragraphs. Deliberately small — a fuller GFM renderer can swap in behind this.

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

// Inline spans: **bold** and [text](href). href "todo:<id>" → an in-app link that
// opens that todo (onTodoLink); http(s) → a normal external link.
function inline(
  text: string,
  keyBase: string,
  onTodoLink?: (id: string) => void,
): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    } else {
      const label = m[2];
      const href = m[3];
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

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      (list ??= []).push(bullet[1]);
      continue;
    }
    flushList();
    if (heading) {
      // Single visual heading level (h3) for the compact notes surface.
      blocks.push(<h3 key={`h${key++}`}>{inline(heading[2], `h${key}`, onTodoLink)}</h3>);
    } else if (line.trim() === "") {
      // skip blank lines (paragraph separators)
    } else {
      blocks.push(<p key={`p${key++}`}>{inline(line, `p${key}`, onTodoLink)}</p>);
    }
  }
  flushList();

  return <Fragment>{blocks}</Fragment>;
}
