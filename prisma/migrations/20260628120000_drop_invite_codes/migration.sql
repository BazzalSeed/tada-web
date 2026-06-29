-- Drop the invite-code system. Beta access is gated entirely by the Google OAuth
-- app's "Testing" publishing status (its test-user allowlist); there is no
-- in-app invite (or admin) gate anymore. See lib/auth.ts / docs/DEPLOY.md.
DROP TABLE "invite_codes";
