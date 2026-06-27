// TEST SEAM — never in prod. One-click dev sign-in for headless e2e, so the
// reviewer can drive authed flows without the interactive Google OAuth dance.
// Hard-gated: redirects away unless NODE_ENV!=='production' && ENABLE_DEV_LOGIN==='1'.
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { devLoginEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function DevLoginPage() {
  if (!devLoginEnabled()) redirect("/");

  async function doLogin(formData: FormData) {
    "use server";
    if (!devLoginEnabled()) throw new Error("dev-login disabled");
    const email =
      (formData.get("email") as string) ||
      process.env.DEV_LOGIN_EMAIL ||
      "seedzpy@gmail.com";
    await signIn("dev-login", { email, redirectTo: "/" });
  }

  return (
    <main style={{ padding: "4rem", fontFamily: "system-ui" }}>
      <h1>Dev sign-in (test only)</h1>
      <p>Hard-gated to non-production. Signs in a test user without Google.</p>
      <form action={doLogin}>
        <input
          name="email"
          defaultValue={process.env.DEV_LOGIN_EMAIL ?? "seedzpy@gmail.com"}
          aria-label="email"
        />
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
