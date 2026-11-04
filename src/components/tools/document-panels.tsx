"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/form";
import type { Bookmark, CropMargins } from "@/lib/pdf/document-info";
import { cn } from "@/lib/utils";
import { PageThumb } from "./shared";

// ───────────────────────────── Crop

const MIN_KEPT = 0.05;
type Edge = keyof CropMargins;
const NO_CROP: CropMargins = { left: 0, top: 0, right: 0, bottom: 0 };
const HANDLES: { edges: Edge[]; className: string; label: string }[] = [
  { edges: ["top", "left"], className: "-top-2 -left-2 cursor-nwse-resize", label: "Top left corner" },
  { edges: ["top", "right"], className: "-top-2 -right-2 cursor-nesw-resize", label: "Top right corner" },
  { edges: ["bottom", "left"], className: "-bottom-2 -left-2 cursor-nesw-resize", label: "Bottom left corner" },
  { edges: ["bottom", "right"], className: "-right-2 -bottom-2 cursor-nwse-resize", label: "Bottom right corner" },
  { edges: ["top"], className: "-top-2 left-1/2 -ml-2 cursor-ns-resize", label: "Top edge" },
  { edges: ["bottom"], className: "-bottom-2 left-1/2 -ml-2 cursor-ns-resize", label: "Bottom edge" },
  { edges: ["left"], className: "top-1/2 -left-2 -mt-2 cursor-ew-resize", label: "Left edge" },
  { edges: ["right"], className: "top-1/2 -right-2 -mt-2 cursor-ew-resize", label: "Right edge" },
];

/** Keep a margin inside the page and leave a usable area between it and the opposite edge. */
function setEdge(m: CropMargins, edge: Edge, value: number): CropMargins {
  const opposite = { left: "right", right: "left", top: "bottom", bottom: "top" }[edge] as Edge;
  return { ...m, [edge]: Math.max(0, Math.min(value, 1 - m[opposite] - MIN_KEPT)) };
}

/** Drag a box on a page preview. `onApply` gets the margins and which pages they apply to. */
export function CropPanel({ doc, startPage = 0, previewWidth = 440, onApply }: {
  doc: PDFDocumentProxy | null;
  startPage?: number;
  previewWidth?: number;
  onApply: (margins: CropMargins, pages: "all" | number[]) => void;
}) {
  const [m, setM] = useState<CropMargins>(NO_CROP);
  const [page, setPage] = useState(startPage);
  const [scope, setScope] = useState<"all" | "one">("all");
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => { setWidth(Math.min(previewWidth, holder.current?.clientWidth ?? previewWidth)); }, [previewWidth]);
  const count = doc?.numPages ?? 0;
  const untouched = m.left === 0 && m.top === 0 && m.right === 0 && m.bottom === 0;

  const drag = (edges: Edge[]) => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = box.current!.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      setM((cur) => edges.reduce((next, edge) => setEdge(next, edge, edge === "left" ? x : edge === "right" ? 1 - x : edge === "top" ? y : 1 - y), cur));
    };
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  const inset = { left: `${m.left * 100}%`, top: `${m.top * 100}%`, right: `${m.right * 100}%`, bottom: `${m.bottom * 100}%` };

  return (
    <div className="space-y-4 text-left">
      <div ref={holder} className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4">
        {doc && width > 0 ? (
          <div ref={box} className="relative touch-none select-none" data-testid="crop-page">
            <PageThumb key={page} doc={doc} index={page} width={width - 32} />
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute shadow-[0_0_0_9999px_rgba(8,12,18,0.45)]" style={inset} />
            </div>
            <div className="absolute border-2 border-accent" data-testid="crop-box" style={inset}>
              {HANDLES.map((h) => (
                <span key={h.label} aria-hidden title={h.label} data-handle={h.edges.join("-")} onPointerDown={drag(h.edges)}
                  className={cn("absolute size-4 touch-none rounded-sm border-2 border-accent bg-white", h.className)} />
              ))}
            </div>
          </div>
        ) : <div className="h-72 w-full max-w-sm animate-pulse rounded bg-surface" />}
        {count > 1 && (
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
            <span className="tabular-nums">Page {page + 1} of {count}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= count - 1} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["left", "right", "top", "bottom"] as Edge[]).map((edge) => (
          <Field key={edge} label={`${edge[0].toUpperCase()}${edge.slice(1)} margin (%)`}>
            {(id) => <Input id={id} type="number" min={0} max={95} step={0.5} value={Math.round(m[edge] * 1000) / 10}
              onChange={(e) => setM((cur) => setEdge(cur, edge, (Number(e.target.value) || 0) / 100))} />}
          </Field>
        ))}
      </div>
      {count > 1 && (
        <Segmented label="Apply to" value={scope} onChange={setScope} options={[{ value: "all" as const, label: "All pages" }, { value: "one" as const, label: "This page only" }]} />
      )}
      <div className="flex gap-2">
        <Button size="lg" className="flex-1" disabled={untouched || !doc} onClick={() => onApply(m, scope === "all" ? "all" : [page])}>Crop PDF</Button>
        <Button size="lg" variant="outline" disabled={untouched} onClick={() => setM(NO_CROP)}><RotateCcw /> Reset</Button>
      </div>
    </div>
  );
}

