import type { ContactCandidate } from "@/lib/contracts";
import styles from "./ResultTile.module.css";

// Read-tool result for search_contacts — the ranked candidates the agent found
// for a name. Read-only; the agent uses these to fill a meeting's attendee.
export interface ContactsTileProps {
  query: string;
  candidates: ContactCandidate[];
}

export function ContactsTile({ query, candidates }: ContactsTileProps) {
  return (
    <div className={styles.tile}>
      <span className={styles.eyebrow}>Contacts · {query}</span>
      {candidates.length === 0 ? (
        <p className={styles.line}>No matching contacts.</p>
      ) : (
        <ul className={styles.contacts}>
          {candidates.map((c) => (
            <li key={c.email} className={styles.contact}>
              <span className={styles.cName}>{c.name}</span>
              <span className={styles.cEmail}>{c.email}</span>
              {c.org ? <span className={styles.cOrg}>{c.org}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
