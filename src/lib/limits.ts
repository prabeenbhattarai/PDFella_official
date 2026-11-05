/**
 * Plan limits. Every check takes a plan so a future account/Stripe system only
 * needs to supply the right plan — nothing else in the anonymous path changes.
 */
export type PlanId = "free" | "lite" | "pro";

export interface PlanLimits {
  maxFileBytes: number;
  maxFilesPerTask: number;
  serverTasksPerDay: number;
  ocr: boolean;
}

export const plans: Record<PlanId, PlanLimits> = {
  free: { maxFileBytes: 100 * 1024 * 1024, maxFilesPerTask: 20, serverTasksPerDay: process.env.NEXT_PUBLIC_PLANS_ENABLED === "1" ? 5 : 25, ocr: true },
  lite: { maxFileBytes: 250 * 1024 * 1024, maxFilesPerTask: 50, serverTasksPerDay: 50, ocr: true },
  pro: { maxFileBytes: 500 * 1024 * 1024, maxFilesPerTask: 200, serverTasksPerDay: 1000, ocr: true },
};

export const currentPlan: PlanId = "free";

export function limitsFor(plan: PlanId = currentPlan): PlanLimits {
  return plans[plan];
}

/** Temporary server-side files live this long before the cleanup sweep removes them. */
export const JOB_TTL_MINUTES = 60;
