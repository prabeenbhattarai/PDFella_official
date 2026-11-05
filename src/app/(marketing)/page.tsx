import { cloudToolsEnabled } from "@/lib/tools";
import { EXTRAS_NOTE, plansOn } from "@/lib/plan-copy";
import Link from "next/link";
import {
  ArrowRight, Check, GraduationCap, Briefcase, Scale, Home, Users, Calculator, PenTool,
  Landmark, ShieldCheck, Zap, UserX,
} from "lucide-react";
import { HeroUpload } from "@/components/marketing/hero-upload";
import { ToolGrid } from "@/components/marketing/tool-grid";
import { Faq } from "@/components/marketing/faq";
import { LiveDemo } from "@/components/marketing/live-demo";
import { InView } from "@/components/marketing/in-view";
import { FileIcon, SquiggleArrow, StepDownload, StepEdit, StepUpload, WhyBigFiles, WhyInstant, WhyPrivate, WhyRealPdf, SecLocal, SecDelete, SecEncrypted, SecNoTraining } from "@/components/marketing/illustrations";
import { MarqueeClone } from "@/components/marketing/marquee-clone";
import { AppHome } from "@/components/desktop/app-home";
import { brand } from "@/lib/brand";
import { jsonLdScript, siteJsonLd } from "@/lib/seo";
import { JOB_TTL_MINUTES, limitsFor } from "@/lib/limits";

const faq = [
  { q: `What is ${brand.name}?`, a: `${brand.name} (also written "${brand.alternateNames[0]}") is a free online PDF editor. It edits the existing text in your PDFs and lets you sign, highlight, redact, merge, split, compress and convert documents right in your browser, with no watermark and no sign-up for most tools.` },
  { q: `Is ${brand.name} free to use?`, a: `${plansOn ? "Yes, for everyday PDF work, with no watermark and no account." : "Yes. Every tool is free with generous limits, and most work without an account."} ${EXTRAS_NOTE}${cloudToolsEnabled ? " Heavier cloud processing (OCR, Office conversion) has a daily allowance." : ""}` },
  { q: "Do I need to create an account?", a: plansOn ? "Not for the free tools. Drop a file and start working. Buying a plan needs a one-click Google sign-in, so your plan stays on your account." : `Not for most tools. Drop a file and start working. ${EXTRAS_NOTE}` },
  { q: "Are my files uploaded to your servers?", a: `Editing, organising, signing, PDF → Word, compression, protect/unlock and most conversions run entirely in your browser, so the file never leaves your device. ${cloudToolsEnabled ? `Tools marked "Secure cloud" (OCR, Office → PDF) upload the file to private, temporary storage and delete it within ${JOB_TTL_MINUTES} minutes.` : "OCR and Office conversions are coming soon."}` },
  { q: "Can I really edit the existing text in a PDF?", a: "Yes. Double-click any word or sentence and type. The original text is removed from the PDF and replaced at the same position, size and style." },
  { q: "My PDF has a password. Can I still edit it?", a: "Yes. PDFs that only restrict printing, copying or editing open automatically. If a PDF needs a password to open, enter it once and the document becomes fully editable." },
  { q: "Is redaction permanent?", a: "Yes. Redacted content is removed from the file, not just covered. Try selecting or searching the redacted text afterwards. It won't be there." },
  { q: "Do you use my documents to train AI?", a: "No. Documents are never used for training, analytics or anything other than producing the result you asked for." },
];

const useCases = [
  { icon: GraduationCap, t: "Students", d: "Annotate readings, fill application forms, merge assignment files.", c: "var(--cat-convert)" },
  { icon: Briefcase, t: "Businesses", d: "Sign contracts, update proposals, compress reports for email.", c: "var(--cat-optimise)" },
  { icon: Scale, t: "Legal", d: "Redact privileged content, review with comments, sign and date.", c: "var(--cat-security)" },
  { icon: Home, t: "Real estate", d: "Complete disclosure forms, initial pages, assemble closing packs.", c: "var(--cat-organise)" },
  { icon: Users, t: "HR", d: "Onboarding forms, offer letters, policy acknowledgements.", c: "var(--cat-forms)" },
  { icon: Calculator, t: "Accountants", d: "Extract tables to Excel, stamp invoices, protect statements.", c: "var(--cat-optimise)" },
  { icon: PenTool, t: "Designers", d: "Mark up proofs with shapes, arrows and sticky notes.", c: "var(--cat-edit)" },
  { icon: Landmark, t: "Public sector", d: "Standard forms, signatures and permanent redaction.", c: "var(--cat-convert)" },
];

