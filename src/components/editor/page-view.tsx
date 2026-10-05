"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Box, PageRef } from "@/lib/editor/model";
import { displaySize } from "@/lib/editor/model";
import { renderPage } from "@/lib/pdf/render";
import { useSearch } from "@/lib/editor/search";
import { PageLayer } from "./page-layer";

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** One page: lazily rendered PDF canvas + search hits + interactive object layer. */
export const PageView = memo(function PageView({ page, index, z, visible }: { page: PageRef; index: number; z: number; visible: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const size = displaySize(page);
  const hits = useSearch((s) => s.hits);
  const active = useSearch((s) => s.active);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    const t = setTimeout(() => {
      const h = renderPage(page, canvas.current!, z);
      h.promise.then(() => setRendered(true)).catch(() => {});
      cleanup = h.cancel;
    }, rendered ? 120 : 0); // debounce re-renders while zooming
    let cleanup = () => {};
    return () => { clearTimeout(t); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, z, page.sourceId, page.sourceIndex, page.rotation, page.baseRotation]);

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
    if (!c || !c.width) return fallback;
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
      <PageLayer page={page} index={index} z={z} sample={sample} />
    </div>
  );
});
