// ============================================================================
// T2.2/T3.3 — plan gating / credit metering (the withQuota seam from contracts).
// ai_usage PK (user_id, period 'YYYY-MM'). Reserve atomically via a conditional
// UPDATE (used + cost <= limit); admin/unlimited short-circuits; refund on the
// run throwing (covers deepResearch's reserve-up-front-refund-on-failure and is
// harmless for the cost-1 capabilities). QuotaError => HTTP 402.
// ============================================================================

import { prisma } from "./db";
import { COST, PLAN_CREDITS, QuotaError } from "./contracts";
import type { WithQuota } from "./contracts";

// Period bucket = current calendar month in UTC ('YYYY-MM').
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

// Typed against the frozen `WithQuota` alias so any signature drift fails tsc.
export const withQuota: WithQuota = async (user, cap, run) => {
  const limit = PLAN_CREDITS[user.plan];
  // Unlimited (admin) — never meter, never write a usage row.
  if (!Number.isFinite(limit)) return run();

  const cost = COST[cap];
  const period = currentPeriod();

  // Ensure the period row exists, then atomically reserve iff under the cap.
  await prisma.aiUsage.upsert({
    where: { userId_period: { userId: user.userId, period } },
    create: { userId: user.userId, period, used: 0 },
    update: {},
  });
  const reserved = await prisma.aiUsage.updateMany({
    where: { userId: user.userId, period, used: { lte: limit - cost } },
    data: { used: { increment: cost } },
  });
  if (reserved.count === 0) {
    throw new QuotaError(`Out of credits for ${cap} this period`);
  }

  try {
    return await run();
  } catch (err) {
    // Refund the reservation on failure — don't charge for work that didn't land.
    await prisma.aiUsage
      .updateMany({
        where: { userId: user.userId, period },
        data: { used: { decrement: cost } },
      })
      .catch(() => undefined);
    throw err;
  }
};
