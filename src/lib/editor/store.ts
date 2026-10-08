"use client";

import { create } from "zustand";
import { uid } from "../utils";
import type { EditorObject, PageRef, Snapshot, SourceDoc, TextStyle } from "./model";
import { defaultTextStyle, displaySize } from "./model";

export type ToolId =
  | "select" | "hand" | "text" | "editText" | "whiteout" | "highlight" | "underline" | "strike"
  | "ink" | "eraser" | "line" | "arrow" | "rect" | "ellipse" | "polygon" | "cloud"
  | "image" | "signature" | "stamp" | "check" | "cross" | "star" | "note" | "link" | "redact" | "field";

export interface ToolStyle {
  stroke: string;
  fill: string | null;
  strokeWidth: number;
  opacity: number;
  highlight: string;
  whiteout: string;
  text: TextStyle;
  stamp: string;
  /** Text and outline colours for new stamps (outline null = none). */
  stampText: string;
  stampBorder: string | null;
  /** Whiteout: cover everything, or remove only the text under the box. */
  whiteoutMode: "cover" | "text";
  fieldType: "text" | "checkbox" | "radio" | "dropdown" | "date" | "signature";
}

export type DocStatus = "empty" | "loading" | "ready" | "saving" | "error";

const HISTORY_LIMIT = 100;

interface EditorState {
  status: DocStatus;
  error: string | null;
  docName: string;
  sources: Record<string, SourceDoc>;
  pages: PageRef[];
  objects: Record<string, EditorObject[]>;
  /** Image data URLs, kept out of history snapshots (immutable once added). */
  assets: Record<string, string>;
  /** Signatures created this session (asset ids). */
  signatures: string[];
  /** Existing AcroForm field values the user has entered, by field name. */
  formValues: Record<string, string | boolean>;
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;

  tool: ToolId;
  style: ToolStyle;
  selection: string[];
  editingId: string | null;
  /** Text range to select when an edit box opens (e.g. the double-clicked word). */
  editSelection: [number, number] | null;
  selectedPages: string[];
  currentPage: number;
  zoom: number;
  fit: "width" | "page" | null;
  pendingAsset: { asset: string; kind: "image" | "signature"; w: number; h: number } | null;
  clipboard: EditorObject[];
  redactPreview: boolean;
  /** Edited text whose look differs from the original: ask which style to keep. */
  stylePrompt: { id: string; missing?: string } | null;
  /** False once the user ticks "Don't ask again" (this session). */
  askStyle: boolean;

  // ── lifecycle
  reset(): void;
  setStatus(status: DocStatus, error?: string | null): void;
  initDocument(name: string, sources: SourceDoc[], pages: PageRef[], objects?: Record<string, EditorObject[]>, assets?: Record<string, string>): void;
  setDocName(name: string): void;
  markSaved(): void;

  // ── history
  commit(): void;
  undo(): void;
  redo(): void;

  // ── objects
  addObject(pageId: string, obj: EditorObject, opts?: { select?: boolean }): void;
  updateObject(id: string, patch: Partial<EditorObject>, opts?: { commit?: boolean }): void;
  removeObjects(ids: string[]): void;
  duplicateObjects(ids: string[]): void;
  copy(): void;
  paste(pageId: string): void;
  bringToFront(id: string): void;
  sendToBack(id: string): void;
  addAsset(dataUrl: string): string;
  addSignature(asset: string): void;

  // ── pages
  addSource(src: SourceDoc, pages: PageRef[], at?: number): void;
  rotatePages(ids: string[], delta: number): void;
  deletePages(ids: string[]): void;
  duplicatePages(ids: string[]): void;
  insertBlank(at: number, size?: { width: number; height: number }): void;
  movePages(ids: string[], to: number): void;

