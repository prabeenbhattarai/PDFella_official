"use client";

import { create } from "zustand";
import type { Box, PageRef } from "./model";
import { getTextRuns } from "../pdf/docCache";

export interface SearchHit { pageId: string; pageIndex: number; box: Box }

interface SearchState {
  open: boolean;
  query: string;
  hits: SearchHit[];
  active: number;
  searching: boolean;
  setOpen(open: boolean): void;
  run(query: string, pages: PageRef[]): Promise<void>;
  step(delta: number): void;
  clear(): void;
}

/** Locate a substring inside a text run, assuming roughly proportional character widths. */
export function subBox(run: { str: string; box: Box; angle: number }, start: number, len: number): Box {
  const n = Math.max(1, run.str.length);
  const a = ((run.angle % 360) + 360) % 360;
  if (a === 90 || a === 270) {
    const h = run.box.h / n;
    const y = a === 90 ? run.box.y + start * h : run.box.y + run.box.h - (start + len) * h;
    return { x: run.box.x, y, w: run.box.w, h: h * len };
  }
  const w = run.box.w / n;
  const x = a === 180 ? run.box.x + run.box.w - (start + len) * w : run.box.x + start * w;
  return { x, y: run.box.y, w: w * len, h: run.box.h };
}

export const useSearch = create<SearchState>((set, get) => ({
  open: false,
  query: "",
  hits: [],
  active: 0,
  searching: false,
  setOpen: (open) => set(open ? { open } : { open, query: "", hits: [], active: 0 }),
  run: async (query, pages) => {
    set({ query, searching: true });
    const q = query.trim().toLowerCase();
    if (!q) return set({ hits: [], active: 0, searching: false });
    const hits: SearchHit[] = [];
    for (let i = 0; i < pages.length; i++) {
      const runs = await getTextRuns(pages[i]);
      for (const r of runs) {
        const s = r.str.toLowerCase();
        for (let idx = s.indexOf(q); idx >= 0; idx = s.indexOf(q, idx + q.length)) {
          hits.push({ pageId: pages[i].id, pageIndex: i, box: subBox(r, idx, q.length) });
        }
      }
      if (get().query !== query) return; // superseded
    }
    set({ hits, active: 0, searching: false });
  },
  step: (d) => {
    const { hits, active } = get();
    if (hits.length) set({ active: (active + d + hits.length) % hits.length });
  },
  clear: () => set({ query: "", hits: [], active: 0 }),
}));
