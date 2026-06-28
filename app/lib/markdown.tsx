import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CSSProperties, ComponentProps } from "react";
import styles from "./markdown.module.css";

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

type AnchorProps = ComponentProps<"a"> & { href?: string };

function AnchorComponent({ href, children, ...props }: AnchorProps, onTodoLink?: (id: string) => void) {
  if (href && href.startsWith("todo:") && onTodoLink) {
    const id = href.slice("todo:".length);
    return (
      <button type="button" style={todoLinkStyle} onClick={() => onTodoLink(id)}>
        {children}
      </button>
    );
  }
  if (href && /^https?:/.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return <a href={href} {...props}>{children}</a>;
}

export function Markdown({
  source,
  onTodoLink,
}: {
  source: string;
  onTodoLink?: (id: string) => void;
}) {
  return (
    <div className={styles.md}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Preserve our custom todo: scheme — react-markdown's defaultUrlTransform
        // strips unknown protocols; returning the url unchanged keeps todo: hrefs intact.
        urlTransform={(url: string) => (url.startsWith("todo:") ? url : url)}
        components={{
          a(props) {
            return AnchorComponent(props, onTodoLink);
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
