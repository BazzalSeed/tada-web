// ============================================================================
// T3.1a — contact resolution (Google People API, contacts.readonly). Implements
// the frozen ContactResolver seam: resolve a free-text name fragment to ranked
// ContactCandidate[]. resolveAttendees drives the meeting offer's disambiguation
// flow (raw extracted names -> resolved emails; Send stays gated until resolved).
// Read-only, provider-agnostic, NOT a metered Capability. NO Claude/Anthropic.
// ============================================================================

import { getGoogleAccessToken } from "./google";
import type { Attendee, ContactCandidate, ContactResolver, UserCtx } from "./contracts";

// Saved "My Contacts" (contacts.readonly) + Gmail-derived "Other contacts"
// (contacts.other.readonly). otherContacts only supports a names/emails readMask.
const PEOPLE_SEARCH = "https://people.googleapis.com/v1/people:searchContacts";
const OTHER_SEARCH = "https://people.googleapis.com/v1/otherContacts:search";
const READ_MASK = "names,emailAddresses,organizations,photos";
const OTHER_READ_MASK = "names,emailAddresses";

interface GooglePerson {
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
  organizations?: { name?: string }[];
  photos?: { url?: string }[];
}

// One People-API search call → mapped candidates (email-less people dropped).
async function searchPeople(
  endpoint: string,
  query: string,
  readMask: string,
  accessToken: string,
): Promise<ContactCandidate[]> {
  const url = `${endpoint}?query=${encodeURIComponent(query)}&readMask=${encodeURIComponent(readMask)}&pageSize=10`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { person?: GooglePerson }[] };
  return (data.results ?? [])
    .map((r) => toCandidate(r.person))
    .filter((c): c is ContactCandidate => c !== null);
}

function toCandidate(person: GooglePerson | undefined): ContactCandidate | null {
  const email = person?.emailAddresses?.[0]?.value;
  if (!email) return null; // an attendee needs an email — skip nameless/email-less people
  return {
    name: person?.names?.[0]?.displayName ?? email,
    email,
    org: person?.organizations?.[0]?.name || undefined,
    photoUrl: person?.photos?.[0]?.url || undefined,
  };
}

// Higher == better. Exact (case-insensitive) name match beats prefix beats substring.
function scoreFor(candidate: ContactCandidate, query: string): number {
  const name = candidate.name.toLowerCase();
  const q = query.trim().toLowerCase();
  if (name === q) return 3;
  if (name.startsWith(q)) return 2;
  if (name.includes(q)) return 1;
  return 0;
}

// Per-user resolver bound to the caller's Google connection.
export function contactResolverFor(user: UserCtx): ContactResolver {
  return {
    async resolve(query: string): Promise<ContactCandidate[]> {
      const q = query.trim();
      if (!q || !user.googleRefreshToken) return [];

      const accessToken = await getGoogleAccessToken(user.googleRefreshToken);
      // Search saved + other contacts in parallel; merge, dedupe by email
      // (prefer the saved-contact entry — it carries org/photo).
      const [mine, other] = await Promise.all([
        searchPeople(PEOPLE_SEARCH, q, READ_MASK, accessToken),
        searchPeople(OTHER_SEARCH, q, OTHER_READ_MASK, accessToken),
      ]);
      const byEmail = new Map<string, ContactCandidate>();
      for (const c of [...mine, ...other]) {
        if (!byEmail.has(c.email)) byEmail.set(c.email, c);
      }
      return [...byEmail.values()]
        .map((c) => ({ ...c, rank: scoreFor(c, q) }))
        .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
    },
  };
}

// Turn raw extracted attendee strings into the Attendee disambiguation flow:
// already-an-email -> resolved; exactly one candidate -> resolved; otherwise
// unresolved (carrying any candidates for the user to pick). Never auto-picks
// among multiple matches — the user confirms before a meeting is sent.
export async function resolveAttendees(
  resolver: ContactResolver,
  names: string[],
): Promise<Attendee[]> {
  return Promise.all(
    names.map(async (raw): Promise<Attendee> => {
      const name = raw.trim();
      if (name.includes("@")) return { name, email: name, status: "resolved" };

      const candidates = await resolver.resolve(name);
      if (candidates.length === 1) {
        return { name: candidates[0].name, email: candidates[0].email, status: "resolved", candidates };
      }
      return { name, status: "unresolved", candidates };
    }),
  );
}
