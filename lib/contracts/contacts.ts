// ============================================================================
// FROZEN v0 CONTRACT — contact resolution seam (provider-agnostic).
// Google People API (contacts.readonly) impl lives behind ContactResolver in
// backend-owned lib/*. Used by the meeting offer's disambiguation flow and the
// read-only `searchContacts` AgentTool (gated:false). NOT a metered Capability.
// ============================================================================

import type { ContactCandidate } from "./types";

// Resolve a free-text query (name fragment) to ranked contact candidates.
export interface ContactResolver {
  resolve(query: string): Promise<ContactCandidate[]>;
}
