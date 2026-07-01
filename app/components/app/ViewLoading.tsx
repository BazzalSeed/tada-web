import { Spark } from "@/app/components/brand/Spark";
import styles from "./ViewLoading.module.css";

// Branded loading state for the views — shown while the todo pool hydrates so the
// content area reads as "loading" rather than a confusing empty list. A gently
// twinkling ta-da spark over a soft accent halo; static under reduced-motion.
export function ViewLoading() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-label="Loading">
      <span className={styles.orb} aria-hidden="true">
        <Spark size={24} className={styles.spark} />
      </span>
    </div>
  );
}
