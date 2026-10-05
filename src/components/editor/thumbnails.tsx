"use client";

import { memo, useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, Copy, Trash2, FilePlus2, FileDown, FileInput, ImagePlus } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import type { PageRef } from "@/lib/editor/model";
import { displaySize } from "@/lib/editor/model";
import { renderThumbnail } from "@/lib/pdf/render";
import { exportDocument } from "@/lib/pdf/export";
import { extractPages } from "@/lib/pdf/ops";
import { insertFile } from "@/lib/editor/load";
import { downloadBlob, sanitizeFileName, cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { scrollToPage } from "./canvas";

const Thumb = memo(function Thumb({ page, width }: { page: PageRef; width: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = displaySize(page);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      renderThumbnail(page).then((u) => alive && setUrl(u)).catch(() => {});
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [page]);
  return (
    <div ref={ref} className="relative overflow-hidden bg-white" style={{ width, height: (width * h) / w }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-contain" draggable={false} />}
    </div>
  );
});

export function Thumbnails() {
  const pages = useEditor((s) => s.pages);
  const selected = useEditor((s) => s.selectedPages);
  const current = useEditor((s) => s.currentPage);
  const objects = useEditor((s) => s.objects);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const s = useEditor.getState;

  const targetIds = () => (selected.length ? selected : pages[current] ? [pages[current].id] : []);

  const click = (e: React.MouseEvent, p: PageRef, i: number) => {
    if (e.shiftKey && selected.length) {
      const last = pages.findIndex((x) => x.id === selected[selected.length - 1]);
      const [a, b] = [Math.min(last, i), Math.max(last, i)];
      s().setSelectedPages(pages.slice(a, b + 1).map((x) => x.id));
    } else if (e.metaKey || e.ctrlKey) {
      s().setSelectedPages(selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id]);
    } else {
      s().setSelectedPages([p.id]);
    }
    s().setCurrentPage(i);
    scrollToPage(i);
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const j = Math.max(0, Math.min(pages.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      if (e.altKey) { s().movePages([pages[i].id], e.key === "ArrowDown" ? j + 1 : j); }
      else { s().setSelectedPages([pages[j].id]); s().setCurrentPage(j); scrollToPage(j); }
      (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
    }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); s().deletePages(targetIds()); }
  };

  const extract = async () => {
    const ids = targetIds();
    const st = s();
    try {
      // Export with edits first, then extract the chosen pages.
      const bytes = await exportDocument({ docName: st.docName, sources: st.sources, pages: st.pages, objects: st.objects, assets: st.assets, formValues: st.formValues });
      const idx = ids.map((id) => st.pages.findIndex((p) => p.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
      const out = await extractPages(bytes, idx);
      downloadBlob(new Blob([out as BlobPart], { type: "application/pdf" }), sanitizeFileName(`${st.docName.replace(/\.pdf$/i, "")} (pages ${idx.map((i) => i + 1).join(", ")})`));
    } catch (e) {
      toast.error("Couldn't extract pages", (e as Error).message);
    }
  };

  const insert = async (files: FileList | null) => {
    if (!files) return;
    const at = current + 1;
    for (const f of Array.from(files)) {
      try {
        await insertFile({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }, at);
        toast.success(`Inserted ${f.name}`);
      } catch (e) {
        toast.error(`Couldn't insert ${f.name}`, (e as Error).message);
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-semibold text-ink-2">Pages <span className="font-normal text-ink-3">· {pages.length}</span></p>
        <div className="flex">
          <Button variant="ghost" size="icon-sm" title="Insert blank page" aria-label="Insert blank page" onClick={() => s().insertBlank(current + 1)}><FilePlus2 /></Button>
          <Button variant="ghost" size="icon-sm" title="Insert PDF or image pages" aria-label="Insert PDF or image pages" onClick={() => fileInput.current?.click()}><FileInput /></Button>
        </div>
        <input ref={fileInput} type="file" multiple accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { insert(e.target.files); e.target.value = ""; }} aria-label="Insert files" />
      </div>
      <div className="grid grid-cols-5 gap-0.5 border-b border-border px-2 py-1.5">
        <Button variant="ghost" size="icon-sm" title="Rotate left" aria-label="Rotate selected pages left" onClick={() => s().rotatePages(targetIds(), -90)}><RotateCcw /></Button>
        <Button variant="ghost" size="icon-sm" title="Rotate right" aria-label="Rotate selected pages right" onClick={() => s().rotatePages(targetIds(), 90)}><RotateCw /></Button>
        <Button variant="ghost" size="icon-sm" title="Duplicate" aria-label="Duplicate selected pages" onClick={() => s().duplicatePages(targetIds())}><Copy /></Button>
        <Button variant="ghost" size="icon-sm" title="Extract to new PDF" aria-label="Extract selected pages" onClick={extract}><FileDown /></Button>
        <Button variant="ghost" size="icon-sm" title="Delete" aria-label="Delete selected pages" className="hover:text-danger" disabled={pages.length <= targetIds().length} onClick={() => s().deletePages(targetIds())}><Trash2 /></Button>
      </div>
      <div
        className="flex-1 space-y-1 overflow-y-auto px-3 py-3"
        role="listbox"
        aria-label="Pages"
        aria-multiselectable
        onDragOver={(e) => e.preventDefault()}
      >
        {pages.map((p, i) => {
          const isSel = selected.includes(p.id);
          const count = objects[p.id]?.length ?? 0;
          return (
            <div
              key={p.id}
              role="option"
              aria-selected={isSel}
              aria-label={`Page ${i + 1}${count ? `, ${count} edits` : ""}`}
              tabIndex={i === current ? 0 : -1}
              draggable
              onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; if (!selected.includes(p.id)) s().setSelectedPages([p.id]); }}
              onDragOver={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
              onDrop={(e) => { e.preventDefault(); if (dragId && dropAt !== null) s().movePages(selected.includes(dragId) ? selected : [dragId], dropAt); setDragId(null); setDropAt(null); }}
              onDragEnd={() => { setDragId(null); setDropAt(null); }}
              onClick={(e) => click(e, p, i)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn("group relative flex cursor-pointer flex-col items-center rounded-lg p-2 outline-none transition", isSel ? "bg-accent-soft" : "hover:bg-surface-2", dragId === p.id && "opacity-40", "focus-visible:ring-2 focus-visible:ring-accent")}
            >
              {dropAt === i && dragId && <div className="absolute -top-1 right-2 left-2 h-0.5 rounded bg-accent" />}
              {dropAt === i + 1 && dragId && i === pages.length - 1 && <div className="absolute right-2 -bottom-1 left-2 h-0.5 rounded bg-accent" />}
              <div className={cn("overflow-hidden rounded-sm shadow-sm ring-1", isSel || i === current ? "ring-2 ring-accent" : "ring-border")}>
                <Thumb page={p} width={118} />
              </div>
              <span className="mt-1.5 text-[11px] tabular-nums text-ink-3">{i + 1}{count ? <span className="ml-1 rounded bg-accent/15 px-1 text-accent">{count}</span> : null}</span>
            </div>
          );
        })}
        <button onClick={() => fileInput.current?.click()} className="mt-2 flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border-strong py-4 text-xs text-ink-3 hover:border-accent hover:text-accent">
          <ImagePlus className="size-4" /> Add pages
        </button>
      </div>
    </div>
  );
}
