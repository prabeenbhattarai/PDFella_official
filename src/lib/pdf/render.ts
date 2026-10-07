"use client";

import type { PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { PageRef } from "../editor/model";
import { totalRotation } from "../editor/model";
import { getPage } from "./docCache";

/** Limit concurrent page renders so scrolling a long document never floods the worker. */
const MAX_CONCURRENT = 3;
let running = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

/** Browsers cap canvas size (iOS Safari ≈ 16.7M px); stay well below it. */
const MAX_PIXELS = 12_000_000;

export interface RenderHandle { promise: Promise<void>; cancel: () => void }

/** `override` renders a different pdf.js page in place of the source page (e.g. with edited text removed). */
export function renderPage(ref: PageRef, canvas: HTMLCanvasElement, cssScale: number, dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, override?: PDFPageProxy | null): RenderHandle {
  let task: RenderTask | null = null;
  let cancelled = false;
  const promise = slot(async () => {
    if (cancelled) return;
    const page = override ?? (await getPage(ref));
    if (cancelled) return;
    const base = page
      ? page.getViewport({ scale: 1, rotation: totalRotation(ref) })
      : { width: ref.width, height: ref.height };
    let scale = cssScale * dpr;
    if (base.width * base.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (base.width * base.height));
    const w = Math.max(1, Math.floor(base.width * scale));
    const h = Math.max(1, Math.floor(base.height * scale));
    // Render into an offscreen canvas first so the visible one never flashes blank.
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const g = off.getContext("2d", { alpha: false })!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    if (page) {
      const vp = page.getViewport({ scale, rotation: totalRotation(ref) });
      task = page.render({ canvasContext: g, viewport: vp, annotationMode: 1 /* ENABLE: draw form field appearances */ });
      try {
        await task.promise;
      } catch (e) {
        if ((e as Error)?.name === "RenderingCancelledException") return;
        throw e;
      }
    }
    if (cancelled) return;
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d", { alpha: false })!.drawImage(off, 0, 0);
    off.width = off.height = 0;
  });
  return { promise, cancel: () => { cancelled = true; task?.cancel(); } };
}

const thumbCache = new Map<string, string>();

/** Small JPEG data URL for the thumbnail rail, cached by source page + rotation. */
export async function renderThumbnail(ref: PageRef, width = 160): Promise<string> {
  const key = `${ref.sourceId}:${ref.sourceIndex}:${totalRotation(ref)}:${width}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const page = await getPage(ref);
  const rotation = totalRotation(ref);
  const size = page ? page.getViewport({ scale: 1, rotation }) : { width: ref.width, height: ref.height };
  const canvas = document.createElement("canvas");
  const h = renderPage(ref, canvas, width / size.width, 1.5);
  await h.promise;
  const url = canvas.toDataURL("image/jpeg", 0.75);
  canvas.width = canvas.height = 0;
  thumbCache.set(key, url);
  return url;
}
