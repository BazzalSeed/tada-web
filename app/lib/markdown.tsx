import { Fragment, type ReactNode } from "react";

// Minimal, dependency-free Markdown for notes preview + research reports:
// headings (#/##/###), unordered lists (-/*), bold (**x**), and paragraphs.
// Deliberately small — a fuller GFM renderer can swap in behind this seam.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
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
            <li key={i}>{inline(li, `li${key}-${i}`)}</li>
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
      blocks.push(<h3 key={`h${key++}`}>{inline(heading[2], `h${key}`)}</h3>);
    } else if (line.trim() === "") {
      // skip blank lines (paragraph separators)
    } else {
      blocks.push(<p key={`p${key++}`}>{inline(line, `p${key}`)}</p>);
    }
  }
  flushList();

  return <Fragment>{blocks}</Fragment>;
}
