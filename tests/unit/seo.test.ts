import { describe, expect, it } from "vitest";
import { allContent, missingContent } from "@/content/seo";
import { tools } from "@/lib/tools";
import { toolPlanWhenOn } from "@/lib/plan-copy";
import { forPaidPlan } from "@/content/seo/paid-tools";

const words = (s: string) => s.trim().split(/\s+/).length;

describe("SEO content", () => {
  it("covers every tool page", () => {
    expect(missingContent()).toEqual([]);
    expect(allContent).toHaveLength(tools.length);
  });

  it.each(allContent.map((c) => [c.slug, c] as const))("%s meets on-page SEO rules", (_slug, c) => {
    expect(c.metaTitle.length).toBeLessThanOrEqual(60);
    expect(c.metaTitle.toLowerCase()).toContain(c.keyword.split(" ")[0]);
    expect(c.metaDescription.length).toBeGreaterThanOrEqual(110);
    expect(c.metaDescription.length).toBeLessThanOrEqual(160);
    // Answer engines quote ~40–60 words; allow a little either side.
    expect(words(c.quickAnswer)).toBeGreaterThanOrEqual(30);
    expect(words(c.quickAnswer)).toBeLessThanOrEqual(70);
    expect(c.steps.length).toBeGreaterThanOrEqual(3);
    expect(c.faq.length).toBeGreaterThanOrEqual(6);
    expect(c.benefits).toHaveLength(4);
    expect(c.sections.length).toBeGreaterThanOrEqual(1);
    expect(c.totalTime).toMatch(/^PT\d+M$/);
    // No em dashes between sentences in user-facing copy.
    for (const text of [c.metaTitle, c.metaDescription, c.h1, c.subtitle, c.quickAnswer, ...c.steps.flatMap((s) => [s.title, s.body]), ...c.faq.flatMap((f) => [f.q, f.a])]) {
      expect(text).not.toMatch(/ — /);
    }
  });

  it("uses unique titles, descriptions and H1s", () => {
    for (const key of ["metaTitle", "metaDescription", "h1", "keyword"] as const) {
      const values = allContent.map((c) => c[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("paid tools once plans are on", () => {
  const PAID = allContent.filter((c) => toolPlanWhenOn(c.slug));
  it("covers all of them", () => expect(PAID.map((c) => c.slug).sort()).toEqual(["create-pdf-form", "fill-pdf-from-spreadsheet", "pdf-templates", "redact-pdf", "sign-pdf"]));
  it.each(PAID.map((c) => [c.slug, forPaidPlan(c, toolPlanWhenOn(c.slug)!)] as const))("%s never says it's free, and follows the SEO rules", (_slug, c) => {
    const text = [c.metaTitle, c.metaDescription, c.h1, c.subtitle, c.quickAnswer, ...c.keywords, ...c.steps.flatMap((s) => [s.title, s.body]), ...c.benefits.flatMap((b) => [b.title, b.body]), ...c.faq.flatMap((f) => [f.q, f.a]), ...c.sections.flatMap((s) => [s.heading, ...s.body]), ...(c.tips ?? [])];
    expect(text.filter((t) => /\bfree\b|no sign-up|no account/i.test(t))).toEqual([]);
    expect(c.metaTitle.length).toBeLessThanOrEqual(60);
    expect(c.metaDescription.length).toBeGreaterThanOrEqual(110);
    expect(c.metaDescription.length).toBeLessThanOrEqual(160);
    expect(c.faq.length).toBeGreaterThanOrEqual(6);
    expect(c.benefits).toHaveLength(4);
    expect(words(c.quickAnswer)).toBeLessThanOrEqual(70);
  });
});
