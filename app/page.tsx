import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Landing } from "@/app/components/landing/Landing";

// Apex marketing route (gettada.app). Anonymous visitors get the pitch; an
// already-authenticated visitor is sent straight to the app. This isn't just UX:
// showing a signed-in user the landing's "Log in" button let them start a second
// OAuth flow and (because Auth.js links a new login to the active session) merge a
// different Google account onto their user. Redirecting closes that path.
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/app");
  return <Landing />;
}
