"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, PencilLine, Trash2, Wand2 } from "lucide-react";
import type { Box, EditorObject, PageRef, TextEditObject } from "@/lib/editor/model";
import { displaySize, isTextLike } from "@/lib/editor/model";
import { useEditor, findObject, lineBox, type ToolId } from "@/lib/editor/store";
import { getTextRuns, type TextRun } from "@/lib/pdf/docCache";
import { baselineOffset, intersects, normalizeBox, rotatePt, type Pt } from "@/lib/pdf/geometry";
import { detectOriginalStyle, styleDiff } from "@/lib/editor/detect-style";
import { ensureStyleFonts, fontMetrics } from "@/lib/fonts/loader";
import { toast } from "@/components/ui/toast";
import { StyleChoice, applyOriginalStyle } from "./style-choice";
import { subBox } from "@/lib/editor/search";
import { lineGroup, wordAt } from "@/lib/editor/text-lines";
import { uid } from "@/lib/utils";
import { ObjectView } from "./object-view";
import { TOOL_DEFS, STAMP_COLORS } from "./tools";

type Gesture =
  | { type: "box"; tool: ToolId; start: Pt; cur: Pt }
  | { type: "line"; tool: ToolId; start: Pt; cur: Pt }
  | { type: "ink"; points: Pt[] }
  | { type: "erase" }
  | { type: "move"; start: Pt; origs: EditorObject[]; committed: boolean; reclick?: string }
  | { type: "marquee"; start: Pt; cur: Pt; base: string[] }
  | { type: "resize"; id: string; hx: number; hy: number; orig: EditorObject; committed: boolean }
  | { type: "rotate"; id: string; orig: EditorObject; committed: boolean }
  | { type: "lineEnd"; id: string; which: 1 | 2; committed: boolean };

const MARKUP: ToolId[] = ["highlight", "underline", "strike", "redact"];
const ERASABLE = new Set(["ink", "line", "arrow", "rect", "ellipse", "cloud", "polygon", "check", "cross", "star", "dot", "highlight", "underline", "strike"]);
const HANDLES: [number, number][] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const KEEP_ASPECT = new Set(["image", "signature", "stamp", "check", "cross", "star", "note"]);

/**
 * With a creation tool active, clicking an existing object of a kind that tool makes
 * selects it (to move, resize or delete) instead of stacking a new one on top.
 */
export const PICKS: Partial<Record<ToolId, string[]>> = {
  whiteout: ["whiteout"], highlight: ["highlight"], underline: ["underline"], strike: ["strike"], redact: ["redact"],
  rect: ["rect"], ellipse: ["ellipse"], polygon: ["polygon"], cloud: ["cloud"], line: ["line", "arrow"], arrow: ["line", "arrow"],
  stamp: ["stamp"], check: ["check"], cross: ["cross"], star: ["star"], note: ["note"], link: ["link"], field: ["field"],
  text: ["text"], editText: ["textEdit", "text"],
};

export interface ColorSampler { (box: Box): { bg: string; fg: string } }

/** Snap a drag rectangle to the text lines it covers. Returns per-line boxes (or [] if no text). */
export function snapToText(runs: TextRun[], area: Box, click: boolean): Box[] {
  const hits = runs.filter((r) => intersects(r.box, area) && r.angle % 180 === 0);
  const boxes: Box[] = [];
  for (const r of hits) {
    let b = r.box;
    if (!click) {
      const n = Math.max(1, r.str.length);
      const cw = r.box.w / n;
      const s = Math.max(0, Math.floor((area.x - r.box.x) / cw));
      const e = Math.min(n, Math.ceil((area.x + area.w - r.box.x) / cw));
      if (e <= s) continue;
      b = subBox(r, s, e - s);
    }
    // Merge with a box on the same line that touches it.
    const same = boxes.find((o) => Math.abs(o.y - b.y) < b.h * 0.4 && Math.abs(o.h - b.h) < b.h * 0.5 && b.x <= o.x + o.w + cw(b) && o.x <= b.x + b.w + cw(b));
    if (same) {
      const x = Math.min(same.x, b.x), y = Math.min(same.y, b.y);
      same.w = Math.max(same.x + same.w, b.x + b.w) - x;
      same.h = Math.max(same.y + same.h, b.y + b.h) - y;
      same.x = x; same.y = y;
    } else boxes.push({ ...b });
  }
  return boxes;
}
const cw = (b: Box) => b.h * 0.6;

