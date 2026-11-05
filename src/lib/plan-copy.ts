/**
 * Wording that depends on whether plans are switched on, so nothing on the site
 * promises free access to something that's part of a paid plan, or the other way round.
 */
export const plansOn = process.env.NEXT_PUBLIC_PLANS_ENABLED === "1";

export type PaidPlan = "lite" | "pro";

/** Tools whose main job is part of a paid plan. */
const TOOL_PLANS: Record<string, PaidPlan> = {
  "sign-pdf": "lite",
  "redact-pdf": "pro",
  "create-pdf-form": "pro",
  "pdf-templates": "pro",
  "fill-pdf-from-spreadsheet": "pro",
};
export const toolPlanWhenOn = (slug: string): PaidPlan | undefined => TOOL_PLANS[slug];
export const toolPlan = (slug: string): PaidPlan | undefined => (plansOn ? TOOL_PLANS[slug] : undefined);
export const planName = (plan: PaidPlan) => (plan === "lite" ? "Lite" : "Pro");

export const EXTRAS_NOTE = plansOn
  ? "Signatures, stamps, adding pages and more than 50 extra fonts are part of our Lite and Pro plans."
  : "Signatures, stamps, adding pages and font styles need a free one-click Google sign-in.";
export const FONTS_NOTE = plansOn
  ? "It's free with the most common fonts. More than 50 extra fonts are part of our Lite and Pro plans."
  : "It's free; changing fonts and bold or italic styles needs a free one-click Google sign-in.";
export const ANNOTATE_NOTE = plansOn
  ? "Yes, apart from stamps. Comments, checkmarks, shapes and links work without an account, and stamps are part of our Lite and Pro plans."
  : "Yes, all annotation tools are free. Comments, checkmarks, shapes and links work without an account; stamps need a free one-click Google sign-in.";
