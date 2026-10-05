/**
 * SEO helpers: canonical URLs, key facts and JSON-LD structured data.
 * Everything here describes the product truthfully: no ratings, reviews or
 * figures that don't exist.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { brand } from "./brand";
import { JOB_TTL_MINUTES, limitsFor } from "./limits";
import { categories, type Tool } from "./tools";
import { kindLabel } from "./security/filetype";
import type { ToolContent } from "@/content/seo";
import { CONTENT_UPDATED } from "@/content/seo";

export const absolute = (p: string) => new URL(p, brand.url).toString();

export function outputFormat(t: Tool): string {
  const w = t.workspace;
  switch (w.type) {
    case "server": return w.output.toUpperCase();
    case "pdf-to-images": return w.format.toUpperCase();
    case "pdf-to-text": return "TXT";
    case "pdf-to-docx": return "DOCX (Word)";
    case "split": return "PDF or ZIP of PDFs";
    default: return "PDF";
  }
}

export function keyFacts(t: Tool): [string, string][] {
  const mb = Math.round(limitsFor().maxFileBytes / 1024 / 1024);
  return [
    ["Price", "Free"],
    ["Account", "Not required"],
    ["Processing", t.engine === "browser" ? "In your browser. Files aren't uploaded" : `Secure cloud. Files deleted within ${JOB_TTL_MINUTES} minutes`],
    ["Input", [...new Set(t.accepts.map((k) => kindLabel[k]))].join(", ")],
    ["Output", outputFormat(t)],
    ["Max file size", `${mb} MB`],
    ["Works on", "Windows, macOS, Linux, iPhone, Android"],
    ["Watermark", "None"],
  ];
}

/** Public path of a guide screenshot, if it has been captured. */
export function shotPath(slug: string, n: number): string | null {
  const rel = `/guides/${slug}/${n}.jpg`;
  return existsSync(path.join(process.cwd(), "public", rel)) ? rel : null;
}

/** Pixel size of a JPEG (reads the SOF marker), so images reserve the right space (no layout shift). */
export function jpegSize(rel: string): { width: number; height: number } {
  try {
    const b = readFileSync(path.join(process.cwd(), "public", rel));
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  } catch { /* fall through */ }
  return { width: 1280, height: 800 };
}

const organization = () => ({
  "@type": "Organization",
  "@id": absolute("/#organization"),
  name: brand.name,
  url: absolute("/"),
  logo: { "@type": "ImageObject", url: absolute("/icon.svg") },
  email: brand.supportEmail,
});

export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(),
      {
        "@type": "WebSite",
        "@id": absolute("/#website"),
        url: absolute("/"),
        name: brand.name,
        description: brand.description,
        publisher: { "@id": absolute("/#organization") },
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        "@id": absolute("/#app"),
        name: `${brand.name} PDF Editor`,
        url: absolute("/"),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any (web browser)",
        browserRequirements: "Requires a modern browser with JavaScript enabled",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: ["Edit PDF text", "Sign PDF", "Merge PDF", "Split PDF", "Compress PDF", "PDF to Word", "JPG to PDF", "OCR", "Redact PDF", "Password protect PDF"],
        publisher: { "@id": absolute("/#organization") },
      },
    ],
  };
}

export function toolJsonLd(t: Tool, c: ToolContent) {
  const url = absolute(`/${t.slug}`);
  const steps = c.steps.map((s, i) => {
    const shot = s.shot ? shotPath(t.slug, s.shot) : null;
    return {
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.body,
      url: `${url}#step-${i + 1}`,
      ...(shot ? { image: absolute(shot) } : {}),
    };
  });
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(),
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: c.metaTitle,
        description: c.metaDescription,
        inLanguage: "en",
        datePublished: CONTENT_UPDATED,
        dateModified: CONTENT_UPDATED,
        isPartOf: { "@type": "WebSite", "@id": absolute("/#website"), url: absolute("/"), name: brand.name },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: { "@id": `${url}#app` },
        ...(shotPath(t.slug, 1) ? { primaryImageOfPage: { "@type": "ImageObject", url: absolute(shotPath(t.slug, 1)!), ...jpegSize(shotPath(t.slug, 1)!) } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absolute("/") },
          { "@type": "ListItem", position: 2, name: categories[t.category].name, item: absolute(`/#tools-${t.category}`) },
          { "@type": "ListItem", position: 3, name: c.h1, item: url },
        ],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#app`,
        name: `${brand.name} ${t.name}`,
        url,
        description: c.metaDescription,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any (web browser)",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: t.features,
        publisher: { "@id": absolute("/#organization") },
      },
      {
        "@type": "HowTo",
        "@id": `${url}#howto`,
        name: c.howToTitle,
        description: c.quickAnswer,
        totalTime: c.totalTime,
        estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
        tool: { "@type": "HowToTool", name: `${brand.name} ${t.name}` },
        step: steps,
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: c.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

export const jsonLdScript = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
