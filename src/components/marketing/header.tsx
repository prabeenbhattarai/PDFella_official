"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { ToolIcon } from "@/components/ui/tool-icon";
import { categories, getTool, tools, toolsIn, editorHref, type Tool, type ToolCategory } from "@/lib/tools";
import { cn } from "@/lib/utils";

const order: ToolCategory[] = ["edit", "organise", "convert", "optimise", "security", "forms"];
const pick = (slugs: string[]) => slugs.map(getTool).filter(Boolean) as Tool[];

const MENUS: { id: string; label: string; columns: { title: string; items: Tool[] }[] }[] = [
  { id: "edit", label: "Edit", columns: [{ title: "Edit & sign", items: pick(["edit-pdf", "add-text-to-pdf", "sign-pdf", "annotate-pdf", "highlight-pdf", "fill-pdf"]) }] },
  {
    id: "convert", label: "Convert", columns: [
      { title: "From PDF", items: pick(["pdf-to-word", "pdf-to-excel", "pdf-to-powerpoint", "pdf-to-jpg", "pdf-to-text"]) },
      { title: "To PDF", items: pick(["word-to-pdf", "excel-to-pdf", "powerpoint-to-pdf", "jpg-to-pdf", "png-to-pdf"]) },
    ],
  },
  { id: "organise", label: "Organise", columns: [{ title: "Pages & files", items: pick(["merge-pdf", "split-pdf", "compress-pdf", "rearrange-pdf-pages", "rotate-pdf", "add-page-numbers-to-pdf"]) }] },
  { id: "security", label: "Security", columns: [{ title: "Protect documents", items: pick(["protect-pdf", "unlock-pdf", "redact-pdf", "watermark-pdf", "ocr-pdf"]) }] },
];

function MenuItem({ t, onNavigate }: { t: Tool; onNavigate: () => void }) {
  return (
    <Link href={`/${t.slug}`} onClick={onNavigate} className="group flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-surface-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, var(--cat-${t.category}) 12%, transparent)`, color: `var(--cat-${t.category})` }}>
        <ToolIcon name={t.icon} className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink">{t.name}</span>
        <span className="block text-[13px] leading-snug text-ink-3">{t.blurb}</span>
      </span>
    </Link>
  );
}