  // ── ui
  setTool(tool: ToolId): void;
  setStyle(patch: Partial<ToolStyle>): void;
  setTextStyle(patch: Partial<TextStyle>): void;
  select(ids: string[]): void;
  setEditing(id: string | null, selection?: [number, number] | null): void;
  setSelectedPages(ids: string[]): void;
  setCurrentPage(i: number): void;
  setZoom(z: number, fit?: "width" | "page" | null): void;
  setPendingAsset(p: EditorState["pendingAsset"]): void;
  setFormValue(name: string, value: string | boolean): void;
  setRedactPreview(v: boolean): void;
  setStylePrompt(p: EditorState["stylePrompt"]): void;
  setAskStyle(v: boolean): void;
}

const initialUi = {
  tool: "select" as ToolId,
  selection: [] as string[],
  editingId: null,
  editSelection: null as [number, number] | null,
  selectedPages: [] as string[],
  currentPage: 0,
  zoom: 1,
  fit: "width" as const,
  pendingAsset: null,
  redactPreview: false,
  stylePrompt: null,
};

const initialStyle: ToolStyle = {
  stroke: "#d0312d",
  fill: null,
  strokeWidth: 2,
  opacity: 1,
  highlight: "#ffe14d",
  whiteout: "#ffffff",
  text: defaultTextStyle,
  stamp: "APPROVED",
  stampText: "#2e9e5b",
  stampBorder: "#2e9e5b",
  whiteoutMode: "cover",
  fieldType: "text",
};

export function findObject(objects: Record<string, EditorObject[]>, id: string): { pageId: string; obj: EditorObject; index: number } | null {
  for (const [pageId, list] of Object.entries(objects)) {
    const index = list.findIndex((o) => o.id === id);
    if (index >= 0) return { pageId, obj: list[index], index };
  }
  return null;
}

function cloneObject(o: EditorObject, dx = 0, dy = 0): EditorObject {
  const c = structuredClone(o) as EditorObject;
  c.id = uid("o");
  c.x += dx;
  c.y += dy;
  if (c.kind === "line" || c.kind === "arrow") {
    c.x1 += dx; c.x2 += dx; c.y1 += dy; c.y2 += dy;
  }
  if (c.kind === "field") c.name = `${c.name}_${c.id.slice(-4)}`;
  return c;
}

