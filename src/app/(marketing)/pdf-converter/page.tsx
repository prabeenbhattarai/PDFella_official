import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Laptop, Sparkles } from "lucide-react";
import { getTool, type Tool } from "@/lib/tools";
import { getContent, CONTENT_UPDATED } from "@/content/seo";
import { brand } from "@/lib/brand";
import { absolute, jsonLdScript } from "@/lib/seo";
import { ToolCard } from "@/components/marketing/tool-grid";
import { Faq } from "@/components/marketing/faq";
import { HeroUpload } from "@/components/marketing/hero-upload";
import { FileIcon } from "@/components/marketing/illustrations";

const TITLE = `Free PDF Converter: Convert to & from PDF Online | ${brand.name}`;
const DESCRIPTION = "Free online PDF converter. Convert PDF to Word, JPG, PNG, Excel and PowerPoint, and Word, Excel, PowerPoint and images to PDF. No sign-up, no watermark.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["pdf converter", "free pdf converter", "convert pdf", "online pdf converter", "pdf to word", "jpg to pdf", "word to pdf"],
  alternates: { canonical: "/pdf-converter" },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: "/pdf-converter" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const pick = (s: string[]) => s.map(getTool).filter(Boolean) as Tool[];
const FROM = pick(["pdf-to-word", "pdf-to-jpg", "pdf-to-png", "pdf-to-excel", "pdf-to-powerpoint", "pdf-to-text"]);
const TO = pick(["word-to-pdf", "excel-to-pdf", "powerpoint-to-pdf", "jpg-to-pdf", "png-to-pdf"]);

const faq = [
  { q: "What is the best free PDF converter?", a: `${brand.name} converts PDFs to Word, JPG, PNG, Excel, PowerPoint and text, and converts Word, Excel, PowerPoint and images to PDF, free and without an account or watermark. PDF to Word, PDF to images and images to PDF run in your browser, so files aren't uploaded.` },
  { q: "How do I convert a PDF to Word?", a: "Open PDF to Word and drop your PDF onto the page. It converts in your browser with live progress, then you download an editable .docx file." },
  { q: "How do I convert JPG to PDF?", a: "Open JPG to PDF, add your images, arrange them, choose a page size and click Convert to PDF." },
  { q: "Are my files safe?", a: "Browser-based conversions never upload your file. Office conversions use secure cloud processing and delete files automatically within 60 minutes." },
  { q: "Is there a file size limit?", a: "Files up to 100 MB can be converted." },
  { q: "Do converted files have a watermark?", a: "No. Converted files are clean, with no watermark or branding." },
];

