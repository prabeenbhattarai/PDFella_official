import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight, Check, ChevronRight, Cloud, Laptop, AlertCircle, Lightbulb, Sparkles, Zap, ShieldCheck, Layers, Gauge, CalendarCheck,
} from "lucide-react";
import { tools, getTool, categories, type Tool } from "@/lib/tools";
import { getContent, CONTENT_UPDATED, type ToolContent } from "@/content/seo";
import { brand } from "@/lib/brand";
import { JOB_TTL_MINUTES } from "@/lib/limits";
import { jpegSize, jsonLdScript, keyFacts, shotPath, toolJsonLd } from "@/lib/seo";
import { ToolIcon } from "@/components/ui/tool-icon";
import { ToolCard } from "@/components/marketing/tool-grid";
import { Faq } from "@/components/marketing/faq";
import { InView } from "@/components/marketing/in-view";
import { ToolWorkspace } from "@/components/tools/workspace";

export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const t = getTool((await params).tool);
  const c = t && getContent(t.slug);
  if (!t || !c) return {};
  return {
    title: { absolute: c.metaTitle },
    description: c.metaDescription,
    keywords: [c.keyword, ...c.keywords],
    alternates: { canonical: `/${t.slug}` },
    openGraph: { type: "website", siteName: brand.name, title: c.metaTitle, description: c.metaDescription, url: `/${t.slug}`, locale: "en_US" },
    twitter: { card: "summary_large_image", title: c.metaTitle, description: c.metaDescription },
    other: { "article:modified_time": CONTENT_UPDATED },
  };
}

const BENEFIT_ICONS = [Zap, ShieldCheck, Layers, Gauge];
const updatedLabel = new Date(CONTENT_UPDATED).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Section({ id, eyebrow, title, children, className = "" }: { id?: string; eyebrow: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`py-20 ${className}`}>
      <div className="wrap">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="mb-3 inline-flex items-center gap-2 text-[13px] font-semibold tracking-[0.14em] text-accent uppercase"><span className="h-px w-6 bg-accent" />{eyebrow}<span className="h-px w-6 bg-accent" /></p>
          <h2 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

/** A screenshot from the real app, framed like a browser window. */
function Screenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_30px_60px_-24px_rgb(0_0_0/.28)]">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-4 py-2.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#ff6159]" /><span className="size-2.5 rounded-full bg-[#ffbd2e]" /><span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 h-5 flex-1 rounded-md bg-surface-3/70" />
      </div>
      <Image src={src} alt={alt} {...jpegSize(src)} sizes="(min-width: 1024px) 680px, 100vw" className="h-auto w-full" />
    </figure>
  );
}

