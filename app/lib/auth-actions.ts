"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut, authCookieDomain } from "@/auth";

// Every Auth.js session-cookie name we might have set, including the chunk
// suffixes it appends when a cookie exceeds ~4KB. Covers both the secure
// (`__Secure-`) prod names and the plain local-dev names.
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "__Secure-authjs.session-token.0",
  "__Secure-authjs.session-token.1",
  "__Secure-authjs.session-token.2",
  "authjs.session-token",
  "authjs.session-token.0",
  "authjs.session-token.1",
];

// Sign out reliably. Auth.js `signOut` clears what it can, but the v5 beta does
// not consistently delete a Domain-scoped, chunked session cookie — which left
// users "signed out" yet still authenticated. So we also force-expire every
// session-cookie name on the SAME parent domain the cookie was set with
// (authCookieDomain, e.g. `gettada.app`). Cookie identity is (name, domain,
// path), so a Max-Age=0 write on the matching triple deletes it regardless of
// chunking. Used by the app's Sign Out button.
export async function signOutAction() {
  await signOut({ redirect: false });

  const jar = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    jar.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
      ...(authCookieDomain ? { domain: authCookieDomain } : {}),
    });
  }

  redirect("/");
}
