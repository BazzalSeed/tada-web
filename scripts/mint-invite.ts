// T3.6 — mint an invite code. Usage:
//   npx tsx scripts/mint-invite.ts [code] [maxUses] [invitedEmail]
// Code defaults to a random url-safe token; maxUses defaults to 1.
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/db";

async function main() {
  const code = process.argv[2] ?? randomBytes(6).toString("base64url");
  const maxUses = Number(process.argv[3] ?? 1);
  const invitedEmail = process.argv[4]?.toLowerCase() ?? null;

  const invite = await prisma.inviteCode.create({
    data: { code, maxUses, invitedEmail },
  });
  console.log(
    `Minted invite: ${invite.code}  (maxUses=${invite.maxUses}` +
      `${invitedEmail ? `, invitedEmail=${invitedEmail}` : ""})`,
  );
  console.log(`Join URL: https://app.gettada.app/join?code=${invite.code}`);
}

main()
  .catch((err) => {
    console.error("mint-invite failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