/** Desktop dropdown: opens on hover (with a short intent delay), on click and with the keyboard. */
function NavMenu({ label, active, open, onOpen, onClose, children, wide }: { label: string; active?: boolean; open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const enter = () => { clearTimeout(timer.current); timer.current = setTimeout(onOpen, 60); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(onClose, 160); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        className={cn("relative flex h-16 items-center gap-1.5 px-4 text-[15px] font-semibold transition-colors", open || active ? "text-accent" : "text-ink hover:text-accent")}
        aria-expanded={open}
        aria-haspopup="true"
        // A click always opens. It never toggles shut, so "hover, then click" keeps the menu open.
        onClick={() => { clearTimeout(timer.current); onOpen(); }}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        {label}
        <ChevronDown className={cn("size-4 opacity-70 transition-transform", open && "rotate-180")} aria-hidden />
        <span className={cn("absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent transition-opacity", open || active ? "opacity-100" : "opacity-0")} aria-hidden />
      </button>
      {open && (
        <div className={cn(wide ? "fixed top-16 left-1/2 -translate-x-1/2 pt-px" : "absolute top-full left-1/2 -translate-x-1/2 pt-px")} onMouseEnter={() => clearTimeout(timer.current)} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
          <div className="rounded-xl border border-border bg-surface p-2 shadow-[0_24px_48px_-12px_rgb(0_0_0/.18),0_2px_6px_rgb(0_0_0/.04)] animate-pop">{children}</div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const close = () => setMenu(null);
  /** Close only if this menu is the one open, so leaving one menu never closes the next. */
  const closeIf = (id: string) => () => setMenu((m) => (m === id ? null : m));
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => { if (!navRef.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const current = getTool(pathname.replace(/^\//, ""));

  useEffect(() => { setMenu(null); setMobile(false); }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/85 backdrop-blur-xl">
      <div className="wrap grid h-16 grid-cols-[1fr_auto] items-center lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label="Home" className="justify-self-start"><Logo /></Link>

        <nav ref={navRef} className="hidden items-center lg:flex" aria-label="Main">
          <NavMenu label="Tools" open={menu === "tools"} onOpen={() => setMenu("tools")} onClose={closeIf("tools")} wide>
            <div className="grid w-[960px] grid-cols-3 gap-x-2 gap-y-1 p-2">
              {order.map((c) => (
                <div key={c} className="p-2">
                  <p className="mb-1.5 flex items-center gap-2 px-1 text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                    <span className="size-1.5 rounded-full" style={{ background: `var(--cat-${c})` }} /> {categories[c].name}
                  </p>
                  <ul>
                    {toolsIn(c).slice(0, 6).map((t) => (
                      <li key={t.slug}>
                        <Link href={`/${t.slug}`} onClick={close} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[14px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                          <ToolIcon name={t.icon} className="size-4 shrink-0" />
                          {t.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
              <p className="text-[13px] text-ink-2"><span className="font-semibold text-ink">{tools.length} tools</span> for editing, converting and securing documents.</p>
              <div className="flex items-center gap-5">
                <Link href="/pdf-converter" onClick={close} className="text-[13px] font-semibold text-ink-2 hover:text-ink">PDF converter</Link>
                <Link href="/#tools" onClick={close} className="flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">View all tools <ArrowRight className="size-3.5" /></Link>
              </div>
            </div>
          </NavMenu>

          {MENUS.map((m) => (
            <NavMenu key={m.id} label={m.label} open={menu === m.id} onOpen={() => setMenu(m.id)} onClose={closeIf(m.id)}
              active={!!current && m.columns.some((col) => col.items.some((t) => t.slug === current.slug))}>
              <div className={cn("grid gap-1", m.columns.length > 1 ? "w-[640px] grid-cols-2" : "w-[340px]")}>
                {m.columns.map((col) => (
                  <div key={col.title}>
                    <p className="px-2.5 pt-2 pb-1 text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{col.title}</p>
                    {col.items.map((t) => <MenuItem key={t.slug} t={t} onNavigate={close} />)}
                  </div>
                ))}
              </div>
            </NavMenu>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-2">
          <ThemeToggle />
          <Link href="/editor" className="hidden h-10 items-center gap-2 rounded-lg bg-ink px-4 text-[14px] font-semibold text-bg transition hover:opacity-90 sm:inline-flex">
            Open editor <ArrowRight className="size-4" />
          </Link>
          <button className="flex size-10 items-center justify-center rounded-lg border border-border lg:hidden" aria-label={mobile ? "Close menu" : "Open menu"} aria-expanded={mobile} onClick={() => setMobile(!mobile)}>
            {mobile ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile / tablet menu */}
      <div className={cn("border-t border-border bg-surface lg:hidden", mobile ? "block" : "hidden")}>
        <nav className="wrap max-h-[75vh] space-y-5 overflow-y-auto py-5" aria-label="Mobile">
          {order.map((c) => (
            <div key={c}>
              <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                <span className="size-1.5 rounded-full" style={{ background: `var(--cat-${c})` }} /> {categories[c].name}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {toolsIn(c).map((t) => (
                  <Link key={t.slug} href={t.workspace.type === "editor" ? editorHref(t) : `/${t.slug}`} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[14px] font-medium text-ink-2 hover:bg-surface-2">
                    <ToolIcon name={t.icon} className="size-4 shrink-0" /> {t.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <Link href="/editor" className="flex h-11 items-center justify-center gap-2 rounded-lg bg-ink text-[15px] font-semibold text-bg sm:hidden">Open editor <ArrowRight className="size-4" /></Link>
        </nav>
      </div>
    </header>
  );
}
