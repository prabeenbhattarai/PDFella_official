import type { ToolContent } from "./types";
import { editContent } from "./edit";
import { organiseContent } from "./organise";
import { convertContent } from "./convert";
import { otherContent } from "./other";
import { tools } from "@/lib/tools";

export type { ToolContent } from "./types";

const all = [...editContent, ...organiseContent, ...convertContent, ...otherContent];
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
