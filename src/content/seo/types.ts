/**
 * SEO / AEO / GEO content for a tool page.
 *
 *  - SEO: keyword-led title, description, H1 and long-form sections.
 *  - AEO: `quickAnswer` is a direct 40–60 word answer to "How do I …?" placed at the
 *    top of the page and in the FAQ/HowTo structured data, so answer engines can quote it.
 *  - GEO: factual, self-contained statements (key facts table, steps, FAQs) that
 *    generative engines can cite accurately. Every claim must be true of the product.
 */
export interface GuideStep {
  title: string;
  body: string;
  /** Screenshot index in /public/guides/<slug>/<n>.png (captured from the real app). */
  shot?: number;
}

export interface ToolContent {
  slug: string;
  /** Primary keyword this page targets. */
  keyword: string;
  /** Secondary keywords / close variants used naturally in the copy. */
  keywords: string[];
  /** <title> — under ~60 characters, keyword first. */
  metaTitle: string;
  /** Meta description — 140–160 characters, benefit + call to action. */
  metaDescription: string;
  h1: string;
  subtitle: string;
  /** Direct answer to "How do I <keyword>?" (40–60 words). */
  quickAnswer: string;
  /** Title of the tutorial, e.g. "How to merge PDF files". */
  howToTitle: string;
  /** Rough time to complete, ISO 8601 duration for HowTo schema, e.g. "PT1M". */
  totalTime: string;
  steps: GuideStep[];
  benefits: { title: string; body: string }[];
  sections: { heading: string; body: string[] }[];
  tips: string[];
  useCases: { who: string; what: string }[];
  faq: { q: string; a: string }[];
}