export const useEditor = create<EditorState>()((set, get) => ({
  status: "empty",
  error: null,
  docName: "document.pdf",
  sources: {},
  pages: [],
  objects: {},
  assets: {},
  signatures: [],
  formValues: {},
  past: [],
  future: [],
  dirty: false,
  style: initialStyle,
  clipboard: [],
  askStyle: true,
  ...initialUi,

  reset: () =>
    set({ status: "empty", error: null, docName: "document.pdf", sources: {}, pages: [], objects: {}, assets: {}, formValues: {}, past: [], future: [], dirty: false, ...initialUi }),
  setStatus: (status, error = null) => set({ status, error }),
  initDocument: (name, sources, pages, objects = {}, assets = {}) =>
    set({
      docName: name,
      sources: Object.fromEntries(sources.map((s) => [s.id, s])),
      pages,
      objects,
      assets,
      formValues: {},
      past: [],
      future: [],
      dirty: false,
      status: "ready",
      error: null,
      ...initialUi,
      selectedPages: pages[0] ? [pages[0].id] : [],
    }),
  setDocName: (docName) => set({ docName }),
  markSaved: () => set({ dirty: false }),

  commit: () => {
    const { pages, objects, past } = get();
    const next = [...past, { pages, objects }];
    if (next.length > HISTORY_LIMIT) next.shift();
    set({ past: next, future: [], dirty: true });
  },
  undo: () => {
    const { past, future, pages, objects } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({ past: past.slice(0, -1), future: [{ pages, objects }, ...future], pages: prev.pages, objects: prev.objects, selection: [], editingId: null, dirty: true });
  },
  redo: () => {
    const { past, future, pages, objects } = get();
    const next = future[0];
    if (!next) return;
    set({ future: future.slice(1), past: [...past, { pages, objects }], pages: next.pages, objects: next.objects, selection: [], editingId: null, dirty: true });
  },

  addObject: (pageId, obj, opts = { select: true }) => {
    get().commit();
    set((s) => ({
      objects: { ...s.objects, [pageId]: [...(s.objects[pageId] ?? []), obj] },
      selection: opts.select ? [obj.id] : s.selection,
    }));
  },
  updateObject: (id, patch, opts = {}) => {
    const found = findObject(get().objects, id);
    if (!found) return;
    if (opts.commit) get().commit();
    set((s) => {
      const list = [...s.objects[found.pageId]];
      list[found.index] = { ...list[found.index], ...patch } as EditorObject;
      return { objects: { ...s.objects, [found.pageId]: list }, dirty: true };
    });
  },
  removeObjects: (ids) => {
    if (!ids.length) return;
    get().commit();
    const drop = new Set(ids);
    set((s) => ({
      objects: Object.fromEntries(Object.entries(s.objects).map(([k, v]) => [k, v.filter((o) => !drop.has(o.id))])),
      selection: s.selection.filter((id) => !drop.has(id)),
      editingId: s.editingId && drop.has(s.editingId) ? null : s.editingId,
    }));
  },
  duplicateObjects: (ids) => {
    const { objects } = get();
    const created: string[] = [];
    const next = { ...objects };
    for (const id of ids) {
      const f = findObject(objects, id);
      if (!f) continue;
      const c = cloneObject(f.obj, 12, 12);
      next[f.pageId] = [...(next[f.pageId] ?? []), c];
      created.push(c.id);
    }
    if (!created.length) return;
    get().commit();
    set({ objects: next, selection: created });
  },
  copy: () => {
    const { objects, selection } = get();
    const items = selection.map((id) => findObject(objects, id)?.obj).filter(Boolean) as EditorObject[];
    if (items.length) set({ clipboard: items });
  },
  paste: (pageId) => {
    const { clipboard } = get();
    if (!clipboard.length) return;
    const clones = clipboard.map((o) => cloneObject(o, 16, 16));
    get().commit();
    set((s) => ({ objects: { ...s.objects, [pageId]: [...(s.objects[pageId] ?? []), ...clones] }, selection: clones.map((c) => c.id), clipboard: clones }));
  },
  bringToFront: (id) => {
    const f = findObject(get().objects, id);
    if (!f) return;
    get().commit();
    set((s) => {
      const list = s.objects[f.pageId].filter((o) => o.id !== id);
      return { objects: { ...s.objects, [f.pageId]: [...list, f.obj] } };
    });
  },
  sendToBack: (id) => {
    const f = findObject(get().objects, id);
    if (!f) return;
    get().commit();
    set((s) => {
      const list = s.objects[f.pageId].filter((o) => o.id !== id);
      return { objects: { ...s.objects, [f.pageId]: [f.obj, ...list] } };
    });
  },
  addAsset: (dataUrl) => {
    const id = uid("a");
    set((s) => ({ assets: { ...s.assets, [id]: dataUrl } }));
    return id;
  },
  addSignature: (asset) => set((s) => ({ signatures: [asset, ...s.signatures.filter((a) => a !== asset)].slice(0, 6) })),

  addSource: (src, newPages, at) => {
    get().commit();
    set((s) => {
      const pages = [...s.pages];
      pages.splice(at ?? pages.length, 0, ...newPages);
      return { sources: { ...s.sources, [src.id]: src }, pages };
    });
  },
  rotatePages: (ids, delta) => {
    const target = new Set(ids);
    get().commit();
    set((s) => ({
      pages: s.pages.map((p) => {
        if (!target.has(p.id)) return p;
        // Rotating a page rotates its overlay objects with it, so markup stays attached to content.
        return { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 };
      }),
      objects: Object.fromEntries(
        Object.entries(s.objects).map(([pid, list]) => {
          const page = s.pages.find((p) => p.id === pid);
          if (!page || !target.has(pid)) return [pid, list];
          return [pid, list.map((o) => rotateObject(o, displaySize(page), delta))];
        }),
      ),
    }));
  },
  deletePages: (ids) => {
    const drop = new Set(ids);
    if (get().pages.every((p) => drop.has(p.id))) return; // never delete every page
    get().commit();
    set((s) => {
      const pages = s.pages.filter((p) => !drop.has(p.id));
      const objects = { ...s.objects };
      ids.forEach((id) => delete objects[id]);
      return { pages, objects, selectedPages: [], currentPage: Math.min(s.currentPage, pages.length - 1) };
    });
  },
  duplicatePages: (ids) => {
    get().commit();
    set((s) => {
      const pages: PageRef[] = [];
      const objects = { ...s.objects };
      const created: string[] = [];
      for (const p of s.pages) {
        pages.push(p);
        if (ids.includes(p.id)) {
          const copy = { ...p, id: uid("p") };
          pages.push(copy);
          objects[copy.id] = (s.objects[p.id] ?? []).map((o) => cloneObject(o));
          created.push(copy.id);
        }
      }
      return { pages, objects, selectedPages: created };
    });
  },
  insertBlank: (at, size) => {
    const ref = get().pages[Math.max(0, at - 1)];
    const { w, h } = ref ? displaySize(ref) : { w: 595.28, h: 841.89 };
    const page: PageRef = { id: uid("p"), sourceId: null, sourceIndex: 0, rotation: 0, baseRotation: 0, width: size?.width ?? w, height: size?.height ?? h };
    get().commit();
    set((s) => {
      const pages = [...s.pages];
      pages.splice(at, 0, page);
      return { pages, selectedPages: [page.id], currentPage: at };
    });
  },
  movePages: (ids, to) => {
    const { pages } = get();
    const moving = pages.filter((p) => ids.includes(p.id));
    if (!moving.length) return;
    const before = pages.slice(0, to).filter((p) => !ids.includes(p.id));
    const after = pages.slice(to).filter((p) => !ids.includes(p.id));
    const next = [...before, ...moving, ...after];
    if (next.every((p, i) => p.id === pages[i].id)) return;
    get().commit();
    set({ pages: next });
  },

  setTool: (tool) => set({ tool, selection: tool === "select" ? get().selection : [], editingId: null }),
  setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
  setTextStyle: (patch) => set((s) => ({ style: { ...s.style, text: { ...s.style.text, ...patch } } })),
  select: (selection) => set({ selection }),
  setEditing: (editingId, selection = null) => set({ editingId, editSelection: selection }),
  setSelectedPages: (selectedPages) => set({ selectedPages }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setZoom: (zoom, fit = null) => set({ zoom: Math.min(5, Math.max(0.25, zoom)), fit }),
  setPendingAsset: (pendingAsset) => set({ pendingAsset, tool: pendingAsset ? "select" : get().tool }),
  setFormValue: (name, value) => set((s) => ({ formValues: { ...s.formValues, [name]: value }, dirty: true })),
  setRedactPreview: (redactPreview) => set({ redactPreview }),
  setStylePrompt: (stylePrompt) => set({ stylePrompt }),
  setAskStyle: (askStyle) => set({ askStyle }),
}));

/** Rotate an object's box with its page (page display size given *before* rotation). */
function rotateObject(o: EditorObject, size: { w: number; h: number }, delta: number): EditorObject {
  const d = ((delta % 360) + 360) % 360;
  if (d === 0) return o;
  const map = (x: number, y: number): [number, number] => {
    if (d === 90) return [size.h - y, x];
    if (d === 180) return [size.w - x, size.h - y];
    return [y, size.w - x];
  };
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const [ncx, ncy] = map(cx, cy);
  const next = { ...o, x: ncx - o.w / 2, y: ncy - o.h / 2, rotation: (o.rotation + d) % 360 } as EditorObject;
  if (next.kind === "line" || next.kind === "arrow") {
    const [x1, y1] = map(next.x1, next.y1);
    const [x2, y2] = map(next.x2, next.y2);
    return { ...next, x1, y1, x2, y2, rotation: 0, ...lineBox(x1, y1, x2, y2) };
  }
  return next;
}

export function lineBox(x1: number, y1: number, x2: number, y2: number) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(1, Math.abs(x2 - x1)), h: Math.max(1, Math.abs(y2 - y1)) };
}