function cssRotateDeg(deg: number) { return ((deg % 360) + 360) % 360; }

export function PageLayer({ page, index, z, sample }: { page: PageRef; index: number; z: number; sample: ColorSampler }) {
  const ref = useRef<HTMLDivElement>(null);
  const tool = useEditor((s) => s.tool);
  const objects = useEditor((s) => s.objects[page.id]) ?? EMPTY;
  const selection = useEditor((s) => s.selection);
  const editingId = useEditor((s) => s.editingId);
  const pending = useEditor((s) => s.pendingAsset);
  const redactPreview = useEditor((s) => s.redactPreview);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gRef = useRef<Gesture | null>(null);
  const [runs, setRuns] = useState<TextRun[] | null>(null);
  const [hoverRun, setHoverRun] = useState<TextRun | null>(null);
  const size = displaySize(page);

  const needsRuns = tool === "editText" || tool === "select" || MARKUP.includes(tool) || tool === "whiteout";
  useEffect(() => {
    if (!needsRuns || runs) return;
    let alive = true;
    getTextRuns(page).then((r) => alive && setRuns(r)).catch(() => alive && setRuns([]));
    return () => { alive = false; };
  }, [needsRuns, page, runs]);
  useEffect(() => setRuns(null), [page.sourceId, page.sourceIndex, page.rotation]);

  const toPage = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(size.w, Math.max(0, (e.clientX - r.left) / z)), Math.min(size.h, Math.max(0, (e.clientY - r.top) / z))];
  }, [z, size.w, size.h]);

  const set = (g: Gesture | null) => { gRef.current = g; setGesture(g); };

  const finishCreate = (t: ToolId) => {
    const s = useEditor.getState();
    s.setCurrentPage(index);
    if (!TOOL_DEFS[t]?.sticky) {
      // Switching tools clears editing state; keep a just-created text box in edit mode.
      const editing = s.editingId;
      const selection = s.selection;
      s.setTool("select");
      s.select(selection);
      if (editing) s.setEditing(editing);
    }
  };

  const add = (obj: EditorObject, opts?: { edit?: boolean }) => {
    const s = useEditor.getState();
    s.addObject(page.id, obj);
    if (opts?.edit) s.setEditing(obj.id);
  };

  // ───────────── creation helpers
  const createFromBox = async (t: ToolId, b: Box, click: boolean, shift: boolean) => {
    const st = useEditor.getState().style;
    const common = { id: uid("o"), rotation: 0, opacity: 1 };
    const DEF = { w: 120, h: 80 };
    if (click && !MARKUP.includes(t) && t !== "whiteout") b = { x: b.x - (t === "text" ? 0 : DEF.w / 2), y: b.y - (t === "text" ? 0 : DEF.h / 2), w: DEF.w, h: DEF.h };
    if (shift && (t === "rect" || t === "ellipse")) { const m = Math.max(b.w, b.h); b = { ...b, w: m, h: m }; }

    if (MARKUP.includes(t) || t === "whiteout") {
      const allRuns = runs ?? (await getTextRuns(page).catch(() => []));
      const snapped = t === "whiteout" && !click ? [] : snapToText(allRuns, click ? { x: b.x - 1, y: b.y - 1, w: 2, h: 2 } : b, click);
      const boxes = snapped.length ? snapped.map((x) => ({ x: x.x - 1, y: x.y, w: x.w + 2, h: x.h })) : click ? [] : [b];
      if (!boxes.length || boxes.every((x) => x.w < 2 || x.h < 2)) return;
      const s = useEditor.getState();
      s.commit();
      const created: EditorObject[] = boxes.map((bx) => {
        const base = { ...common, id: uid("o"), ...bx };
        if (t === "whiteout") return { ...base, kind: "whiteout", color: st.whiteout } as EditorObject;
        if (t === "redact") return { ...base, kind: "redact", fill: "#000000" } as EditorObject;
        if (t === "highlight") return { ...base, kind: "highlight", color: st.highlight, opacity: 0.55 } as EditorObject;
        return { ...base, kind: t as "underline" | "strike", color: st.stroke } as EditorObject;
      });
      useEditor.setState((x) => ({ objects: { ...x.objects, [page.id]: [...(x.objects[page.id] ?? []), ...created] }, selection: [] }));
      return finishCreate(t);
    }

    switch (t) {
      case "text": {
        const w = click ? Math.min(240, size.w - b.x - 8) : Math.max(40, b.w);
        add({ ...common, kind: "text", ...st.text, text: "", x: b.x, y: b.y - st.text.size * 0.6, w: Math.max(40, w), h: st.text.size * st.text.lineHeight }, { edit: true });
        break;
      }
      case "rect": case "ellipse": case "cloud":
        add({ ...common, kind: t, ...b, stroke: st.stroke, fill: st.fill, strokeWidth: st.strokeWidth, opacity: st.opacity });
        break;
      case "polygon": {
        const n = 5;
        const points = Array.from({ length: n }, (_, i) => {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          return [0.5 + 0.5 * Math.cos(a), 0.55 + 0.5 * Math.sin(a)] as [number, number];
        });
        add({ ...common, kind: "polygon", ...b, stroke: st.stroke, fill: st.fill, strokeWidth: st.strokeWidth, opacity: st.opacity, points });
        break;
      }
      case "link":
        if (click) b = { ...b, w: 120, h: 18 };
        add({ ...common, kind: "link", ...b, url: "https://" });
        break;
      case "field": {
        const ft = st.fieldType;
        const small = ft === "checkbox" || ft === "radio";
        if (click) b = small ? { x: b.x + DEF.w / 2 - 7, y: b.y + DEF.h / 2 - 7, w: 14, h: 14 } : { x: b.x + DEF.w / 2 - 80, y: b.y + DEF.h / 2 - 11, w: ft === "signature" ? 180 : 160, h: ft === "signature" ? 44 : 22 };
        const n = (useEditor.getState().objects[page.id] ?? []).filter((o) => o.kind === "field").length + 1;
        add({ ...common, kind: "field", ...b, fieldType: ft, name: `${ft}_${index + 1}_${n}`, options: ft === "dropdown" ? ["Option 1", "Option 2", "Option 3"] : [], required: false, group: ft === "radio" ? `group_${index + 1}` : undefined });
        break;
      }
    }
    finishCreate(t);
  };

  const createAtPoint = (t: ToolId, [x, y]: Pt) => {
    const st = useEditor.getState().style;
    const common = { id: uid("o"), rotation: 0, opacity: 1 };
    if (pending) {
      const { w, h } = pending;
      add({ ...common, kind: pending.kind, asset: pending.asset, crop: { x: 0, y: 0, w: 1, h: 1 }, x: x - w / 2, y: y - h / 2, w, h });
      useEditor.getState().setPendingAsset(null);
      return;
    }
    if (t === "stamp") {
      const label = st.stamp;
      add({ ...common, kind: "stamp", label, color: STAMP_COLORS[label] ?? st.stroke, x: x - 70, y: y - 20, w: 140, h: 40, rotation: -4 });
    } else if (t === "check" || t === "cross" || t === "star") {
      add({ ...common, kind: t, color: t === "check" ? "#2e9e5b" : t === "cross" ? "#d0312d" : "#e8b10c", x: x - 11, y: y - 11, w: 22, h: 22 });
    } else if (t === "note") {
      add({ ...common, kind: "note", text: "", color: "#ffd84d", author: "", x: x - 11, y: y - 11, w: 22, h: 22 });
    }
    finishCreate(t);
  };

  const runAt = (all: TextRun[], [x, y]: Pt) => all.find((r) => x >= r.box.x - 1 && x <= r.box.x + r.box.w + 1 && y >= r.box.y - 1 && y <= r.box.y + r.box.h + 1);

  /** Open existing PDF text for editing: the whole line, with the clicked word selected. */
  const editRun = async (run: TextRun, at?: Pt) => {
    const s = useEditor.getState();
    const all = runs ?? (await getTextRuns(page).catch(() => [run]));
    const { runs: group, text, offsets } = lineGroup(all, run);
    const box = group.reduce((b, r) => {
      const x = Math.min(b.x, r.box.x), y = Math.min(b.y, r.box.y);
      return { x, y, w: Math.max(b.x + b.w, r.box.x + r.box.w) - x, h: Math.max(b.y + b.h, r.box.y + r.box.h) - y };
    }, { ...group[0].box });

    // Which character was clicked → select that word.
    let selection: [number, number] | null = null;
    if (at) {
      const k = Math.max(0, group.indexOf(runAt(group, at) ?? run));
      const r = group[k];
      const local = Math.floor(((at[0] - r.box.x) / Math.max(1, r.box.w)) * r.str.length);
      selection = wordAt(text, offsets[k] + Math.max(0, Math.min(r.str.length - 1, local)));
    }

    // Already edited? Re-open that edit instead of stacking another.
    const existing = (s.objects[page.id] ?? []).find((o) => o.kind === "textEdit" && intersects(o.original.box, { x: run.box.x + 1, y: run.box.y + 1, w: Math.max(1, run.box.w - 2), h: Math.max(1, run.box.h - 2) }));
    if (existing) { s.select([existing.id]); s.setEditing(existing.id); return; }

    const { bg, fg } = sample(box);
    const { style, fontMatch } = await detectOriginalStyle({ page, run, group, color: fg, assets: s.assets, addAsset: s.addAsset });
    const assets = useEditor.getState().assets;
    await ensureStyleFonts(style, assets);
    const lineHeight = 1.2;
    const baselineY = run.origin[1];
    const obj: TextEditObject = {
      id: uid("o"), kind: "textEdit", rotation: 0, opacity: 1,
      ...s.style.text, ...style, lineHeight, background: null, underline: false, align: "left",
      text, x: group[0].origin[0], y: baselineY - baselineOffset(fontMetrics(style), style.size, lineHeight, 0), w: box.w + 8, h: style.size * lineHeight,
      original: { text, box, fontName: fontMatch.name, pdf: run.pdf, pdfRuns: group.map((r) => r.pdf) }, cover: bg, strategy: "remove",
      originalStyle: style, fontMatch,
    };
    if (!style.fontFallback) delete obj.fontFallback;
    s.addObject(page.id, obj);
    s.setEditing(obj.id, selection);
    s.setCurrentPage(index);
    if (fontMatch.kind === "similar") toast.info(`“${fontMatch.name}” isn't included in this PDF`, "We're using the closest match. You can pick another font in the panel on the right.");
  };

  /** Double-click on PDF text with the Select tool edits it in place. */
  const onDoubleClick = async (e: React.MouseEvent) => {
    if (tool !== "select") return;
    if ((e.target as HTMLElement).closest("[data-obj-id],[data-handle]")) return;
    const p = toPage(e);
    const all = runs ?? (await getTextRuns(page).catch(() => []));
    const run = runAt(all, p);
    if (!run) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    editRun(run, p);
  };

  // ───────────── pointer handling
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || tool === "hand") return;
    const p = toPage(e);
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-obj-id],[data-handle]");
    const s = useEditor.getState();
    s.setCurrentPage(index);

    if (target?.dataset.handle) {
      const id = target.dataset.for!;
      const f = findObject(s.objects, id);
      if (!f) return;
      e.stopPropagation();
      ref.current!.setPointerCapture(e.pointerId);
      const h = target.dataset.handle;
      if (h === "rotate") set({ type: "rotate", id, orig: f.obj, committed: false });
      else if (h === "p1" || h === "p2") set({ type: "lineEnd", id, which: h === "p1" ? 1 : 2, committed: false });
      else { const [hx, hy] = h.split(",").map(Number); set({ type: "resize", id, hx, hy, orig: f.obj, committed: false }); }
      return;
    }

    // Placing an image/signature takes priority over selection (the tool is "select" while placing).
    if (pending) { createAtPoint(tool, p); return; }

    // Clicking an existing object of the kind the current tool makes selects it.
    const picked = target?.dataset.objId ? objects.find((o) => o.id === target.dataset.objId) : undefined;
    if (tool !== "select" && picked && PICKS[tool]?.includes(picked.kind)) {
      if (tool === "editText" || tool === "text") {
        if (s.editingId === picked.id) return;
        // Keep the browser's default mousedown from moving focus away from the new edit box.
        e.preventDefault();
        s.select([picked.id]);
        s.setEditing(picked.id);
        return;
      }
      s.setTool("select");
      s.select([picked.id]);
      if (picked.locked) return;
      ref.current!.setPointerCapture(e.pointerId);
      set({ type: "move", start: p, origs: [picked], committed: false });
      return;
    }

    if (tool === "select") {
      if (target?.dataset.objId) {
        const id = target.dataset.objId;
        const obj = objects.find((o) => o.id === id);
        if (!obj) return;
        const wasOnlySelected = s.selection.length === 1 && s.selection[0] === id;
        let sel = s.selection;
        if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
        else if (!sel.includes(id)) sel = [id];
        s.select(sel);
        if (s.editingId === id) return;
        // A double-click, or a second click on already-selected text, edits it (on release,
        // so a drag still moves the box and the browser's mousedown focus can't blur the editor).
        const reclick = isTextLike(obj) && !e.shiftKey && (e.detail >= 2 || wasOnlySelected) ? id : undefined;
        if (obj.locked) { if (reclick) s.setEditing(reclick); return; }
        ref.current!.setPointerCapture(e.pointerId);
        set({ type: "move", start: p, origs: objects.filter((o) => sel.includes(o.id)), committed: false, reclick });
      } else {
        const base = e.shiftKey ? s.selection : [];
        s.select(base);
        s.setEditing(null);
        // Rubber-band selection (mouse/pen only: touch drags scroll the page).
        if (e.pointerType !== "touch") {
          e.preventDefault(); // no native drag/text selection (Firefox would cancel the pointer)
          ref.current!.setPointerCapture(e.pointerId);
          set({ type: "marquee", start: p, cur: p, base });
        }
      }
      return;
    }

    // With the text tool, clicking existing text edits it rather than stacking a new box.
    if (tool === "text") {
      const t = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.kind === "text") as HTMLElement | undefined;
      if (t) { e.preventDefault(); s.select([t.dataset.objId!]); s.setEditing(t.dataset.objId!); return; }
    }
    if (tool === "editText") {
      (async () => {
        const all = runs ?? (await getTextRuns(page).catch(() => []));
        const run = runAt(all, p);
        if (run) editRun(run, p);
      })();
      return;
    }

    const def = TOOL_DEFS[tool];
    ref.current!.setPointerCapture(e.pointerId);
    s.select([]);
    if (def.gesture === "box") set({ type: "box", tool, start: p, cur: p });
    else if (def.gesture === "line") set({ type: "line", tool, start: p, cur: p });
    else if (def.gesture === "ink") set({ type: "ink", points: [p] });
    else if (def.gesture === "erase") { set({ type: "erase" }); erase(e); }
    else if (def.gesture === "click") createAtPoint(tool, p);
  };

  const erase = (e: { clientX: number; clientY: number }) => {
    const hit = document.elementsFromPoint(e.clientX, e.clientY)
      .map((el) => (el as HTMLElement).closest?.("[data-obj-id]") as HTMLElement | null)
      .find((el) => el && ERASABLE.has(el.dataset.kind ?? (el.closest("[data-kind]") as HTMLElement | null)?.dataset.kind ?? ""));
    if (hit) useEditor.getState().removeObjects([hit.dataset.objId!]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gRef.current;
    if (!g) {
      if ((tool === "editText" || tool === "select") && runs) {
        const overObject = !!(e.target as HTMLElement).closest("[data-obj-id],[data-handle]");
        setHoverRun(overObject ? null : runAt(runs, toPage(e)) ?? null);
      }
      return;
    }
    const p = toPage(e);
    const s = useEditor.getState();
    const ensureCommit = (gg: { committed: boolean }) => { if (!gg.committed) { s.commit(); gg.committed = true; } };
    switch (g.type) {
      case "box": set({ ...g, cur: p }); break;
      case "marquee": {
        set({ ...g, cur: p });
        const area = normalizeBox(g.start[0], g.start[1], p[0], p[1]);
        if (area.w < 3 && area.h < 3) break;
        const hits = objects.filter((o) => intersects(o, area)).map((o) => o.id);
        s.select([...new Set([...g.base, ...hits])]);
        break;
      }
      case "line": {
        let cur = p;
        if (e.shiftKey) {
          const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
          const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          cur = [g.start[0] + len * Math.cos(a), g.start[1] + len * Math.sin(a)];
        }
        set({ ...g, cur });
        break;
      }
      case "ink": {
        const last = g.points[g.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.8 / z) set({ ...g, points: [...g.points, p] });
        break;
      }
      case "erase": erase(e); break;
      case "move": {
        const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
        if (!g.committed && Math.hypot(dx, dy) < 2 / z) return;
        ensureCommit(g);
        for (const o of g.origs) {
          const patch: Partial<EditorObject> = { x: o.x + dx, y: o.y + dy };
          if (o.kind === "line" || o.kind === "arrow") Object.assign(patch, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
          s.updateObject(o.id, patch);
        }
        break;
      }
      case "resize": {
        ensureCommit(g);
        const o = g.orig;
        const c: Pt = [o.x + o.w / 2, o.y + o.h / 2];
        const lp = rotatePt(p, c, -o.rotation);
        const local: Pt = [lp[0] - c[0], lp[1] - c[1]];
        const ax = (-g.hx * o.w) / 2, ay = (-g.hy * o.h) / 2;
        let w = g.hx ? Math.max(4, Math.abs(local[0] - ax)) : o.w;
        let h = g.hy ? Math.max(4, Math.abs(local[1] - ay)) : o.h;
        const keep = (KEEP_ASPECT.has(o.kind) ? !e.shiftKey : e.shiftKey) && g.hx && g.hy;
        if (keep) { const r = o.w / o.h; if (w / h > r) h = w / r; else w = h * r; }
        if (o.kind === "text" || o.kind === "textEdit") h = o.h; // height follows content
        const lcx = g.hx ? ax + (g.hx * w) / 2 : 0;
        const lcy = g.hy ? ay + (g.hy * h) / 2 : 0;
        const nc = rotatePt([c[0] + lcx, c[1] + lcy], c, o.rotation);
        const patch: Partial<EditorObject> = { x: nc[0] - w / 2, y: nc[1] - h / 2, w, h };
        if ((o.kind === "text" || o.kind === "textEdit") && g.hx === 0) return;
        s.updateObject(g.id, patch);
        break;
      }
      case "rotate": {
        ensureCommit(g);
        const o = g.orig;
        const c: Pt = [o.x + o.w / 2, o.y + o.h / 2];
        let deg = (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI + 90;
        deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.abs(deg % 90) < 4 ? Math.round(deg / 90) * 90 : deg;
        s.updateObject(g.id, { rotation: Math.round(cssRotateDeg(deg) * 10) / 10 });
        break;
      }
      case "lineEnd": {
        ensureCommit(g);
        const f = findObject(s.objects, g.id);
        if (!f || (f.obj.kind !== "line" && f.obj.kind !== "arrow")) return;
        const o = f.obj;
        const [x1, y1, x2, y2] = g.which === 1 ? [p[0], p[1], o.x2, o.y2] : [o.x1, o.y1, p[0], p[1]];
        s.updateObject(g.id, { x1, y1, x2, y2, ...lineBox(x1, y1, x2, y2) });
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gRef.current;
    set(null);
    if (!g) return;
    try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const st = useEditor.getState().style;
    if (g.type === "move" && !g.committed && g.reclick) {
      useEditor.getState().setEditing(g.reclick);
      return;
    }
    if (g.type === "box") {
      const b = normalizeBox(g.start[0], g.start[1], g.cur[0], g.cur[1]);
      const click = b.w < 4 && b.h < 4;
      createFromBox(g.tool, click ? { x: g.start[0], y: g.start[1], w: 0, h: 0 } : b, click, e.shiftKey);
    } else if (g.type === "line") {
      const [x1, y1] = g.start;
      let [x2, y2] = g.cur;
      if (Math.hypot(x2 - x1, y2 - y1) < 4) { x2 = x1 + 100; y2 = y1; }
      add({ id: uid("o"), kind: g.tool as "line" | "arrow", rotation: 0, opacity: st.opacity, x1, y1, x2, y2, stroke: st.stroke, strokeWidth: st.strokeWidth, ...lineBox(x1, y1, x2, y2) });
      finishCreate(g.tool);
    } else if (g.type === "ink") {
      const pts = g.points;
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const pad = 0.01;
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(pad, Math.max(...xs) - x), h = Math.max(pad, Math.max(...ys) - y);
      const s = useEditor.getState();
      s.addObject(page.id, { id: uid("o"), kind: "ink", rotation: 0, opacity: st.opacity, x, y, w, h, stroke: st.stroke, strokeWidth: st.strokeWidth, strokes: [pts.map(([px, py]) => [(px - x) / w, (py - y) / h] as [number, number])] }, { select: false });
    }
  };

  const interactive = tool === "select";
  const picks = PICKS[tool];
  const stylePrompt = useEditor((s) => s.stylePrompt);
  const single = selection.length === 1 ? objects.find((o) => o.id === selection[0]) : undefined;
  const cursor = pending ? "copy" : tool === "select" ? (hoverRun ? "text" : "default") : tool === "hand" ? "grab" : tool === "editText" ? (hoverRun ? "text" : "default") : tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair";

  return (
    <div
      ref={ref}
      className="absolute inset-0 touch-none"
      style={{ cursor, touchAction: tool === "hand" || tool === "select" ? "pan-x pan-y pinch-zoom" : "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHoverRun(null)}
      onDoubleClick={onDoubleClick}
      data-page-layer={page.id}
    >
      {objects.map((o) => (
        <ObjectView key={o.id} obj={o} z={z} selected={selection.includes(o.id)} editing={editingId === o.id} redactPreview={redactPreview} interactive={interactive || !!picks?.includes(o.kind) || editingId === o.id} />
      ))}

      {tool === "select" && hoverRun && (
        <div className="pointer-events-none absolute rounded-[2px]" style={{ left: hoverRun.box.x * z - 2, top: hoverRun.box.y * z - 1, width: hoverRun.box.w * z + 4, height: hoverRun.box.h * z + 2, outline: "1px dashed rgb(12 122 100 / .55)" }} title="Double-click to edit" />
      )}
      {tool === "editText" && runs?.map((r, i) => (
        <div key={i} className="pointer-events-none absolute rounded-[2px] transition-colors" style={{ left: r.box.x * z, top: r.box.y * z, width: r.box.w * z, height: r.box.h * z, outline: hoverRun === r ? "1.5px solid var(--accent)" : "1px dashed rgb(12 122 100 / .35)", background: hoverRun === r ? "rgb(12 122 100 / .08)" : undefined }} />
      ))}

      {selection.filter((id) => id !== single?.id).map((id) => {
        const o = objects.find((x) => x.id === id);
        return o ? <div key={id} className="pointer-events-none absolute outline outline-1 outline-accent" style={{ left: o.x * z, top: o.y * z, width: o.w * z, height: o.h * z, transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined }} /> : null;
      })}
      {single && tool === "select" && editingId !== single.id && <SelectionHandles obj={single} z={z} />}
      {tool === "select" && !editingId && !gesture && <QuickActions objects={objects.filter((o) => selection.includes(o.id))} z={z} />}
      {stylePrompt && objects.some((o) => o.id === stylePrompt.id) && <StyleChoice prompt={stylePrompt} obj={objects.find((o) => o.id === stylePrompt.id) as TextEditObject} z={z} />}

      {gesture && <Draft g={gesture} z={z} />}
    </div>
  );
}

const EMPTY: EditorObject[] = [];

function SelectionHandles({ obj, z }: { obj: EditorObject; z: number }) {
  if (obj.kind === "line" || obj.kind === "arrow") {
    return (
      <>
        {([[obj.x1, obj.y1, "p1"], [obj.x2, obj.y2, "p2"]] as const).map(([x, y, h]) => (
          <div key={h} data-handle={h} data-for={obj.id} className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-accent bg-white shadow before:absolute before:-inset-2 before:content-['']" style={{ left: x * z, top: y * z }} />
        ))}
      </>
    );
  }
  const isText = obj.kind === "text" || obj.kind === "textEdit";
  const small = obj.w * z < 24 || obj.h * z < 24;
  return (
    <div className="pointer-events-none absolute outline-[1.5px] outline-accent outline" style={{ left: obj.x * z, top: obj.y * z, width: obj.w * z, height: obj.h * z, transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined }}>
      {!obj.locked && HANDLES.filter(([hx, hy]) => (isText ? hy === 0 && hx !== 0 : !small || (hx !== 0 && hy !== 0))).map(([hx, hy]) => (
        <div
          key={`${hx},${hy}`}
          data-handle={`${hx},${hy}`}
          data-for={obj.id}
          className="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-[1.5px] border-accent bg-white shadow-sm before:absolute before:-inset-1.5 before:content-['']"
          // Text boxes keep their side handles just outside the text so clicks on words still reach the text.
          style={{ left: isText ? `calc(${(hx + 1) * 50}% + ${hx * 5}px)` : `${(hx + 1) * 50}%`, top: `${(hy + 1) * 50}%`, cursor: hx === 0 ? "ns-resize" : hy === 0 ? "ew-resize" : hx === hy ? "nwse-resize" : "nesw-resize" }}
        />
      ))}
      {!obj.locked && obj.kind !== "note" && (
        <>
          <div className="absolute left-1/2 h-4 w-px -translate-x-1/2 bg-accent" style={{ top: -16 }} />
          <div data-handle="rotate" data-for={obj.id} title="Rotate (Shift snaps to 15°)" className="pointer-events-auto absolute left-1/2 size-3.5 -translate-x-1/2 cursor-grab rounded-full border-[1.5px] border-accent bg-white shadow-sm before:absolute before:-inset-2 before:content-['']" style={{ top: -23 }} />
        </>
      )}
    </div>
  );
}

function Draft({ g, z }: { g: Gesture; z: number }) {
  const st = useEditor.getState().style;
  if (g.type === "marquee") {
    const b = normalizeBox(g.start[0], g.start[1], g.cur[0], g.cur[1]);
    if (b.w < 3 && b.h < 3) return null;
    return <div className="pointer-events-none absolute rounded-[2px] border border-accent bg-accent/10" style={{ left: b.x * z, top: b.y * z, width: b.w * z, height: b.h * z }} />;
  }
  if (g.type === "box") {
    const b = normalizeBox(g.start[0], g.start[1], g.cur[0], g.cur[1]);
    const isEllipse = g.tool === "ellipse";
    const color = g.tool === "highlight" ? st.highlight : g.tool === "redact" ? "#d0312d" : g.tool === "whiteout" ? "#94a3b8" : "var(--accent)";
    return <div className="pointer-events-none absolute border-[1.5px] border-dashed" style={{ left: b.x * z, top: b.y * z, width: b.w * z, height: b.h * z, borderColor: color, borderRadius: isEllipse ? "50%" : 2, background: g.tool === "highlight" ? `${st.highlight}66` : g.tool === "whiteout" ? st.whiteout : undefined }} />;
  }
  if (g.type === "line") {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <line x1={g.start[0] * z} y1={g.start[1] * z} x2={g.cur[0] * z} y2={g.cur[1] * z} stroke={st.stroke} strokeWidth={st.strokeWidth * z} strokeLinecap="round" />
      </svg>
    );
  }
  if (g.type === "ink") {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <polyline points={g.points.map(([x, y]) => `${x * z},${y * z}`).join(" ")} fill="none" stroke={st.stroke} strokeWidth={st.strokeWidth * z} strokeOpacity={st.opacity} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return null;
}

/** Small floating toolbar above the selection: the most common actions, one click away. */
function QuickActions({ objects, z }: { objects: EditorObject[]; z: number }) {
  if (!objects.length) return null;
  const s = useEditor.getState();
  const x1 = Math.min(...objects.map((o) => o.x)), y1 = Math.min(...objects.map((o) => o.y));
  const x2 = Math.max(...objects.map((o) => o.x + o.w)), y2 = Math.max(...objects.map((o) => o.y + o.h));
  const one = objects.length === 1 ? objects[0] : undefined;
  const editable = one && isTextLike(one) ? one : undefined;
  const differs = one?.kind === "textEdit" && styleDiff(one).length > 0;
  const above = y1 * z > 52;
  const btn = "flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink [&_svg]:size-4";
  return (
    <div
      data-quick-actions
      className="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-lg animate-pop"
      style={{ left: ((x1 + x2) / 2) * z, top: above ? y1 * z - 46 : y2 * z + 30 }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Selection actions"
    >
      {editable && <button className={btn} onClick={() => s.setEditing(editable.id)}><PencilLine /> Edit</button>}
      {differs && <button className={btn} title="Restore the font, size and colour of the original text" onClick={() => applyOriginalStyle(one as TextEditObject)}><Wand2 /> Match original</button>}
      <button className={btn} title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={() => s.duplicateObjects(objects.map((o) => o.id))}><Copy /></button>
      <button className={`${btn} hover:text-danger`} title="Delete (Del)" aria-label="Delete" onClick={() => s.removeObjects(objects.map((o) => o.id))}><Trash2 /></button>
    </div>
  );
}
