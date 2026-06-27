// ============================================================================
// Shared Google OAuth helper. Exchanges the user's stored refresh token for a
// short-lived access token (calendar.events + contacts.readonly scopes). Used by
// the meeting executor (T3.1) and the contact resolver (T3.1a). NOT a Capability.
// ============================================================================

export async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed (${res.status})`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("no access_token in refresh response");
  return json.access_token;
}
