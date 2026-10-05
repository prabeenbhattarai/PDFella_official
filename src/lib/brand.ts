/** Brand. Change here and everything (metadata, logo text, emails) follows. */
export const brand = {
  name: "PDFella",
  tagline: "Everything you need to work with PDFs.",
  description:
    "Edit, convert, sign, compress, organise and protect your documents online, without installing software or creating an account.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supportEmail: "support@pdfella.example",
} as const;