// What PDFella actually does today, with the catch for each row. Keep this in step with lib/tools.ts and lib/limits.ts.
const free = limitsFor("free");
type FactRow = [string, string, true | string];
const facts: FactRow[] = [
  ["Edit existing text, sign and annotate", plansOn ? "Editing and annotating are free. Signatures and stamps are part of Lite and Pro" : "Signatures, stamps, extra pages and font styles need a free Google sign-in", true],
  ["Merge, split, compress and organise pages", "Runs in your browser", true],
  ...(cloudToolsEnabled ? [
    ["Convert to and from Word, Excel and PowerPoint", "PDF to Word runs in your browser; the other conversions use secure cloud", true],
    ["OCR for scanned PDFs", `Secure cloud, up to ${free.serverTasksPerDay} cloud tasks a day`, true],
  ] as FactRow[] : [
    ["Convert PDFs to Word, images and text", "Runs in your browser. Excel, PowerPoint and Office to PDF are coming soon", true],
    ["OCR for scanned PDFs", "Making scanned PDFs searchable is on the way", "Coming soon"],
  ] as FactRow[]),
  cloudToolsEnabled ? ["Your files stay on your device", `Cloud tools delete files within ${JOB_TTL_MINUTES} minutes`, "Most tools"] : ["Your files stay on your device", "Today's tools all run in your browser", true],
  ["Account", "Most tools work without one", "Optional"],
  ["Phone and tablet", "Works in any modern browser", true],
  ["Install", "Use it in the browser, or get the app for Mac and Windows", "Optional"],
  ["Price", `No watermark, files up to ${free.maxFileBytes / 1024 / 1024} MB`, "Free"],
];

const tickerItem = "flex items-center gap-3 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:text-accent";

type FormatRow = [string, string, "PDF" | "DOCX" | "JPG" | "XLSX" | "PPTX" | "PNG" | "TXT"];
const formats: FormatRow[] = [
  ["PDF to Word", "/pdf-to-word", "DOCX"], ...(cloudToolsEnabled ? [["Word to PDF", "/word-to-pdf", "PDF"]] as FormatRow[] : []), ["PDF to JPG", "/pdf-to-jpg", "JPG"], ["JPG to PDF", "/jpg-to-pdf", "PDF"],
  ...(cloudToolsEnabled ? [["PDF to Excel", "/pdf-to-excel", "XLSX"], ["PDF to PowerPoint", "/pdf-to-powerpoint", "PPTX"]] as FormatRow[] : []), ["Merge PDF", "/merge-pdf", "PDF"], ["Split PDF", "/split-pdf", "PDF"],
  ["Compress PDF", "/compress-pdf", "PDF"], ["Sign PDF", "/sign-pdf", "PDF"], ["Redact PDF", "/redact-pdf", "PDF"], ...(cloudToolsEnabled ? [["OCR PDF", "/ocr-pdf", "PNG"]] as FormatRow[] : []),
  ["Protect PDF", "/protect-pdf", "PDF"], ["Unlock PDF", "/unlock-pdf", "PDF"], ["Watermark PDF", "/watermark-pdf", "PDF"], ["Add page numbers", "/add-page-numbers-to-pdf", "TXT"],
];

function Heading({ eyebrow, title, intro, center = true }: { eyebrow: string; title: React.ReactNode; intro?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto mb-14 max-w-3xl text-center" : "mb-10 max-w-xl"}>
      <p className="mb-3 inline-flex items-center gap-2 text-[13px] font-semibold tracking-[0.14em] text-accent uppercase">
        <span className="h-px w-6 bg-accent" />{eyebrow}{center && <span className="h-px w-6 bg-accent" />}
      </p>
      <h2 className="font-display text-[42px] leading-[1.02] tracking-tight sm:text-6xl">{title}</h2>
      {intro && <p className="mt-5 text-lg leading-relaxed text-ink-2">{intro}</p>}
    </div>
  );
}

