/**
 * Public site address used in canonical links, the sitemap, Open Graph and structured data.
 * Set NEXT_PUBLIC_SITE_URL at build time; on Vercel it otherwise falls back to the
 * project's production domain (never to localhost on a real deployment).
 */
const vercelProd = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (vercelProd ? `https://${vercelProd}` : "http://localhost:3000")).replace(/\/+$/, "");

/** Brand. Change here and everything (metadata, logo text, emails) follows. */
export const brand = {
  name: "PDFella",
  tagline: "Everything you need to work with PDFs.",
  description:
    "Edit, convert, sign, compress, organise and protect your documents online, without installing software or creating an account.",
  url: siteUrl,
  supportEmail: "support@pdfella.com",
} as const;
