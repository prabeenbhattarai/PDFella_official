"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HeroUpload } from "@/components/marketing/hero-upload";
import { ToolIcon } from "@/components/ui/tool-icon";
import { useAuth } from "@/lib/auth/store";
import { recentTools } from "@/lib/desktop-app";
import { categories, getTool, toolsIn, type Tool, type ToolCategory } from "@/lib/tools";

const QUICK = ["edit-pdf", "merge-pdf", "compress-pdf", "pdf-to-word", "sign-pdf", "jpg-to-pdf"];
const ORDER: ToolCategory[] = ["edit", "organise", "convert", "optimise", "security", "forms"];
const pick = (slugs: string[]) => slugs.map(getTool).filter(Boolean) as Tool[];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Tile({ t }: { t: Tool }) {
  return (
    <Link href={`/${t.slug}`} className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition hover:border-border-strong hover:shadow-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, var(--cat-${t.category}) 12%, transparent)`, color: `var(--cat-${t.category})` }}>
        <ToolIcon name={t.icon} className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold text-ink">{t.name}</span>
        <span className="block truncate text-[12.5px] text-ink-3">{t.blurb}</span>
      </span>
    </Link>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-[13px] font-semibold text-ink-2">{children}</h2>;
}

/** The desktop app's start screen, shown on / in place of the landing page. */
export function AppHome() {
  const name = useAuth((s) => s.user?.name?.split(" ")[0]);
  const [hello, setHello] = useState("Welcome");
  const [recent, setRecent] = useState<Tool[]>([]);
  // The upload box is only built inside the app: on the website the landing page has its own,
  // and a second (hidden) one would sit in the page twice.
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setHello(greeting());
    setRecent(pick(recentTools()));
    setInApp(document.documentElement.dataset.app === "desktop");
  }, []);

  return (
    <div className="app-only mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-[26px] font-semibold tracking-tight">{hello}{name ? `, ${name}` : ""}</h1>
      <p className="mt-1 text-[15px] text-ink-3">Open a document to edit it, or pick a tool.</p>

      <div className="mt-6">{inApp ? <HeroUpload size="default" /> : <div className="h-[268px] rounded-2xl border-2 border-dashed border-border-strong" aria-hidden />}</div>

      <section className="mt-9">
        <Heading>{recent.length ? "Recently used" : "Popular tools"}</Heading>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{(recent.length ? recent : pick(QUICK)).map((t) => <Tile key={t.slug} t={t} />)}</div>
      </section>

      {ORDER.map((c) => (
        <section key={c} className="mt-9">
          <Heading>{categories[c].name}</Heading>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{toolsIn(c).map((t) => <Tile key={t.slug} t={t} />)}</div>
        </section>
      ))}
    </div>
  );
}
