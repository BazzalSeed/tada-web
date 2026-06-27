// POST /api/voice/session — mint a short-lived OpenAI Realtime client secret for
// the browser (WebRTC), with our AgentTool registry embedded as function tools so
// the voice model can call them. The main OPENAI_API_KEY never leaves the server.
// Voice tool-calls round-trip through /api/voice/tool (gated writes need approval).
// NO Claude/Anthropic.
import { currentUser } from "@/lib/auth";
import { toOpenAIToolDefs } from "@/lib/agent-tools";
import { json, HttpError, handleApiError } from "@/lib/http";

export const runtime = "nodejs";

const OPENAI_CLIENT_SECRETS = "https://api.openai.com/v1/realtime/client_secrets";

const VOICE_SYSTEM = `You are Tada, a capture-first to-do assistant. You can list/inspect the user's todos on your own, but creating todos, setting reminders, booking meetings, and running research require the user's explicit approval before they run. Be brief and natural — this is a voice conversation. Never claim a write happened until it's approved and executed.`;

export async function POST(): Promise<Response> {
  try {
    const user = await currentUser();

    const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
    const tools = toOpenAIToolDefs();

    const res = await fetch(OPENAI_CLIENT_SECRETS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": user.userId,
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "realtime",
          model,
          instructions: VOICE_SYSTEM,
          tools,
          tool_choice: "auto",
        },
      }),
    });

    if (!res.ok) {
      throw new HttpError(502, `voice session mint failed (${res.status})`);
    }

    const data = (await res.json()) as {
      value?: string;
      expires_at?: number;
      client_secret?: { value?: string; expires_at?: number } | string;
    };
    // Response shape has shifted across Realtime versions — accept either the flat
    // {value, expires_at} or the nested {client_secret:{value,expires_at}} form.
    const cs = typeof data.client_secret === "object" ? data.client_secret : undefined;
    const clientSecret = data.value ?? cs?.value ?? (typeof data.client_secret === "string" ? data.client_secret : null);
    const expiresAt = data.expires_at ?? cs?.expires_at ?? null;

    return json({ clientSecret, expiresAt, model, tools });
  } catch (err) {
    return handleApiError(err);
  }
}
