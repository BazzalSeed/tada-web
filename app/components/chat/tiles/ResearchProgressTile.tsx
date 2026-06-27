import { Markdown } from "@/app/lib/markdown";
import styles from "./ResearchProgressTile.module.css";

// Deep-research tile: a calm "researching…" pulse while the agent works, then the
// written findings (markdown) when done. Research is the one agent capability.
export interface ResearchProgressTileProps {
  status: "running" | "done";
  markdown?: string | null;
}

export function ResearchProgressTile({ status, markdown }: ResearchProgressTileProps) {
  if (status === "running") {
    return (
      <div className={styles.tile} data-status="running">
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>Researching…</span>
      </div>
    );
  }
  return (
    <div className={styles.tile} data-status="done">
      <span className={styles.eyebrow}>Research findings</span>
      <div className={styles.report}>
        <Markdown source={markdown ?? "_No findings._"} />
      </div>
    </div>
  );
}
