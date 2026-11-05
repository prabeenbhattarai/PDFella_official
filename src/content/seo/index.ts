import type { ToolContent } from "./types";
import { editContent } from "./edit";
import { organiseContent } from "./organise";
import { convertContent } from "./convert";
import { otherContent } from "./other";
import { tools } from "@/lib/tools";
import { toolPlan } from "@/lib/plan-copy";
import { forPaidPlan } from "./paid-tools";

export type { ToolContent } from "./types";

const enabled = new Set(tools.map((t) => t.slug));
const everything = [...editContent, ...organiseContent, ...convertContent, ...otherContent].filter((c) => enabled.has(c.slug));
/** Paid tools describe their plan, not "free", once plans are switched on. */
const all = everything.map((c) => { const plan = toolPlan(c.slug); return plan ? forPaidPlan(c, plan) : c; });
const bySlug = new Map(all.map((c) => [c.slug, c]));

/** Publication / last-reviewed date shown on guides and used in structured data. */
export const CONTENT_UPDATED = "2026-10-05";

export function getContent(slug: string): ToolContent | undefined {
  return bySlug.get(slug);
}

/** Every tool must have SEO content; used by tests and at build time. */
export function missingContent(): string[] {
  return tools.map((t) => t.slug).filter((s) => !bySlug.has(s));
}

export const allContent = all;
