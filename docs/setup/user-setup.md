# Tada Web — what only YOU can set up

The build team automates everything it can. This file is the short list of things that require **your** account at a third-party console and genuinely **cannot** be done by CLI/MCP on your behalf.

**TL;DR:** one task — **Google OAuth** (required, ~10 min, DONE). **Postmark (email capture) is DEFERRED to post-launch** — no action needed for v0. Everything else is already handled.

---

## ✅ Already automated for you (no action needed)

The architect teammate provisioned all of these via CLI/MCP:

| Secret / resource | Status | How |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` (Neon) | ✅ live | Neon, migrated to production |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | ✅ live | from `.env`, set in Vercel |
| `BLOB_READ_WRITE_TOKEN` (capture images) | ✅ live | Vercel Blob store `tada-captures` |
| `AUTH_SECRET` | ✅ generated | `openssl rand`, all envs |
| `POSTMARK_INBOUND_WEBHOOK_SECRET` | ✅ generated | random, all envs |
| `ADMIN_EMAILS=seedzpy@gmail.com` | ✅ set | gives you no-invite sign-in + unlimited plan |
| MX record for `in.gettada.app` | ✅ being added | Vercel DNS → Postmark inbound |

So you do **not** touch DNS, Vercel env, the database, or any of the AI keys.

---

## 🔧 Task A — Google OAuth  *(required — this IS the sign-in ship goal)*

Why manual: Google's OAuth consent screen + web-client creation for an external app is console-only; there's no CLI for it.

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)** → create a project named **tada-web** (or reuse one).
2. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create
   - App name: **Tada**, user support email: your email, developer contact: your email
   - **Add scopes** (click *Add or Remove Scopes*; for the sensitive ones use the filter/"Manually add scopes" box). Final set = exactly these **5**:
     - `openid`
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `https://www.googleapis.com/auth/calendar.events`  *(book the meeting + invite attendees; Calendar emails the invites via sendUpdates=all — no Gmail scope needed)*
     - `https://www.googleapis.com/auth/contacts.readonly`  *(resolve "schedule with John" → John's email; NOT contacts.other.readonly)*
   - **Delete any other scopes** that got auto-selected (calendar.app.created, calendar.calendarlist*, gmail.*, People-API granular reads like profile.agerange/user.birthday/etc.) — Tada uses none of them. **No Gmail scope** — dropping it avoids Google's restricted-scope security assessment at launch.
   - **Test users:** add `seedzpy@gmail.com` (leave the app in **Testing** mode — no Google review needed)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: **tada-web**
   - **Authorized JavaScript origins:**
     - `https://app.gettada.app`
     - `http://localhost:3000`
   - **Authorized redirect URIs:**
     - `https://app.gettada.app/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`
   - Create → copy the **Client ID** and **Client Secret**.
4. *(Recommended for meetings)* **APIs & Services → Enabled APIs → + Enable APIs** → enable **Google Calendar API** and **People API** (the latter for contact name→email resolution). *(No Gmail API needed — Calendar sends the invites.)*

### → Send me back
- **Client ID** (looks like `…apps.googleusercontent.com`)
- **Client Secret** (starts with `GOCSPX-`)

_(Deliver these privately — they are wired into Vercel env + local `.env` as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` and are never committed to this repo.)_

---

## ⏸️ Task B — Postmark  *(email-to-todo capture) — DEFERRED to post-launch*

**Status: deferred.** Email capture is the 3rd capture source; screenshot + quick-add + voice ship without it. T2.6 is built + tested (against signed fixtures) but dormant — no live inbound provider wired.

**Provider decision is OPEN for when we do wire it** — do NOT default back to Postmark. Postmark's free tier is only 100 msgs/mo (inbound counts toward it) and paid is send-tier priced — wrong economics for inbound webhook plumbing. Evaluate instead:
- **Cloudflare Email Routing + Email Workers** — free; inbound email → Worker → POST our webhook. Needs domain email/DNS on Cloudflare (currently Vercel). Leading cheap option.
- **AWS SES inbound** — ~$0.10 per 1,000 emails → S3/Lambda → webhook. Scales cheaply, more setup.

The T2.6 handler is a thin webhook route over a provider-agnostic capture-first pipeline, so swapping the inbound provider is a contained change (re-parse the webhook payload). The original Postmark steps below are kept for reference only.

---

### (reference only — original Postmark steps, not needed for v0)

Why manual: creating the Postmark account/server and pointing its inbound webhook is account-gated. (The DNS MX side is already automated for you.)

1. Go to **[postmarkapp.com](https://postmarkapp.com)** → sign up / log in.
2. **Create a Server** (name it **tada-web**).
3. Open the server → **Inbound** stream → find the **Inbound Webhook** setting.
4. Set the **Inbound Webhook URL** to exactly this (secret is embedded as the Basic-Auth password; username `postmark` is ignored by our verifier):
   ```
   https://postmark:<POSTMARK_INBOUND_WEBHOOK_SECRET>@app.gettada.app/api/inbound/email
   ```
5. **Inbound domain:** set the server's inbound domain to **`in.gettada.app`**. ✅ The MX record (`in.gettada.app` → `inbound.postmarkapp.com`) is **already added** via Vercel DNS, so this will verify with no DNS work from you.

### → Send me back
- Just confirm "**Postmark inbound configured**." (For v0 inbound-only we do **not** need the Postmark Server API token.)
- If Postmark shows the inbound address as something like `xxxxxxxx@inbound.postmarkapp.com`, paste that too — handy as a fallback.

---

## How to hand values back

Either:
- **Paste them here in chat** — fastest. ⚠️ They'll be in the transcript, so treat as **dev-only and rotate before public launch** (same as the Neon/Gemini keys already exposed). I'll have the architect wire them into Vercel env + local `.env`.
- **Or** add them to `.env` yourself with the `!` prefix (e.g. `! echo 'AUTH_GOOGLE_ID=...' >> .env`) and just tell me "Google creds in .env" — I'll have the architect mirror them to Vercel.

---

## What happens after you hand these over
- **Google creds** → unblocks **T3.6 auth** (you sign in at `app.gettada.app` with `seedzpy@gmail.com`, no invite, unlimited plan) + **T3.1 meeting executor**.
- **Postmark confirmed** → unblocks **T2.6 inbound email capture**.
- Until then the team keeps building everything that doesn't need them (Phase 2 capture UI, Phase 3 reminders/research/chat/voice that don't need Google).
</content>
