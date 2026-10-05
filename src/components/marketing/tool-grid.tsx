"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Laptop, Cloud } from "lucide-react";
import { ToolIcon } from "@/components/ui/tool-icon";
import { categories, tools, toolsIn, type ToolCategory, type Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";

const order: ToolCategory[] = ["edit", "organise", "convert", "optimise", "security", "forms"];
export const catColor = (c: ToolCategory) => `var(--cat-${c})`;

/** A tool as a small document: folded corner, category colour, clear description. */
export function ToolCard({ t }: { t: Tool }) {
  const color = catColor(t.category);
  return (
    <Link href={`/${t.slug}`} className="paper group flex h-full flex-col rounded-xl p-5 transition duration-200 hover:-translate-y-1 hover:shadow-lg" style={{ ["--c" as string]: color }}>
      <span className="mb-4 flex size-11 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-105" style={{ background: color }}>
        <ToolIcon name={t.icon} className="size-5" />
      </span>
      <h3 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
        {t.name}
        <ArrowUpRight className="size-4 -translate-x-1 text-ink-3 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
      </h3>
      <span className="mt-1.5 flex-1 text-[14px] leading-relaxed text-ink-2">{t.blurb}</span>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3">
        {t.engine === "browser" ? <><Laptop className="size-3" /> In your browser</> : <><Cloud className="size-3" /> Secure cloud</>}
      </span>
    </Link>
  );
}

export function ToolGrid() {
  const [cat, setCat] = useState<ToolCategory | "all">("all");
  const list = cat === "all" ? order.flatMap((c) => toolsIn(c)) : toolsIn(cat);
  return (
    <div>
      <div className="mb-8 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Tool categories">
        {(["all", ...order] as const).map((c) => {
          const active = cat === c;
          const count = c === "all" ? tools.length : toolsIn(c).length;
          return (
            <button key={c} role="tab" aria-selected={active} onClick={() => setCat(c)}
              className={cn("flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition", active ? "border-transparent bg-ink text-bg shadow-md" : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink")}>
              {c !== "all" && <span className="size-2 rounded-full" style={{ background: catColor(c) }} />}
              {c === "all" ? "All tools" : categories[c].name}
              <span className={cn("text-xs", active ? "text-bg/60" : "text-ink-3")}>{count}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5" role="tabpanel">
        {list.map((t) => <ToolCard key={t.slug} t={t} />)}
      </div>
    </div>
  );
}