export default function PdfConverterPage() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": absolute("/pdf-converter#page"), url: absolute("/pdf-converter"), name: TITLE, description: DESCRIPTION, dateModified: CONTENT_UPDATED, inLanguage: "en" },
      { "@type": "ItemList", itemListElement: [...FROM, ...TO].map((t, i) => ({ "@type": "ListItem", position: i + 1, name: getContent(t.slug)?.h1 ?? t.name, url: absolute(`/${t.slug}`) })) },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: absolute("/") }, { "@type": "ListItem", position: 2, name: "PDF Converter", item: absolute("/pdf-converter") }] },
      { "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_40%_20%,black,transparent_70%)]" aria-hidden />
        <div className="wrap relative grid items-center gap-12 py-14 lg:grid-cols-[1fr_1fr] lg:py-20">
          <div>
            <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-[13px] font-medium text-ink-3">
              <Link href="/" className="hover:text-ink">Home</Link><ChevronRight className="size-3.5" /><span className="text-ink-2" aria-current="page">PDF Converter</span>
            </nav>
            <h1 className="font-display text-5xl leading-[0.98] tracking-tight sm:text-7xl">Free PDF converter</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">Convert PDFs to Word, JPG, PNG, Excel and PowerPoint, and turn Word, Excel, PowerPoint and images into PDFs. Fast, free and private.</p>
            <ul className="mt-6 grid max-w-xl gap-2.5 text-[15px] font-medium text-ink-2 sm:grid-cols-2">
              {["11 conversion tools", "No sign-up or watermark", "Most conversions run in your browser", "Files up to 100 MB"].map((x) => <li key={x} className="flex items-center gap-2"><Check className="size-4 text-accent" />{x}</li>)}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              {(["PDF", "DOCX", "XLSX", "PPTX", "JPG", "PNG", "TXT"] as const).map((f) => <FileIcon key={f} type={f} className="w-9" />)}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-4 shadow-[0_30px_60px_-24px_rgb(0_0_0/.25)] sm:p-5">
            <HeroUpload />
            <p className="mt-3 text-center text-[13px] font-medium text-ink-3">Drop any file to open it, or pick a converter below.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface-2/60 py-14">
        <div className="wrap max-w-4xl">
          <div className="paper rounded-2xl p-7 sm:p-9">
            <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold tracking-[0.14em] text-accent uppercase"><Sparkles className="size-4" /> Quick answer</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How do I convert a file to or from PDF?</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">Choose the converter for your formats below, for example PDF to Word or JPG to PDF, then drop your file onto the page. Browser-based converters start immediately and show live progress; when it&apos;s done, click Download. No account is needed and files never carry a watermark.</p>
          </div>
        </div>
      </section>

      {[["Convert from PDF", "Turn PDFs into editable documents and images.", FROM], ["Convert to PDF", "Create PDFs from Office documents and images.", TO]].map(([title, intro, list]) => (
        <section key={title as string} className="py-16">
          <div className="wrap">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-4xl tracking-tight sm:text-5xl">{title as string}</h2>
                <p className="mt-2 text-[17px] text-ink-2">{intro as string}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{(list as Tool[]).map((t) => <ToolCard key={t.slug} t={t} />)}</div>
          </div>
        </section>
      ))}

      <section className="border-y border-border bg-surface-2/60 py-16">
        <div className="wrap grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Which PDF converter should I use?</h2>
            <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-ink-2">
              <p>To <strong className="text-ink">edit the words</strong> of a PDF in Word, use <Link className="text-accent hover:underline" href="/pdf-to-word">PDF to Word</Link>. If you only need to change a few words, <Link className="text-accent hover:underline" href="/edit-pdf">Edit PDF</Link> is faster because it edits the PDF directly.</p>
              <p>To <strong className="text-ink">share a page as a picture</strong>, use <Link className="text-accent hover:underline" href="/pdf-to-jpg">PDF to JPG</Link> for photos and scans, or <Link className="text-accent hover:underline" href="/pdf-to-png">PDF to PNG</Link> for sharp text and diagrams.</p>
              <p>To <strong className="text-ink">work with data</strong>, <Link className="text-accent hover:underline" href="/pdf-to-excel">PDF to Excel</Link> extracts tables into a spreadsheet.</p>
              <p>To <strong className="text-ink">create a PDF</strong>, use <Link className="text-accent hover:underline" href="/word-to-pdf">Word to PDF</Link>, <Link className="text-accent hover:underline" href="/excel-to-pdf">Excel to PDF</Link>, <Link className="text-accent hover:underline" href="/powerpoint-to-pdf">PowerPoint to PDF</Link> or <Link className="text-accent hover:underline" href="/jpg-to-pdf">JPG to PDF</Link>.</p>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Private by design</h2>
            <p className="mt-4 flex gap-3 text-[17px] leading-relaxed text-ink-2"><Laptop className="mt-1 size-5 shrink-0 text-accent" />PDF to Word, PDF to JPG/PNG, PDF to text, and JPG/PNG to PDF run entirely in your browser: your files are never uploaded. Office conversions use secure cloud processing and files are deleted automatically within 60 minutes.</p>
            <Link href="/privacy" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">How we handle files <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="wrap grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="mb-3 text-[13px] font-semibold tracking-[0.14em] text-accent uppercase">FAQ</p>
            <h2 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">PDF converter questions</h2>
          </div>
          <Faq items={faq} schema={false} />
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(graph)} />
    </>
  );
}