function Feature({ eyebrow, title, body, bullets, href, cta, visual, flip }: { eyebrow: string; title: string; body: string; bullets: string[]; href: string; cta: string; visual: React.ReactNode; flip?: boolean }) {
  return (
    <InView className="grid items-center gap-10 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
      <div className={`reveal ${flip ? "lg:order-2" : ""}`}>
        <p className="mb-3 text-[13px] font-semibold tracking-[0.14em] text-accent uppercase">{eyebrow}</p>
        <h3 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">{title}</h3>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{body}</p>
        <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-[15px] text-ink-2"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft"><Check className="size-3 text-accent" /></span>{b}</li>
          ))}
        </ul>
        <Link href={href} className="mt-8 inline-flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-5 text-sm font-semibold transition hover:border-accent hover:text-accent">{cta} <ArrowRight className="size-4" /></Link>
      </div>
      <div className={`reveal ${flip ? "lg:order-1" : ""}`}>{visual}</div>
    </InView>
  );
}

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(siteJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How to edit a PDF online",
        description: `Upload your PDF to ${brand.name}, edit, sign or convert it in your browser, then download the updated file.`,
        totalTime: "PT2M",
        estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
        step: [
          { "@type": "HowToStep", position: 1, name: "Upload your PDF file", text: `Drag your PDF onto the upload area or choose it from your device. ${cloudToolsEnabled ? "Word, Excel and images work too." : "Images work too."}` },
          { "@type": "HowToStep", position: 2, name: "Edit, customise, sign, merge and more", text: "Double-click text to change it, highlight, add signatures, reorder pages, with undo for everything." },
          { "@type": "HowToStep", position: 3, name: "Download the updated file", text: "Click Save changes, rename the file if you like, and download it." },
        ],
      })} />
      <AppHome />
      <div className="web-only contents">
      {/* ───────────── Hero — exactly one screen tall, ticker pinned to the bottom */}
      <section className="relative -mt-16 flex flex-col overflow-hidden pt-16 lg:h-[calc(100svh-1px)] lg:min-h-[704px]">
        <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_30%_30%,black,transparent_70%)]" aria-hidden />
        <div className="wrap relative grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:py-6">
          {/* Left: message */}
          <div>
            <h1 className="font-display text-[44px] leading-[0.95] tracking-tight sm:text-7xl xl:text-[84px] 2xl:text-[96px]">
              Free online <span className="relative whitespace-nowrap text-accent"><em>PDF editor</em><svg viewBox="0 0 200 20" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-[0.22em] w-full" aria-hidden><path d="M4 14 C 50 4, 120 4, 196 12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".5" /></svg></span> for every document.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 xl:text-xl">
              Everything you need to work with PDFs: edit text, sign, convert, compress, organise and protect documents right in your browser, in seconds.
            </p>
            <ul className="mt-6 hidden max-w-xl gap-2.5 text-[15px] text-ink-2 sm:grid sm:grid-cols-2">
              {["Edit existing text by double-click", cloudToolsEnabled ? "PDF ⇄ Word, Excel, images" : "PDF to Word and images", "Sign, redact and annotate", "Files stay on your device"].map((x) => (
                <li key={x} className="flex items-center gap-2.5"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft"><Check className="size-3 text-accent" /></span>{x}</li>
              ))}
            </ul>
            <div className="mt-7 hidden flex-wrap items-center gap-2 text-sm lg:flex">
              <span className="font-medium text-ink-2">Popular:</span>
              {[["Edit PDF", "/edit-pdf"], ["PDF to Word", "/pdf-to-word"], ["Merge", "/merge-pdf"], ["Compress", "/compress-pdf"], ["Sign", "/sign-pdf"]].map(([l, h]) => (
                <Link key={h} href={h} className="rounded-full border border-border bg-surface/80 px-3 py-1 font-medium text-ink-2 transition hover:border-accent hover:text-accent">{l}</Link>
              ))}
            </div>
          </div>

          {/* Right: upload, framed as a stack of documents */}
          <div className="relative mx-auto w-full max-w-[640px]">
            <div className="paper float-b absolute inset-0 hidden rounded-3xl shadow-md sm:block" style={{ ["--r" as string]: "5deg" }} aria-hidden />
            <div className="paper float-a absolute inset-0 hidden rounded-3xl shadow-md sm:block" style={{ ["--r" as string]: "-3.5deg", animationDelay: "-2s" }} aria-hidden />
            <div className="relative rounded-3xl border border-border bg-surface p-4 shadow-[0_30px_60px_-20px_rgb(0_0_0/.25)] sm:p-5">
              <HeroUpload />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm lg:hidden">
              {[["Edit PDF", "/edit-pdf"], ["PDF to Word", "/pdf-to-word"], ["Merge", "/merge-pdf"], ["Compress", "/compress-pdf"], ["Sign", "/sign-pdf"]].map(([l, h]) => (
                <Link key={h} href={h} className="rounded-full border border-border bg-surface/80 px-3 py-1 font-medium text-ink-2">{l}</Link>
              ))}
            </div>
            <div className="float-a absolute -top-8 -left-8 hidden w-16 sm:block" style={{ ["--r" as string]: "-12deg" }} aria-hidden><FileIcon type="PDF" /></div>
            <div className="float-b absolute top-1/3 -right-9 hidden w-14 sm:block" style={{ ["--r" as string]: "10deg", animationDelay: "-1s" }} aria-hidden><FileIcon type="DOCX" /></div>
            <div className="float-a absolute bottom-[18%] -left-10 hidden w-14 sm:block" style={{ ["--r" as string]: "8deg", animationDelay: "-3s" }} aria-hidden><FileIcon type="JPG" /></div>
            <div className="float-b absolute -right-5 -bottom-9 hidden w-14 sm:block" style={{ ["--r" as string]: "-9deg", animationDelay: "-4s" }} aria-hidden><FileIcon type="XLSX" /></div>
          </div>
        </div>

        {/* Ticker — part of the first screen */}
        <nav className="relative overflow-hidden border-t border-border bg-surface/90 py-4 backdrop-blur" aria-label="Popular PDF tools">
          <div className="marquee flex w-max gap-10 pr-10 hover:[animation-play-state:paused]">
            <div className="flex shrink-0 items-center gap-10">
              {formats.map(([label, href, icon]) => (
                <Link key={href} href={href} className={tickerItem}>
                  <FileIcon type={icon} className="w-6" /> {label}
                </Link>
              ))}
            </div>
            <MarqueeClone className="flex shrink-0 items-center gap-10">
              {formats.map(([label, href, icon]) => (
                <span key={href} data-href={href} className={`${tickerItem} cursor-pointer`}>
                  <FileIcon type={icon} className="w-6" /> {label}
                </span>
              ))}
            </MarqueeClone>
          </div>
        </nav>
      </section>

      {/* ───────────── Simple steps */}
      <section className="bg-bg py-24">
        <div className="wrap">
          <Heading eyebrow="How to edit a PDF online" title="Simple steps to get started" />
          <InView as="ol" className="grid items-start gap-10 lg:grid-cols-[1fr_110px_1fr_110px_1fr] lg:gap-4">
            {[
              { n: 1, art: <StepUpload />, t: "Upload your PDF file", d: cloudToolsEnabled ? "Drag it in or pick it from your device. Word, Excel and images work too." : "Drag it in or pick it from your device. Images work too." },
              { n: 2, art: <StepEdit />, t: "Edit, customise, sign, merge and more", d: "Change text, highlight, add signatures, reorder pages, with undo for everything." },
              { n: 3, art: <StepDownload />, t: "Download the updated file", d: "Rename it and download, or keep working with another tool." },
            ].flatMap((s, i) => [
              <li key={s.n} className="reveal flex flex-col items-center text-center" style={{ transitionDelay: `${i * 140}ms` }}>
                <div className="relative w-full max-w-[300px]">
                  <span className="absolute top-6 -left-2 font-display text-7xl leading-none text-ink">{s.n}</span>
                  <div className="pl-10">{s.art}</div>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{s.t}</h3>
                <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-ink-2">{s.d}</p>
              </li>,
              ...(i < 2 ? [<li key={`a${i}`} className="hidden pt-24 lg:block" aria-hidden><SquiggleArrow loop={i === 1} /></li>] : []),
            ])}
          </InView>
        </div>
      </section>

      {/* ───────────── Live demo */}
      <section id="demo" className="relative overflow-hidden border-y border-border bg-surface-2/70 py-24">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="wrap relative">
          <Heading eyebrow="See it in action" title={<>See the online PDF editor <em className="text-accent">in action</em></>} intro="Watch the editor change text, highlight, sign, redact and more. Then open the same document and try it yourself." />
          <div className="mx-auto max-w-6xl"><LiveDemo /></div>
        </div>
      </section>

      {/* ───────────── Tools */}
      <section id="tools" className="py-24">
        <div className="wrap">
          <Heading eyebrow="PDF tools" title="All the PDF tools you need, in one place" intro="Pick what you need. Each tool explains itself, and they all share the same upload, editor and download." />
          <ToolGrid />
        </div>
      </section>

      {/* ───────────── Why (illustrated, same language as the steps) */}
      <section className="relative overflow-hidden border-y border-border bg-surface-2/60 py-24">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="wrap relative">
          <Heading eyebrow={`Why ${brand.name}`} title={`Why choose ${brand.name}'s free PDF editor`} intro="Fast to start, private by default, and the files you download are real, well-made PDFs." />
          <InView as="ul" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { art: <WhyInstant />, t: "Works immediately", d: "No install, no trial, and no sign-up for most tools. Drop a file and you're editing in seconds.", tag: "Instant" },
              { art: <WhyPrivate />, t: "Private by design", d: "Editing and most conversions run on your device. Cloud tools delete files automatically.", tag: "Private" },
              { art: <WhyRealPdf />, t: "Real PDF output", d: "Text stays text and vectors stay vectors. Exports open in any PDF reader.", tag: "Quality" },
              { art: <WhyBigFiles />, t: "Built for big files", d: "Pages render lazily, so 500-page documents stay smooth.", tag: "Performance" },
            ].map((w, i) => (
              <li key={w.t} className="reveal group flex flex-col rounded-3xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-lg" style={{ transitionDelay: `${i * 110}ms` }}>
                <div className="relative mb-6 rounded-2xl bg-surface-2/70 px-4 py-6 transition-transform duration-300 group-hover:-translate-y-1">{w.art}</div>
                <span className="mb-2 text-[12px] font-semibold tracking-[0.12em] text-accent uppercase">{w.tag}</span>
                <h3 className="text-xl font-semibold tracking-tight">{w.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{w.d}</p>
              </li>
            ))}
          </InView>
        </div>
      </section>

      {/* ───────────── Feature tour */}
      <section className="py-16">
        <div className="wrap">
          <div className="pt-8"><Heading eyebrow="Features" title="Everything you need to work with PDFs" intro={`One editor for changing text, converting formats, annotating, signing${cloudToolsEnabled ? ", OCR" : ""} and organising pages.`} /></div>
          <Feature eyebrow="Edit" title="Edit PDF text directly, not just on top." body="Double-click any sentence to edit the original text in place. Add new text with full typographic control, cover content with whiteout, insert images and shapes, with undo for your last 100 steps." bullets={["Edit existing text", "Fonts, sizes, colours", "Whiteout and replace", "Images, shapes, links"]} href="/edit-pdf" cta="Open the editor" visual={<LiveDemo only="edit" />} />
          <Feature flip eyebrow="Convert" title={cloudToolsEnabled ? "Convert PDF to Word, Excel and images in seconds." : "Convert PDF to Word and images in seconds."} body={cloudToolsEnabled ? "Turn PDFs into Word, Excel, PowerPoint, images and text. PDF to Word runs right in your browser with live progress. Office files and images become clean PDFs." : "Turn PDFs into Word, images and text, and images into PDFs, right in your browser with live progress."} bullets={cloudToolsEnabled ? ["PDF ⇄ Word", "PDF → Excel and PowerPoint", "PDF ⇄ JPG / PNG", "Office → PDF"] : ["PDF → Word", "PDF → text", "PDF ⇄ JPG / PNG"]} href="/pdf-to-word" cta="Convert a PDF" visual={<LiveDemo only="convert" />} />
          <Feature eyebrow="Annotate" title="Annotate and highlight PDFs like paper." body="Highlight passages, draw freehand, add arrows and clouds, drop sticky-note comments and approval stamps. Comments are saved as real PDF annotations." bullets={["Highlight, underline, strike", "Pen, shapes and arrows", "Sticky-note comments", "Stamps, checks and crosses"]} href="/annotate-pdf" cta="Annotate a PDF" visual={<LiveDemo only="annotate" />} />
          <Feature flip eyebrow="Sign" title="Sign PDFs online from any device." body="Type your name in a handwriting style, draw with a mouse, pen or finger, or upload an image of your signature. Reuse it across the document." bullets={["Typed, drawn or uploaded", "Resize and rotate", "Date and initials fields", "Never stored without consent"]} href="/sign-pdf" cta="Sign a PDF" visual={<LiveDemo only="sign" />} />
          {cloudToolsEnabled && <Feature eyebrow="OCR" title="Make scanned PDFs searchable with OCR." body="We detect image-only PDFs and offer to recognise their text. The result looks identical, but every word can be searched, selected and copied." bullets={["Automatic scan detection", "100+ languages", "Searchable text layer", "Deskew and rotate"]} href="/ocr-pdf" cta="Run OCR" visual={<LiveDemo only="ocr" />} />}
          <Feature flip eyebrow="Organise" title="Merge, split and organise PDF pages." body="Drag thumbnails to reorder, rotate crooked scans, delete pages, insert blanks or pages from other files, and split documents apart." bullets={["Drag-and-drop pages", "Merge and split", "Rotate and duplicate", "Page numbers and headers"]} href="/rearrange-pdf-pages" cta="Organise pages" visual={<LiveDemo only="organise" />} />
        </div>
      </section>

      {/* ───────────── Security (dark band, illustrated like the steps) */}
      <section className="dark relative overflow-hidden bg-bg text-ink">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <div className="pointer-events-none absolute -top-48 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" aria-hidden />
        <div className="wrap relative py-24">
          <Heading eyebrow="Secure PDF editor" title="Your documents are yours. Full stop." intro="Most work never touches a server. The work that does is short-lived, isolated and encrypted." />
          <div className="mx-auto -mt-4 mb-14 grid max-w-3xl grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface/60 backdrop-blur">
            {[["0", "sign-ups needed"], [`${JOB_TTL_MINUTES} min`, "max file lifetime"], ["AES-256", "PDF protection"]].map(([v, l]) => (
              <div key={l} className="px-4 py-5 text-center">
                <p className="font-display text-3xl sm:text-4xl">{v}</p>
                <p className="mt-1 text-[13px] font-medium text-ink-2">{l}</p>
              </div>
            ))}
          </div>
          <InView as="ul" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { art: <SecLocal />, t: "Local-first editing", d: "Editing, signing, PDF → Word, compression and protect/unlock run in your browser.", tag: "On device" },
              { art: <SecDelete />, t: "Automatic deletion", d: `Cloud jobs are deleted after processing, and at most ${JOB_TTL_MINUTES} minutes after upload.`, tag: "Short-lived" },
              { art: <SecEncrypted />, t: "Encrypted everywhere", d: "TLS in transit and private storage reachable only by short-lived signed links.", tag: "Encrypted" },
              { art: <SecNoTraining />, t: "Never used for training", d: "No document content is logged, analysed or used to train models.", tag: "Yours only" },
            ].map((w, i) => (
              <li key={w.t} className="reveal group flex flex-col rounded-3xl border border-border bg-surface p-6 transition-shadow hover:shadow-lg" style={{ transitionDelay: `${i * 110}ms` }}>
                <div className="relative mb-6 rounded-2xl bg-surface-2 px-4 py-6 transition-transform duration-300 group-hover:-translate-y-1">{w.art}</div>
                <span className="mb-2 text-[12px] font-semibold tracking-[0.12em] text-accent uppercase">{w.tag}</span>
                <h3 className="text-xl font-semibold tracking-tight">{w.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{w.d}</p>
              </li>
            ))}
          </InView>
          <p className="mt-12 text-center">
            <Link href="/privacy" className="inline-flex h-11 items-center gap-2 rounded-lg border border-border-strong bg-surface px-5 text-sm font-semibold transition hover:border-accent hover:text-accent">Read how we handle files <ArrowRight className="size-4" /></Link>
          </p>
        </div>
      </section>

      {/* ───────────── Use cases */}
      <section className="py-24">
        <div className="wrap">
          <Heading eyebrow="Use cases" title="A PDF editor for students, businesses and teams" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map(({ icon: Icon, t, d, c }) => (
              <div key={t} className="paper rounded-xl p-6 transition hover:-translate-y-1 hover:shadow-lg">
                <span className="mb-4 flex size-11 items-center justify-center rounded-xl text-white" style={{ background: c }}><Icon className="size-5" /></span>
                <h3 className="text-lg font-semibold">{t}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Compare + FAQ */}
      <section className="border-t border-border bg-surface-2/60 py-24">
        <div className="wrap grid gap-16 lg:grid-cols-2">
          <div>
            <Heading center={false} eyebrow="At a glance" title={`What ${brand.name} does today`} intro="Every tool here is live and free. Here's where each one runs and what needs an account." />
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left">
                  <tr><th className="px-5 py-3.5 font-medium text-ink-3">Feature</th><th className="px-5 py-3.5 text-right font-semibold text-accent">{brand.name}</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {facts.map(([feature, detail, v]) => (
                    <tr key={feature}>
                      <td className="px-5 py-3.5">
                        <span className="block font-medium text-ink">{feature}</span>
                        <span className="mt-0.5 block text-[13px] text-ink-3">{detail}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {v === true
                          ? <span className="ml-auto flex size-6 items-center justify-center rounded-full bg-accent-soft"><Check className="size-3.5 text-accent" aria-label="Yes" /></span>
                          : <span className="font-semibold text-ink-2">{v}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <Heading center={false} eyebrow="FAQ" title="Online PDF editor FAQs" />
            <Faq items={faq} />
          </div>
        </div>
      </section>

      {/* ───────────── Final CTA */}
      <section className="wrap py-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-accent px-6 py-20 text-center text-accent-ink sm:px-16">
          <div className="pointer-events-none absolute inset-0 opacity-[.12] [background-image:radial-gradient(currentColor_1px,transparent_1.2px)] [background-size:20px_20px]" aria-hidden />
          <div className="float-a absolute top-10 left-[6%] hidden w-16 md:block" style={{ ["--r" as string]: "-12deg" }} aria-hidden><FileIcon type="PDF" /></div>
          <div className="float-b absolute bottom-10 left-[14%] hidden w-14 md:block" style={{ ["--r" as string]: "10deg" }} aria-hidden><FileIcon type="DOCX" /></div>
          <div className="float-a absolute top-12 right-[8%] hidden w-14 md:block" style={{ ["--r" as string]: "12deg", animationDelay: "-2s" }} aria-hidden><FileIcon type="XLSX" /></div>
          <div className="float-b absolute right-[15%] bottom-12 hidden w-16 md:block" style={{ ["--r" as string]: "-8deg", animationDelay: "-3s" }} aria-hidden><FileIcon type="JPG" /></div>
          <h2 className="relative font-display text-5xl leading-tight sm:text-6xl">Your next document is one drop away.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg opacity-85">Open the editor and start working. Free, no install, no catch.</p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/editor" className="inline-flex h-12 items-center gap-2 rounded-full bg-accent-ink px-7 font-semibold text-accent shadow-lg transition hover:opacity-90">Open the editor <ArrowRight className="size-4" /></Link>
            <Link href="#tools" className="inline-flex h-12 items-center rounded-full border border-current/30 px-7 font-semibold transition hover:bg-white/10">Browse all tools</Link>
          </div>
          <ul className="relative mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm opacity-85">
            <li className="flex items-center gap-1.5"><UserX className="size-4" /> Most tools need no account</li>
            <li className="flex items-center gap-1.5"><Zap className="size-4" /> Runs in your browser</li>
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Private by default</li>
          </ul>
        </div>
      </section>
      </div>
    </>
  );
}
