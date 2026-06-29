# E2E auth — how Playwright stays signed in (no dev-login)

We test interactive flows with **Playwright MCP**, not a committed `@playwright/test`
suite. There is intentionally no `auth.setup.ts` / `playwright.config.ts`: Google blocks
headless OAuth and our CI is local/Docker, so a self-seeding auth-setup project couldn't
run in CI anyway. dev-login (the old non-prod Credentials shortcut) has been removed.

## How the session persists

Playwright MCP launches Chromium with a **persistent user-data-dir**, so the Google
session survives across MCP restarts. You sign in with a real Google account **once**
(any Google OAuth test-user → admitted with `plan='unlimited'`) and subsequent runs
reuse that cookie. The session is the Auth.js JWT cookie `authjs.session-token`
(httpOnly, ~30-day expiry); the Google refresh_token lives only on the DB `Account` row,
never in the cookie.

Verify you're still signed in:

```js
// Playwright MCP: navigate then read
await page.goto('http://localhost:3000/api/auth/session');
// → {"user":{"email":"seedzpy@gmail.com","plan":"unlimited",...},"expires":...}
```

## Durable backup (`playwright/.auth/user.json`)

The persistent profile can get wiped. As a backup we snapshot the live session's
`storageState` (cookies incl. the httpOnly session-token) to **`playwright/.auth/user.json`**
— **gitignored**, because it's a live credential.

Re-snapshot from a signed-in MCP session (`browser_run_code_unsafe`):

```js
async (page) => {
  await page.context().storageState({
    path: '/Users/seedz/projects/tada-web/playwright/.auth/user.json',
  });
}
```

Restore into a fresh (logged-out) MCP context, when the profile was wiped but the cookie
hasn't expired:

```js
async (page) => {
  const fs = require('fs');
  const state = JSON.parse(
    fs.readFileSync('/Users/seedz/projects/tada-web/playwright/.auth/user.json', 'utf8'),
  );
  await page.context().addCookies(state.cookies);
  await page.goto('http://localhost:3000/app'); // now authenticated
}
```

If the cookie has expired (or you need a different account), there's no shortcut left —
sign in through Google once in a headed MCP window, then re-snapshot.
