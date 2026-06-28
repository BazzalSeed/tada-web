// ============================================================================
// T3.1 — "do it for me" executors. ONE fn per capability; the tap path calls it
// directly when the payload is complete, the agent calls the same fn as a GATED
// tool. Meetings + reminders are deterministic; research is the only agent loop
// (Gemini 2.5 Pro). NO Claude/Anthropic. These never auto-execute — they run only
// when explicitly invoked, and surface needsField for a single inline ask.
// ============================================================================

import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getGoogleAccessToken } from "./google";
import type { ActionPayload, Attendee, ExecResult, Executors, UserCtx } from "./contracts";

type Meeting = Extract<ActionPayload, { kind: "meeting" }>;
type Reminder = Extract<ActionPayload, { kind: "reminder" }>;
type Research = Extract<ActionPayload, { kind: "research" }>;

// ---- setReminder (deterministic) ----------------------------------------
// v0: validate the time and confirm; the app surfaces due reminders from the
// todo's reminderAt (no server push infra). Single inline ask if time missing.
async function setReminder(p: Reminder): Promise<ExecResult> {
  if (!p.remindAt) return { ok: false, needsField: "remindAt" };
  return { ok: true, actionExternalId: `reminder:${p.remindAt}` };
}

// ---- deepResearch (Gemini 2.5 Pro) --------------------------------------
const RESEARCH_SYSTEM = `You are a thorough research assistant. Produce a well-structured Markdown report on the user's topic: a short summary, key findings as bullet points with brief reasoning, notable considerations/tradeoffs, and a final recommendation. Be concrete and concise. Markdown only.`;

async function deepResearch(
  p: Research,
  onProgress?: (s: string) => void,
): Promise<{ markdown: string }> {
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  onProgress?.(`Researching “${p.topic}”…`);
  const { text } = await generateText({
    model: google("gemini-2.5-pro"),
    system: RESEARCH_SYSTEM,
    prompt: `Research topic: ${p.topic}`,
  });
  onProgress?.("Writing up findings…");
  return { markdown: text };
}

// ---- sendMeetingInvite (Google Calendar via the user's refresh token) ----
function addMinutesIso(localIso: string, minutes: number): string {
  const d = new Date(localIso);
  d.setMinutes(d.getMinutes() + minutes);
  // keep offset-less local form yyyy-MM-ddTHH:mm:ss
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Classify the attendee list at SEND time (no live People API call — resolution
// with candidates happens at propose time via /api/contacts/resolve + the
// search_contacts tool). Prefer the offer's resolvedAttendees; otherwise treat
// raw extracted strings as emails (resolved) or names (unresolved).
function effectiveAttendees(p: Meeting): Attendee[] {
  if (p.resolvedAttendees && p.resolvedAttendees.length) return p.resolvedAttendees;
  return (p.attendees ?? []).map((a) =>
    a.includes("@")
      ? { name: a, email: a, status: "resolved" as const }
      : { name: a, status: "unresolved" as const },
  );
}

async function sendMeetingInvite(p: Meeting, user: UserCtx): Promise<ExecResult> {
  // Single inline ask for the one missing essential field.
  if (!p.start) return { ok: false, needsField: "start" };

  const attendees = effectiveAttendees(p);
  if (attendees.length === 0) return { ok: false, needsField: "attendees" };
  // Send-gate (never-auto-execute): any unresolved attendee blocks Send and
  // surfaces the disambiguation picker instead of firing the invite.
  const unresolved = attendees.filter((a) => a.status !== "resolved" || !a.email);
  if (unresolved.length) return { ok: false, needsDisambiguation: attendees };

  const emails = attendees.map((a) => a.email!).filter(Boolean);

  if (!user.googleRefreshToken) {
    return { ok: false, error: "Google account not connected" };
  }
  try {
    const accessToken = await getGoogleAccessToken(user.googleRefreshToken);
    const durationMin = p.durationMin ?? 30;
    // Anchor the wall-clock start to the USER's real zone (captured from the
    // browser → User.timezone). Fall back only when it's genuinely unknown.
    const tz = user.timezone ?? process.env.TADA_TIMEZONE ?? "America/Los_Angeles";
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          summary: p.title?.trim() || "Meeting",
          description: p.notes ?? undefined,
          start: { dateTime: p.start, timeZone: tz },
          end: { dateTime: addMinutesIso(p.start, durationMin), timeZone: tz },
          attendees: emails.map((email) => ({ email })),
        }),
      },
    );
    if (!res.ok) {
      return { ok: false, error: `calendar event failed (${res.status})` };
    }
    const event = (await res.json()) as { id?: string; htmlLink?: string };
    return { ok: true, actionExternalId: event.id, actionLink: event.htmlLink };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "meeting failed" };
  }
}

export const executors: Executors = {
  setReminder,
  sendMeetingInvite,
  deepResearch,
};