// ───────────────────────────── Bookmarks

let nextKey = 0;
export type BookmarkRow = Bookmark & { key: number };
export const toRows = (list: Bookmark[]): BookmarkRow[] => list.map((b) => ({ ...b, key: nextKey++ }));
export const bookmarksInvalid = (rows: BookmarkRow[]) => rows.some((r) => !r.title.trim());
export const fromRows = (rows: BookmarkRow[]): Bookmark[] => rows.map(({ key: _key, ...b }) => { void _key; return { ...b, title: b.title.trim() }; });

/** Add, rename, reorder and nest bookmarks. `defaultPage` is where a new one points. */
export function BookmarkList({ rows, setRows, pageCount, defaultPage }: { rows: BookmarkRow[]; setRows: (rows: BookmarkRow[]) => void; pageCount: number; defaultPage?: number }) {
  const patch = (i: number, p: Partial<Bookmark>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const add = () => {
    const last = rows[rows.length - 1];
    const page = defaultPage ?? (last ? Math.min(last.page + 1, pageCount - 1) : 0);
    setRows([...rows, { key: nextKey++, title: "", page, level: last?.level ?? 0 }]);
  };
  // A row moves or deletes together with the rows nested under it.
  const blockEnd = (i: number) => { let e = i + 1; while (e < rows.length && rows[e].level > rows[i].level) e++; return e; };
  const remove = (i: number) => setRows([...rows.slice(0, i), ...rows.slice(blockEnd(i))]);
  const move = (i: number, dir: -1 | 1) => {
    const end = blockEnd(i);
    const block = rows.slice(i, end);
    const rest = [...rows.slice(0, i), ...rows.slice(end)];
    let at = i;
    if (dir < 0) { at = i - 1; while (at > 0 && rest[at].level > block[0].level) at--; }
    else { at = i + 1; while (at < rest.length && rest[at].level > block[0].level) at++; }
    setRows([...rest.slice(0, at), ...block, ...rest.slice(at)]);
  };
  const shift = (i: number, delta: -1 | 1) => {
    const end = blockEnd(i);
    setRows(rows.map((r, j) => (j >= i && j < end ? { ...r, level: r.level + delta } : r)));
  };

  return (
    <div className="space-y-3 text-left">
      {rows.length === 0 && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-3">This PDF has no bookmarks yet. Add one to start its table of contents.</p>}
      <ul className="space-y-2" aria-label="Bookmarks">
        {rows.map((r, i) => (
          <li key={r.key} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-2" style={{ marginLeft: Math.min(r.level, 4) * 16 }} data-testid="bookmark-row">
            <Input className="min-w-[140px] flex-1" value={r.title} placeholder="Bookmark title" aria-label={`Bookmark ${i + 1} title`} onChange={(e) => patch(i, { title: e.target.value })} />
            {r.url
              ? <span className="max-w-[140px] truncate text-xs text-ink-3" title={r.url}>{r.url}</span>
              : <Input className="w-20" type="number" min={1} max={pageCount} value={r.page + 1} aria-label={`Bookmark ${i + 1} page`}
                  onChange={(e) => patch(i, { page: Math.max(0, Math.min(pageCount - 1, (Number(e.target.value) || 1) - 1)), top: null })} />}
            <div className="flex items-center">
              <Button variant="ghost" size="icon-sm" aria-label={`Move bookmark ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move bookmark ${i + 1} down`} disabled={blockEnd(i) >= rows.length} onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move bookmark ${i + 1} out a level`} disabled={r.level === 0} onClick={() => shift(i, -1)}><ArrowLeft /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Nest bookmark ${i + 1}`} disabled={i === 0 || r.level > rows[i - 1].level} onClick={() => shift(i, 1)}><ArrowRight /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete bookmark ${i + 1}`} onClick={() => remove(i)}><Trash2 /></Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" onClick={add}><Plus /> Add bookmark</Button>
      {bookmarksInvalid(rows) && <p className="text-[13px] text-ink-3">Give every bookmark a title to save.</p>}
    </div>
  );
}
