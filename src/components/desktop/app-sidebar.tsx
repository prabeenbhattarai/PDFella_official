"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Home, PenLine, Search } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { ToolIcon } from "@/components/ui/tool-icon";
import { AccountButton } from "@/components/auth/account-button";
import { categories, getTool, tools, toolsIn, type ToolCategory } from "@/lib/tools";
import { rememberTool } from "@/lib/desktop-app";
import { cn } from "@/lib/utils";

const ORDER: ToolCategory[] = ["edit", "organise", "convert", "optimise", "security", "forms"];

const row = "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors";
const rowIdle = "text-ink-2 hover:bg-surface-2 hover:text-ink";
const rowOn = "bg-accent-soft text-accent";

function NavLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(row, active ? rowOn : rowIdle)}>
      {icon}<span className="truncate">{label}</span>
    </Link>
  );
}

/** The desktop app's navigation: every tool, grouped and searchable. Rendered in place of the site header. */
export function AppSidebar() {
  const pathname = usePathname();
  const current = getTool(pathname.replace(/^\/|\/$/g, ""));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<ToolCategory>>(() => new Set([current?.category ?? "edit"]));

  useEffect(() => {
    if (!current) return;
    rememberTool(current.slug);
    setOpen((o) => (o.has(current.category) ? o : new Set(o).add(current.category)));
  }, [current]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tools.filter((t) => `${t.name} ${t.blurb}`.toLowerCase().includes(q)).slice(0, 12) : null;
  }, [query]);

  const toggle = (c: ToolCategory) => setOpen((o) => { const n = new Set(o); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const toolLink = (slug: string) => {
    const t = getTool(slug)!;
    return (
      <NavLink key={t.slug} href={`/${t.slug}`} active={current?.slug === t.slug} label={t.name}
        icon={<ToolIcon name={t.icon} className="size-4 shrink-0" />} />
    );
  };

  return (
    <aside className="app-only fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface" aria-label="App navigation">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/" aria-label="Home"><Logo size="sm" /></Link>
      </div>

      <div className="px-3 pb-2">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-bg px-2.5 text-ink-3 focus-within:border-accent">
          <Search className="size-4 shrink-0" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            placeholder="Search tools" aria-label="Search tools" className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" />
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {results ? (
          <div className="space-y-0.5 pt-1">
            {results.length ? results.map((t) => toolLink(t.slug)) : <p className="px-2.5 py-2 text-[13px] text-ink-3">No tools match &ldquo;{query}&rdquo;</p>}
          </div>
        ) : (
          <>
            <div className="space-y-0.5 pt-1">
              <NavLink href="/" label="Home" active={pathname === "/"} icon={<Home className="size-4 shrink-0" />} />
              <NavLink href="/editor" label="Open editor" active={pathname.startsWith("/editor")} icon={<PenLine className="size-4 shrink-0" />} />
            </div>
            <p className="px-2.5 pt-5 pb-1.5 text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase">Tools</p>
            {ORDER.map((c) => {
              const expanded = open.has(c);
              return (
                <div key={c} className="mb-0.5">
                  <button type="button" onClick={() => toggle(c)} aria-expanded={expanded} className={cn(row, rowIdle, "text-ink")}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--cat-${c})` }} aria-hidden />
                    <span className="flex-1 truncate text-left">{categories[c].name}</span>
                    <ChevronRight className={cn("size-3.5 shrink-0 text-ink-3 transition-transform", expanded && "rotate-90")} aria-hidden />
                  </button>
                  {expanded && <div className="mt-0.5 ml-3 space-y-0.5 border-l border-border pl-1.5">{toolsIn(c).map((t) => toolLink(t.slug))}</div>}
                </div>
              );
            })}
          </>
        )}
      </nav>

      <div className="flex shrink-0 items-center gap-1 border-t border-border p-2.5">
        <AccountButton signInClassName="inline-flex flex-1 justify-start" menuAbove compact />
        <span className="flex-1" />
        <Link href="/download" aria-label="Desktop app" title="Desktop app" className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><Download className="size-4" /></Link>
        <ThemeToggle />
      </div>
    </aside>
  );
}
