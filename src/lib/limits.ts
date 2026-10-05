/**
 * Plan limits. Every check takes a plan so a future account/Stripe system only
 * needs to supply the right plan — nothing else in the anonymous path changes.
 */
export type PlanId = "free" | "pro" | "business";

export interface PlanLimits {
  maxFileBytes: number;
  maxFilesPerTask: number;
  serverTasksPerDay: number;
  ocr: boolean;
}

export const plans: Record<PlanId, PlanLimits> = {
  free: { maxFileBytes: 100 * 1024 * 1024, maxFilesPerTask: 20, serverTasksPerDay: 25, ocr: true },
  pro: { maxFileBytes: 1024 * 1024 * 1024, maxFilesPerTask: 200, serverTasksPerDay: 1000, ocr: true },
  business: { maxFileBytes: 4 * 1024 * 1024 * 1024, maxFilesPerTask: 1000, serverTasksPerDay: 100_000, ocr: true },
};

export const currentPlan: PlanId = "free";

export function limitsFor(plan: PlanId = currentPlan): PlanLimits {
  return plans[plan];
}

/** Temporary server-side files live this long before the cleanup sweep removes them. */
export const JOB_TTL_MINUTES = 60;
