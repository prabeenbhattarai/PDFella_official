"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/editor/store";
import { displaySize } from "@/lib/editor/model";
import { useSearch } from "@/lib/editor/search";
import { PageView } from "./page-view";

const GAP = 24;

/** Scrollable document viewport: virtualised pages, fit modes, pinch/ctrl-wheel zoom, hand tool panning. */
export function DocumentCanvas() {
  const pages = useEditor((s) => s.pages);
  const zoom = useEditor((s) => s.zoom);
  const fit = useEditor((s) => s.fit);
  const tool = useEditor((s) => s.tool);
  const scroller = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  // Track viewport size for fit modes.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setWidth(el.clientWidth); setHeight(el.clientHeight); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fit || !width || !pages.length) return;
    const ref = pages[useEditor.getState().currentPage] ?? pages[0];
    const { w, h } = displaySize(ref);
    const pad = width < 640 ? 16 : 64;
    const z = fit === "width" ? (width - pad) / w : Math.min((width - pad) / w, (height - 48) / h);
    useEditor.getState().setZoom(Math.min(fit === "width" ? 2 : 3, z), fit);
  }, [fit, width, height, pages]);

  // Mixed page sizes (e.g. a landscape page) can make the document wider than the
  // viewport; keep the horizontal scroll centred so the fitted page is fully visible.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && fit && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [zoom, fit, width]);

  // Virtualisation: render pages near the viewport.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      setVisible((prev) => {
        const next = new Set(prev);
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.pageId!;
          if (e.isIntersecting) next.add(id); else next.delete(id);
        }
        return next;
      });
      // Current page = the most visible one.
      const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best && best.intersectionRatio > 0.3) {
        const i = Number((best.target as HTMLElement).dataset.index);
        if (useEditor.getState().currentPage !== i) useEditor.getState().setCurrentPage(i);
      }
    }, { root: el, rootMargin: "150% 0px", threshold: [0, 0.3, 0.6] });
    el.querySelectorAll("[data-page-id]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [pages]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const s = useEditor.getState();
      s.setZoom(s.zoom * Math.exp(-e.deltaY * 0.01));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Touch pinch zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let start = 0, startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) { start = dist(e.touches); startZoom = useEditor.getState().zoom; } };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !start) return;
      e.preventDefault();
      useEditor.getState().setZoom(startZoom * (dist(e.touches) / start));
    };
    const onEnd = () => { start = 0; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onEnd); };
  }, []);

  // Scroll to active search hit.
  const active = useSearch((s) => s.hits[s.active]);
  useEffect(() => {
    if (!active) return;
    const el = scroller.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"]`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + active.box.y * zoom - 120, behavior: "smooth" });
  }, [active, zoom]);

  // Hand tool: drag to pan.
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (tool !== "hand" && e.button !== 1) return;
    pan.current = { x: e.clientX, y: e.clientY, sl: scroller.current!.scrollLeft, st: scroller.current!.scrollTop };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current) return;
    scroller.current!.scrollLeft = pan.current.sl - (e.clientX - pan.current.x);
    scroller.current!.scrollTop = pan.current.st - (e.clientY - pan.current.y);
  };

  return (
    <div
      ref={scroller}
      id="document-scroller"
      className="relative h-full overflow-auto bg-workspace outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (pan.current = null)}
      style={{ cursor: tool === "hand" ? (pan.current ? "grabbing" : "grab") : undefined }}
      tabIndex={-1}
      aria-label="Document"
    >
      <div className="flex min-w-fit flex-col items-center px-2 py-6 sm:px-8" style={{ gap: GAP }}>
        {pages.map((p, i) => (
          <div key={p.id} data-page-id={p.id} data-index={i} className="relative">
            <PageView page={p} index={i} z={zoom} visible={visible.has(p.id)} />
            <p className="mt-1.5 text-center text-[11px] text-ink-3 select-none">{i + 1} / {pages.length}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function scrollToPage(i: number) {
  const sc = document.getElementById("document-scroller");
  const el = sc?.querySelector<HTMLElement>(`[data-index="${i}"]`);
  if (sc && el) sc.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
}
