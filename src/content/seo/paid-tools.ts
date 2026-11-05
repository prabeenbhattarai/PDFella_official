import type { ToolContent } from "./types";
import { planName, type PaidPlan } from "@/lib/plan-copy";
import { PRICES } from "@/lib/pricing";

/** Search titles and descriptions for tools that are part of a paid plan. */
const COPY: Record<string, Pick<ToolContent, "metaTitle" | "metaDescription" | "h1">> = {
  "sign-pdf": {
    metaTitle: "Sign PDF Online: Add Your Signature | PDFella",
    metaDescription: "Sign PDFs online. Type, draw or upload your signature, place it anywhere and download. Part of our Lite and Pro plans, and your file is never uploaded.",
    h1: "Sign PDF online",
  },
  "redact-pdf": {
    metaTitle: "Redact PDF Online: Remove Sensitive Content | PDFella",
    metaDescription: "Redact a PDF online and permanently remove sensitive text and areas, not just cover them. Part of our Pro plan, and it runs in your browser.",
    h1: "Redact PDF",
  },
  "create-pdf-form": {
    metaTitle: "Create a Fillable PDF Form Online | PDFella",
    metaDescription: "Create fillable PDF forms online with text fields, checkboxes, dropdowns and signature fields. Part of our Pro plan, and it runs in your browser.",
    h1: "Create a fillable PDF form",
  },
  "pdf-templates": {
    metaTitle: "PDF Templates: Save and Reuse Forms | PDFella",
    metaDescription: "Save the PDF forms and contracts you use often, then fill one in the editor or many from a spreadsheet. Part of our Pro plan, stored on your device.",
    h1: "Reusable PDF templates",
  },
  "fill-pdf-from-spreadsheet": {
    metaTitle: "Fill PDF from Excel or CSV: Bulk Fill Forms | PDFella",
    metaDescription: "Fill a PDF form once for every row of an Excel or CSV file and download all the copies in a ZIP. Part of our Pro plan, and it runs in your browser.",
    h1: "Fill a PDF form from a spreadsheet",
  },
};

const FREE = /\bfree\b/i;
const unfree = (s: string) => s.replace(/,?\s*\bfree\b,?\s*/gi, " ").replace(/\s+([.,])/g, "$1").replace(/\s{2,}/g, " ").trim();

/** The same guide, without claiming that a paid tool is free. */
export function forPaidPlan(c: ToolContent, plan: PaidPlan): ToolContent {
  const name = plan === "lite" ? "Lite and Pro" : "Pro";
  const includes = `${planName(plan)} starts from $${PRICES[plan].yearly} a month, billed yearly.`;
  const keep = c.faq.filter((f) => !FREE.test(f.q) && !FREE.test(f.a) && !/need an account/i.test(f.q));
  return {
    ...c,
    ...COPY[c.slug],
    keywords: c.keywords.filter((k) => !FREE.test(k)),
    subtitle: unfree(c.subtitle),
    quickAnswer: `${unfree(c.quickAnswer)} ${c.slug in COPY ? `It's part of ${name}.` : ""}`.trim(),
    benefits: c.benefits.map((b) => (FREE.test(b.title) || FREE.test(b.body) ? { title: `Part of ${name}`, body: includes } : b)),
    faq: [{ q: "Which plan includes this?", a: `It's part of ${name}. ${includes}` }, { q: "Do I need an account?", a: "Yes. Your plan is kept on your account, and you sign in with Google." }, ...keep],
  };
}
