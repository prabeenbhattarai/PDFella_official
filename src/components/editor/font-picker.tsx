"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, FileText, Search } from "lucide-react";
import type { TextStyle } from "@/lib/editor/model";
import { useEditor } from "@/lib/editor/store";
import { CATALOG, CATEGORY_LABELS, type FontCategory } from "@/lib/fonts/catalog";
import { ensureFont, fontStack, isOriginal, parseOriginal } from "@/lib/fonts/loader";
import { cn } from "@/lib/utils";

interface Option { id: string; label: string; hint?: string; fallback?: string; group: string }

/** Fonts embedded in the open PDF that edits have picked up so far. */
function useDocumentFonts(): Option[] {
  const objects = useEditor((s) => s.objects);
  return useMemo(() => {
    const seen = new Map<string, Option>();
    for (const o of Object.values(objects).flat()) {
      if (o.kind !== "textEdit" || !o.originalStyle || !isOriginal(o.originalStyle.font)) continue;
      const asset = parseOriginal(o.originalStyle.font).asset;
      if (!seen.has(asset)) seen.set(asset, { id: o.originalStyle.font, label: o.fontMatch?.name ?? "Original font", hint: "from this PDF", fallback: o.originalStyle.fontFallback, group: "In this document" });
    }
    return [...seen.values()];
  }, [objects]);
}

const sameFont = (a: string, b: string) => (isOriginal(a) && isOriginal(b) ? parseOriginal(a).asset === parseOriginal(b).asset : a === b);

function Item({ o, selected, active, onPick, onHover }: { o: Option; selected: boolean; active: boolean; onPick: () => void; onHover: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const assets = useEditor((s) => s.assets);
  // Load the face only once the row scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { void ensureFont(o.id, false, false, assets); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, [o.id, assets]);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: "nearest" }); }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      data-font={o.id}
      onClick={onPick}
      onMouseMove={onHover}
      className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left", active ? "bg-surface-2" : "hover:bg-surface-2")}
    >
      <span className="min-w-0 flex-1 truncate text-[16px] text-ink" style={{ fontFamily: fontStack({ font: o.id, fontFallback: o.fallback }) }}>{o.label}</span>
      {o.hint && <span className="shrink-0 text-[11px] text-ink-3">{o.hint}</span>}
      <Check className={cn("size-4 shrink-0 text-accent", !selected && "invisible")} />
    </button>
  );
}

export function FontPicker({ value, onChange }: { value: TextStyle; onChange: (p: Partial<TextStyle>) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number } | null>(null);
  const docFonts = useDocumentFonts();

  const options = useMemo<Option[]>(() => {
    const lib: Option[] = CATALOG.map((f) => ({ id: f.id, label: f.label, hint: f.like ? `like ${f.like}` : f.category === "builtin" ? "built-in" : undefined, group: CATEGORY_LABELS[f.category as FontCategory] }));
    const all = [...docFonts, ...lib];
    const n = q.trim().toLowerCase();
    return n ? all.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(n)) : all;
  }, [docFonts, q]);

  const current = [...docFonts, ...CATALOG.map((f) => ({ id: f.id, label: f.label }))].find((o) => sameFont(o.id, value.font));
  const label = current?.label ?? "Font";

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const width = Math.max(r.width, 300);
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const maxH = Math.min(420, Math.max(below, above));
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ left, width, maxH, top: below >= 260 || below >= above ? r.bottom + 6 : r.top - 6 - maxH });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => sameFont(o.id, value.font))));
    const onDown = (e: PointerEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (o: Option) => {
    onChange({ font: o.id, fontFallback: o.fallback });
    setOpen(false);
    setQ("");
    btn.current?.focus();
  };

  let lastGroup = "";
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label="Font"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-border-strong bg-surface px-2.5 text-left text-[14px] hover:border-ink-3 focus-visible:border-accent focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1 truncate" style={{ fontFamily: fontStack(value) }}>{label}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" />
      </button>
      {open && pos && createPortal(
        <div
          ref={pop}
          className="fixed z-[80] flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg animate-pop"
          style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && options[active]) { e.preventDefault(); pick(options[active]); }
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-ink-3" />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder={`Search ${CATALOG.length + docFonts.length} fonts`} aria-label="Search fonts" className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" />
          </div>
          <div role="listbox" aria-label="Fonts" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {options.length === 0 && <p className="px-2.5 py-6 text-center text-[13px] text-ink-3">No fonts match “{q}”.</p>}
            {options.map((o, i) => {
              const header = o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <div key={o.id}>
                  {header && (
                    <p className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                      {header === "In this document" && <FileText className="size-3.5" />}{header}
                    </p>
                  )}
                  <Item o={o} selected={sameFont(o.id, value.font)} active={i === active} onPick={() => pick(o)} onHover={() => setActive(i)} />
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
