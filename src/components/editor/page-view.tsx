"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import type { Box, PageRef } from "@/lib/editor/model";
import { displaySize } from "@/lib/editor/model";
import { renderPage } from "@/lib/pdf/render";
import { editsKey, getEditedPage, textRemovals } from "@/lib/pdf/page-preview";
import { useEditor } from "@/lib/editor/store";
import { useSearch } from "@/lib/editor/search";
import { PageLayer } from "./page-layer";

const EMPTY_SET = new Set<string>();
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** One page: lazily rendered PDF canvas + search hits + interactive object layer. */
export const PageView = memo(function PageView({ page, index, z, visible }: { page: PageRef; index: number; z: number; visible: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const renderedRef = useRef(false);
  renderedRef.current = rendered;
  const size = displaySize(page);
  const hits = useSearch((s) => s.hits);
  const active = useSearch((s) => s.active);

  // Edited text is removed from the preview itself (as in the saved file) instead of
  // being covered with a box, so watermarks and backgrounds under it stay visible.
  const objects = useEditor((s) => s.objects[page.id]);
  const edits = useMemo(() => textRemovals(objects), [objects]);
  const key = editsKey(edits);
  const [edited, setEdited] = useState<{ key: string; page: PDFPageProxy; removed: Set<string> } | null>(null);
  useEffect(() => {
    if (!key) { setEdited(null); return; }
    const src = page.sourceId ? useEditor.getState().sources[page.sourceId] : undefined;
    if (!src) return;
    let alive = true;
    const t = setTimeout(() => {
      getEditedPage(page, src.bytes, edits).then((r) => { if (alive) setEdited(r ? { key, ...r } : null); });
    }, 120);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page.sourceId, page.sourceIndex]);
  const current = edited?.key === key ? edited : null;
  // Until the preview without the original text has rendered, keep covering it.
  const [shownRemoved, setShownRemoved] = useState<Set<string>>(EMPTY_SET);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    const t = setTimeout(() => {
      const h = renderPage(page, canvas.current!, z, undefined, current?.page);
      h.promise.then(() => { setRendered(true); setShownRemoved(current?.removed ?? EMPTY_SET); }).catch(() => {});
      cleanup = h.cancel;
    }, rendered ? 120 : 0); // debounce re-renders while zooming
    let cleanup = () => {};
    return () => { clearTimeout(t); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, z, page.sourceId, page.sourceIndex, page.rotation, page.baseRotation, current]);

  // Free canvas memory for pages that scroll far away.
  useEffect(() => {
    if (visible || !canvas.current) return;
    const t = setTimeout(() => { if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; setRendered(false); } }, 4000);
    return () => clearTimeout(t);
  }, [visible]);

  /** Sample background and text colour inside a page box from the rendered canvas. */
  const sample = useCallback((b: Box) => {
    const c = canvas.current;
    const fallback = { bg: "#ffffff", fg: "#15171c" };
    // An unrendered (or freed) canvas reads as black: never sample it.
    if (!c || !c.width || !renderedRef.current) return fallback;
    const sx = c.width / size.w;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return fallback;
    const x = Math.max(0, Math.floor(b.x * sx)), y = Math.max(0, Math.floor(b.y * sx));
    const w = Math.max(1, Math.min(c.width - x, Math.ceil(b.w * sx))), h = Math.max(1, Math.min(c.height - y, Math.ceil(b.h * sx)));
    const data = g.getImageData(x, y, w, h).data;
    // Background = most common colour (quantised); foreground = pixel furthest from it.
    const counts = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let bgKey = 0, best = -1;
    counts.forEach((n, k) => { if (n > best) { best = n; bgKey = k; } });
    const br = ((bgKey >> 10) & 31) << 3, bgG = ((bgKey >> 5) & 31) << 3, bb = (bgKey & 31) << 3;
    let fg = [21, 23, 28], far = 0;
    for (let i = 0; i < data.length; i += 4) {
      const d = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bb);
      if (d > far) { far = d; fg = [data[i], data[i + 1], data[i + 2]]; }
    }
    const snap = (v: number) => Math.min(255, Math.round(v / 8) * 8 + (v > 247 ? 7 : 0));
    return { bg: hex(snap(br), snap(bgG), snap(bb)), fg: far > 60 ? hex(fg[0], fg[1], fg[2]) : "#15171c" };
  }, [size.w]);

  return (
    <div
      className="relative mx-auto bg-white shadow-[0_1px_3px_rgb(0_0_0/.12),0_6px_24px_-8px_rgb(0_0_0/.18)]"
      style={{ width: size.w * z, height: size.h * z }}
      data-page-index={index}
      role="img"
      aria-label={`Page ${index + 1}`}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
      {!rendered && visible && page.sourceId && <div className="absolute inset-0 animate-pulse bg-neutral-100" />}
      {hits.map((h, i) => h.pageId === page.id && (
        <div key={i} className="pointer-events-none absolute rounded-[2px] mix-blend-multiply" style={{ left: h.box.x * z, top: h.box.y * z, width: h.box.w * z, height: h.box.h * z, background: i === active ? "#ff9d2e" : "#ffe14d99" }} />
      ))}
      <PageLayer page={page} index={index} z={z} sample={sample} removed={shownRemoved} />
    </div>
  );
});