function Tutorial({ t, c }: { t: Tool; c: ToolContent }) {
  return (
    <InView as="ol" threshold={0.05} className="mx-auto max-w-6xl space-y-16">
      {c.steps.map((s, i) => {
        const shot = s.shot ? shotPath(t.slug, s.shot) : null;
        const flip = i % 2 === 1;
        return (
            <li key={i} id={`step-${i + 1}`} className={`reveal grid scroll-mt-24 items-center gap-8 ${shot ? "lg:grid-cols-[0.85fr_1.15fr] lg:gap-14" : "mx-auto max-w-3xl"}`}>
              <div className={flip && shot ? "lg:order-2" : ""}>
                <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-accent font-display text-2xl text-accent-ink shadow-sm">{i + 1}</span>
                <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
                <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{s.body}</p>
              </div>
              {shot && <div className={flip ? "lg:order-1" : ""}><Screenshot src={shot} alt={`${c.howToTitle}: step ${i + 1}, ${s.title.toLowerCase()} in ${brand.name}`} /></div>}
            </li>
        );
      })}
    </InView>
  );
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const tool = getTool((await params).tool);
  const c = tool && getContent(tool.slug);
  if (!tool || !c) notFound();
  const related = tool.related.map(getTool).filter(Boolean) as Tool[];
  const facts = keyFacts(tool);

  return (
    <>
      {/* ───────────── Hero + live tool */}
      <section id="top" className="relative scroll-mt-16 overflow-hidden border-b border-border">
        <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_50%_20%,black,transparent_70%)]" aria-hidden />
        <div className="wrap relative pt-10 pb-16 text-center sm:pt-14">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center justify-center gap-1 text-[13px] font-medium text-ink-3">
            <Link href="/" className="hover:text-ink">Home</Link><ChevronRight className="size-3.5" />
            <Link href={`/#tools-${tool.category}`} className="hover:text-ink">{categories[tool.category].name}</Link><ChevronRight className="size-3.5" />
            <span className="text-ink-2" aria-current="page">{tool.name}</span>
          </nav>
          <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-md" style={{ background: `var(--cat-${tool.category})` }}><ToolIcon name={tool.icon} className="size-7" /></span>
          <h1 className="font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">{c.h1}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">{c.subtitle}</p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-ink-2">
            <li className="flex items-center gap-1.5">{tool.engine === "browser" ? <><Laptop className="size-4 text-accent" /> Runs in your browser</> : <><Cloud className="size-4 text-accent" /> Secure cloud · deleted within {JOB_TTL_MINUTES} min</>}</li>
            <li className="flex items-center gap-1.5"><Check className="size-4 text-accent" /> Free, no sign-up</li>
            <li className="flex items-center gap-1.5"><Check className="size-4 text-accent" /> No watermark</li>
          </ul>
          <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-border bg-surface p-4 text-left shadow-[0_30px_60px_-24px_rgb(0_0_0/.25)] sm:p-5">
            <Suspense fallback={<div className="h-60 rounded-2xl border-2 border-dashed border-border-strong bg-surface" />}>
              <ToolWorkspace tool={tool} />
            </Suspense>
          </div>
          {tool.limitation && (
            <p className="mx-auto mt-5 flex max-w-2xl items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-left text-sm text-ink-2"><AlertCircle className="mt-0.5 size-4 shrink-0 text-warn" />{tool.limitation}</p>
          )}
        </div>
      </section>

      {/* ───────────── Quick answer + key facts (AEO / GEO) */}
      <section className="border-b border-border bg-surface-2/60 py-16">
        <div className="wrap grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
          <div className="paper rounded-2xl p-7 sm:p-9">
            <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold tracking-[0.14em] text-accent uppercase"><Sparkles className="size-4" /> Quick answer</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{c.howToTitle}?</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{c.quickAnswer}</p>
            <p className="mt-6 flex items-center gap-2 text-[13px] font-medium text-ink-3"><CalendarCheck className="size-4" /> Updated {updatedLabel} by the {brand.name} team</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <p className="border-b border-border bg-surface-2 px-5 py-3 text-[13px] font-semibold tracking-[0.1em] text-ink-2 uppercase">Key facts</p>
            <dl className="divide-y divide-border">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[130px_1fr] gap-3 px-5 py-3 text-[15px]">
                  <dt className="font-medium text-ink-3">{k}</dt>
                  <dd className="font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ───────────── Step-by-step tutorial */}
      <Section id="how-to" eyebrow="Step by step" title={c.howToTitle}>
        <Tutorial t={tool} c={c} />
      </Section>

      {/* ───────────── Benefits */}
      <section className="relative overflow-hidden border-y border-border bg-surface-2/60 py-20">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="wrap relative">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="mb-3 text-[13px] font-semibold tracking-[0.14em] text-accent uppercase">Why {brand.name}</p>
            <h2 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">{tool.name}, done right</h2>
          </div>
          <InView as="ul" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {c.benefits.map((b, i) => {
              const Icon = BENEFIT_ICONS[i % BENEFIT_ICONS.length];
              return (
                <li key={b.title} className="reveal rounded-3xl border border-border bg-surface p-6" style={{ transitionDelay: `${i * 90}ms` }}>
                  <span className="mb-4 flex size-11 items-center justify-center rounded-xl text-white" style={{ background: `var(--cat-${tool.category})` }}><Icon className="size-5" /></span>
                  <h3 className="text-lg font-semibold tracking-tight">{b.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{b.body}</p>
                </li>
              );
            })}
          </InView>
        </div>
      </section>

      {/* ───────────── Guide content */}
      <section className="py-20">
        <div className="wrap grid gap-14 lg:grid-cols-[1fr_340px] lg:gap-16">
          <article className="max-w-3xl space-y-12">
            {c.sections.map((s) => (
              <div key={s.heading}>
                <h2 className="text-3xl font-semibold tracking-tight">{s.heading}</h2>
                <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-ink-2">{s.body.map((p, i) => <p key={i}>{p}</p>)}</div>
              </div>
            ))}
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Who uses {tool.name}?</h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-3">
                {c.useCases.map((u) => (
                  <li key={u.who} className="paper rounded-xl p-5">
                    <p className="font-semibold">{u.who}</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{u.what}</p>
                  </li>
                ))}
              </ul>
            </div>
          </article>
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-[#f5c400]/40 bg-[#fff8db] p-6 text-[#4a3b00] dark:border-[#f5c400]/25 dark:bg-[#2a2306] dark:text-[#f3e3a1]">
              <p className="mb-3 flex items-center gap-2 font-semibold"><Lightbulb className="size-4" /> Tips</p>
              <ul className="space-y-2.5 text-[15px] leading-relaxed">{c.tips.map((tip) => <li key={tip} className="flex gap-2"><span aria-hidden>•</span>{tip}</li>)}</ul>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6">
              <p className="font-semibold">Features</p>
              <ul className="mt-3 space-y-2">{tool.features.map((f) => <li key={f} className="flex items-start gap-2 text-[15px] text-ink-2"><Check className="mt-0.5 size-4 shrink-0 text-accent" />{f}</li>)}</ul>
            </div>
          </aside>
        </div>
      </section>

      {/* ───────────── FAQ */}
      <section className="border-t border-border bg-surface-2/60 py-20">
        <div className="wrap grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="mb-3 text-[13px] font-semibold tracking-[0.14em] text-accent uppercase">FAQ</p>
            <h2 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">{tool.name}: frequently asked questions</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">Still stuck? Email <a href={`mailto:${brand.supportEmail}`} className="font-medium text-accent hover:underline">{brand.supportEmail}</a>.</p>
          </div>
          <Faq items={c.faq} schema={false} />
        </div>
      </section>

      {/* ───────────── Related tools */}
      {related.length > 0 && (
        <section className="py-20">
          <div className="wrap">
            <h2 className="mb-8 text-center font-display text-4xl tracking-tight">Related tools</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{related.map((r) => <ToolCard key={r.slug} t={r} />)}</div>
          </div>
        </section>
      )}

      {/* ───────────── CTA */}
      <section className="wrap pb-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-accent px-6 py-16 text-center text-accent-ink sm:px-16">
          <div className="pointer-events-none absolute inset-0 opacity-[.12] [background-image:radial-gradient(currentColor_1px,transparent_1.2px)] [background-size:20px_20px]" aria-hidden />
          <h2 className="relative font-display text-4xl leading-tight sm:text-5xl">Ready to {c.howToTitle.replace(/^How to /, "")}?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-lg opacity-85">Free, private and done in seconds. No account needed.</p>
          <a href="#top" className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-accent-ink px-7 font-semibold text-accent shadow-lg transition hover:opacity-90">Start now <ArrowRight className="size-4" /></a>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(toolJsonLd(tool, c))} />
    </>
  );
}
