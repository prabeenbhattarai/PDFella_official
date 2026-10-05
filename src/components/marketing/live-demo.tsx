"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MousePointer2, TextCursor, Highlighter, Signature, SquareSlash, Shapes, StickyNote, Undo2, Redo2, Check,
  ArrowRight, ScanText, LayoutGrid, FileOutput, Minimize2, Search, RotateCw, Loader2,
} from "lucide-react";
import { handoff } from "@/lib/storage/local";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   A scripted, animated mock of the editor working on a real-looking document.
   Everything is drawn in a fixed 760×500 "stage" coordinate system and scaled
   to the container, so the cursor choreography is exact at any size.
   ────────────────────────────────────────────────────────────────────────── */

export type SceneId = "edit" | "highlight" | "sign" | "redact" | "annotate" | "organise" | "ocr" | "convert" | "compress";

const SCENES: { id: SceneId; label: string; icon: typeof TextCursor; dur: number; caption: string }[] = [
  { id: "edit", label: "Edit text", icon: TextCursor, dur: 6200, caption: "Double-click any text and type. The original is replaced in the PDF" },
  { id: "highlight", label: "Highlight", icon: Highlighter, dur: 5200, caption: "Highlights snap to the line of text you drag across" },
  { id: "sign", label: "Sign", icon: Signature, dur: 6000, caption: "Draw, type or upload your signature" },
  { id: "redact", label: "Redact", icon: SquareSlash, dur: 6000, caption: "Redacted text is removed from the file, not just hidden" },
  { id: "annotate", label: "Annotate", icon: StickyNote, dur: 6400, caption: "Arrows, shapes, comments and stamps" },
  { id: "organise", label: "Organise", icon: LayoutGrid, dur: 5600, caption: "Drag pages to reorder, rotate or delete them" },
  { id: "ocr", label: "OCR", icon: ScanText, dur: 6000, caption: "Scanned pages become searchable, selectable text" },
  { id: "convert", label: "Convert", icon: FileOutput, dur: 5600, caption: "Convert to Word, Excel, PowerPoint or images" },
  { id: "compress", label: "Compress", icon: Minimize2, dur: 5200, caption: "Smaller files, same readable document" },
];

// ── stage geometry
const W = 760, H = 500;
const TOP = 40, RAIL = 64, PANEL = 170;
const PAGE_W = 330, PAGE_H = 430;
const PAGE_X = RAIL + (W - RAIL - PANEL - PAGE_W) / 2, PAGE_Y = TOP + 16;
const PAD = 26;
const LINE = { title: 26, meta: 54, p1: 84, p2: 102, p3: 120, p4: 138, sigLabel: 344, sig: 354 };
const RAIL_TOOLS = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "edit", label: "Edit text", icon: TextCursor },
  { id: "markup", label: "Markup", icon: Highlighter },
  { id: "sign", label: "Sign", icon: Signature },
  { id: "redact", label: "Redact", icon: SquareSlash },
  { id: "shapes", label: "Shapes", icon: Shapes },
  { id: "comment", label: "Comment", icon: StickyNote },
] as const;
const railPt = (id: string): Pt => [RAIL / 2, TOP + 12 + RAIL_TOOLS.findIndex((t) => t.id === id) * 50 + 22];
const SAVE: Pt = [W - 64, TOP / 2];
const PANEL_BTN: Pt = [W - PANEL / 2, H - 34];

type Pt = [number, number];
type Box = { x: number; y: number; w: number; h: number };

// ── timing helpers
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const prog = (t: number, start: number, dur: number) => clamp01((t - start) / dur);
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const fade = (t: number, at: number, d = 300) => ease(prog(t, at, d));

/** Cursor position from a list of [time, point] waypoints. */
function follow(t: number, way: [number, Pt][]): Pt {
  if (!way.length) return [W / 2, H / 2];
  if (t <= way[0][0]) return way[0][1];
  for (let i = 1; i < way.length; i++) {
    const [t1, p1] = way[i];
    const [t0, p0] = way[i - 1];
    if (t <= t1) {
      const p = ease(prog(t, t0, t1 - t0));
      return [lerp(p0[0], p1[0], p), lerp(p0[1], p1[1], p)];
    }
  }
  return way[way.length - 1][1];
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduce;
}

const SIG_PATH = "M6 30 C 14 6, 22 4, 24 18 S 22 36, 34 22 S 46 4, 52 16 S 54 34, 64 24 C 72 16, 78 10, 84 20 S 92 32, 104 18 C 112 10, 120 14, 126 22 L 144 12";

export function LiveDemo({ only, className }: { only?: SceneId; className?: string }) {
  const router = useRouter();
  const scenes = only ? SCENES.filter((s) => s.id === only) : SCENES;
  const [index, setIndex] = useState(0);
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(1);
  const [visible, setVisible] = useState(false);
  const [opening, setOpening] = useState(false);
  const reduce = usePrefersReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const tRef = useRef(0);
  const spans = useRef<Record<string, HTMLElement | null>>({});
  const sigPath = useRef<SVGPathElement>(null);
  const [inline, setInline] = useState<Record<string, Box>>({});

  const scene = scenes[index];

  // Scale the fixed stage to the container width.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure inline targets (offset* ignores transforms, so this is exact in stage units).
  const measure = useCallback(() => {
    const out: Record<string, Box> = {};
    for (const [id, el] of Object.entries(spans.current)) {
      if (!el) continue;
      // Sum offsets up to the page element (offsets ignore CSS transforms, unlike getBoundingClientRect).
      let x = 0, y = 0;
      let node: HTMLElement | null = el;
      while (node && !node.dataset.demoPage) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      out[id] = { x: PAGE_X + x, y: PAGE_Y + y, w: el.offsetWidth, h: el.offsetHeight };
    }
    setInline(out);
  }, []);
  useLayoutEffect(() => {
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
  }, [measure]);

  // Only animate while on screen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Animation clock.
  useEffect(() => {
    if (reduce) { setT(scene.dur - 1); return; }
    if (!visible) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      tRef.current += now - last;
      last = now;
      if (tRef.current >= scene.dur) {
        tRef.current = 0;
        setIndex((i) => (i + 1) % scenes.length);
      }
      setT(tRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, reduce, scene.dur, scenes.length]);

  const go = (i: number) => { tRef.current = 0; setT(0); setIndex(i); };

  const trySample = async () => {
    setOpening(true);
    try {
      const bytes = new Uint8Array(await (await fetch("/samples/agreement.pdf")).arrayBuffer());
      await handoff.put([{ name: "agreement.pdf", type: "application/pdf", bytes }]);
      router.push("/editor");
    } catch {
      setOpening(false);
    }
  };

  const reg = (id: string) => (el: HTMLElement | null) => { spans.current[id] = el; };
  const box = (id: string): Box => inline[id] ?? { x: PAGE_X + PAD, y: PAGE_Y + 100, w: 40, h: 12 };
  const centre = (id: string, fx = 0.5, fy = 0.5): Pt => { const b = box(id); return [b.x + b.w * fx, b.y + b.h * fy]; };
  const sigOrigin: Pt = [PAGE_X + PAD, PAGE_Y + LINE.sig];

  // ── per-scene state derived from t
  const s = scene.id;
  let cursor: Pt = [W / 2, H / 2];
  let clicks: number[] = [];
  let activeTool: string = "select";
  let cursorShown = true;
  let chipAt = 3000;

  // Edit
  const word = s === "edit" ? (t < 1900 ? "60" : t < 2100 ? "" : t < 2300 ? "3" : "30") : s === "compress" || s === "convert" ? "30" : "60";
  const editing = s === "edit" && t >= 1150 && t < 3000;
  const selected = s === "edit" && t >= 1150 && t < 1900;
  // Highlight
  const hl = s === "highlight" ? ease(prog(t, 1400, 1200)) : 0;
  // Sign
  const sigP = s === "sign" ? prog(t, 1400, 2000) : s === "compress" || s === "convert" ? 1 : 0;
  // Redact
  const redP = s === "redact" ? ease(prog(t, 1400, 800)) : 0;
  const redSolid = s === "redact" && t >= 3100;
  // Annotate
  const arrowP = s === "annotate" ? ease(prog(t, 700, 800)) : 0;
  const circleP = s === "annotate" ? ease(prog(t, 1600, 700)) : 0;
  const noteP = s === "annotate" ? fade(t, 2900, 350) : 0;
  const stampP = s === "annotate" ? fade(t, 3700, 350) : 0;
  // OCR
  const scanP = s === "ocr" ? prog(t, 900, 2200) : 1;
  const query = s === "ocr" ? "account".slice(0, Math.max(0, Math.floor((t - 3300) / 70))) : "";
  // Convert / compress
  const shrink = s === "convert" ? ease(prog(t, 700, 700)) : 0;
  const sizeP = s === "compress" ? ease(prog(t, 1000, 2000)) : 0;

  switch (s) {
    case "edit":
      cursor = follow(t, [[0, railPt("select")], [900, centre("word60")], [3000, centre("word60")], [3600, [centre("word60")[0] + 90, centre("word60")[1] + 60]]]);
      clicks = [1000, 1180];
      chipAt = 3000;
      break;
    case "highlight": {
      const b = box("line3");
      cursor = follow(t, [[0, railPt("select")], [650, railPt("markup")], [1300, [b.x, b.y + b.h / 2]]]);
      if (t >= 1400) cursor = [b.x + b.w * hl, b.y + b.h / 2];
      clicks = [700];
      activeTool = t >= 700 ? "markup" : "select";
      chipAt = 2700;
      break;
    }
    case "sign": {
      cursor = follow(t, [[0, railPt("select")], [650, railPt("sign")], [1300, [sigOrigin[0] + 6, sigOrigin[1] + 30]]]);
      if (t >= 1400 && sigPath.current) {
        const len = sigPath.current.getTotalLength();
        const pt = sigPath.current.getPointAtLength(len * sigP);
        cursor = [sigOrigin[0] + pt.x, sigOrigin[1] + pt.y];
      }
      clicks = [700];
      activeTool = t >= 700 ? "sign" : "select";
      chipAt = 3500;
      break;
    }
    case "redact": {
      const b = box("acct");
      cursor = follow(t, [[0, railPt("select")], [650, railPt("redact")], [1300, [b.x - 2, b.y]], [1400, [b.x - 2, b.y]], [2200, [b.x + b.w + 2, b.y + b.h]], [2400, [b.x + b.w + 2, b.y + b.h]], [3000, SAVE]]);
      clicks = [700, 3100];
      activeTool = t >= 700 ? "redact" : "select";
      chipAt = 3300;
      break;
    }
    case "annotate": {
      const f = centre("fee");
      const arrowStart: Pt = [PAGE_X + PAGE_W - 40, PAGE_Y + 190];
      cursor = follow(t, [[0, railPt("select")], [550, railPt("shapes")], [700, arrowStart], [1500, [f[0] + 30, f[1] + 8]], [1600, [f[0] + 30, f[1]]], [2300, [f[0] + 30, f[1]]], [2650, railPt("comment")], [2900, [PAGE_X + PAGE_W - 74, PAGE_Y + 262]]]);
      clicks = [600, 2700, 2900];
      activeTool = t >= 2700 ? "comment" : t >= 600 ? "shapes" : "select";
      chipAt = 4100;
      break;
    }
    case "organise":
      cursor = follow(t, [[0, [PAGE_X + 100, PAGE_Y + 40]], [800, thumbCentre(2)], [900, thumbCentre(2)], [1700, thumbCentre(0)], [2400, [thumbCentre(1)[0] + 30, thumbCentre(1)[1] - 52]]]);
      clicks = [900, 2600];
      chipAt = 3500;
      break;
    case "ocr":
      cursor = follow(t, [[0, [W - 120, H - 140]], [700, PANEL_BTN]]);
      clicks = [800];
      cursorShown = t < 1200;
      chipAt = 3700;
      break;
    case "convert":
      cursor = follow(t, [[0, [W - 120, H - 140]], [600, PANEL_BTN]]);
      clicks = [650];
      cursorShown = t < 1000;
      chipAt = 3400;
      break;
    case "compress":
      cursor = follow(t, [[0, [W - 120, H - 160]], [700, PANEL_BTN]]);
      clicks = [800];
      cursorShown = t < 1200;
      chipAt = 3100;
      break;
  }
  if (reduce) cursorShown = false;
  const clickRing = clicks.map((c) => prog(t, c, 380)).find((p) => p > 0 && p < 1);

  return (
    <div className={cn("w-full", className)}>
      {!only && (
        <div className="mb-4 flex flex-wrap items-center justify-center gap-1.5" role="tablist" aria-label="Demo scenes">
          {scenes.map((sc, i) => {
            const Icon = sc.icon;
            const active = i === index;
            return (
              <button key={sc.id} role="tab" aria-selected={active} onClick={() => go(i)}
                className={cn("relative flex items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-[13px] font-medium transition", active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink")}>
                <Icon className="size-3.5" aria-hidden /> {sc.label}
                {active && !reduce && <span className="absolute bottom-0 left-0 h-0.5 bg-accent" style={{ width: `${(t / sc.dur) * 100}%` }} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}

      <div ref={wrap} className="relative w-full overflow-hidden rounded-2xl border border-border shadow-lg" style={{ height: H * scale }} aria-label={`Demo: ${scene.caption}`} role="img">
        <div className="absolute top-0 left-0 origin-top-left select-none" style={{ width: W, height: H, transform: `scale(${scale})` }} aria-hidden>
          {/* ── editor chrome */}
          <div className="absolute inset-0 bg-workspace" />
          <div className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-border bg-surface px-3" style={{ height: TOP }}>
            <span className="size-5 rounded-md bg-accent" />
            <span className="text-[12px] font-medium text-ink">agreement.pdf</span>
            <span className={cn("size-1.5 rounded-full", t > 1200 && s !== "organise" ? "bg-warn" : "bg-ok")} />
            <Undo2 className="ml-2 size-3.5 text-ink-3" /><Redo2 className="size-3.5 text-ink-3" />
            <span className={cn("ml-auto flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-ink transition", s === "redact" && t >= 3100 && t < 3500 && "scale-95 ring-4 ring-accent/30")}>
              <Check className="size-3" /> Save changes
            </span>
          </div>
          <div className="absolute left-0 border-r border-border bg-surface" style={{ top: TOP, width: RAIL, bottom: 0 }}>
            {RAIL_TOOLS.map((tool, i) => {
              const Icon = tool.icon;
              const on = activeTool === tool.id && !["organise", "ocr", "convert", "compress"].includes(s);
              return (
                <div key={tool.id} className={cn("absolute left-1.5 flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors", on ? "bg-accent-soft text-accent" : "text-ink-3")} style={{ top: 12 + i * 50, width: RAIL - 12, height: 44 }}>
                  <Icon className="size-4" />
                  <span className="text-[8.5px] font-medium">{tool.label}</span>
                </div>
              );
            })}
          </div>
          <Panel scene={s} t={t} sizeP={sizeP} scanP={scanP} />

          {/* ── the document */}
          {s === "organise" ? (
            <Organise t={t} />
          ) : (
            <div data-demo-page="1" className="absolute rounded-[3px] bg-white shadow-[0_2px_8px_rgb(0_0_0/.12),0_12px_32px_-12px_rgb(0_0_0/.25)]"
              style={{ left: PAGE_X, top: PAGE_Y, width: PAGE_W, height: PAGE_H, transform: s === "convert" ? `translateX(${-118 * shrink}px) scale(${1 - 0.42 * shrink})` : s === "ocr" && scanP < 1 ? "rotate(-0.6deg)" : undefined, transformOrigin: "center", filter: s === "ocr" && scanP < 1 ? "sepia(.35)" : undefined }}>
              <PageText reg={reg} word={word} selected={selected} editing={editing} t={t} scan={s === "ocr" ? scanP : 1} />

              {/* highlight */}
              {hl > 0 && <div className="absolute rounded-[1px] mix-blend-multiply" style={{ left: PAD - 1, top: LINE.p3 - 1, height: 13, width: (box("line3").w + 2) * hl, background: "#ffe14d" }} />}
              {/* redaction */}
              {redP > 0 && (
                <div className="absolute" style={{
                  left: box("acct").x - PAGE_X - 1, top: box("acct").y - PAGE_Y - 1, height: box("acct").h + 2, width: (box("acct").w + 2) * redP,
                  background: redSolid ? "#000" : "repeating-linear-gradient(45deg, rgba(208,49,45,.25) 0 5px, rgba(208,49,45,.08) 5px 10px)",
                  border: redSolid ? "none" : "1.5px solid #d0312d",
                }} />
              )}
              {/* annotations */}
              {arrowP > 0 && (
                <svg className="absolute inset-0 overflow-visible" width={PAGE_W} height={PAGE_H}>
                  {(() => {
                    const f = box("fee");
                    const x1 = PAGE_W - 40, y1 = 190, x2 = f.x - PAGE_X + f.w + 34, y2 = f.y - PAGE_Y + f.h + 2;
                    const len = Math.hypot(x2 - x1, y2 - y1);
                    const a = Math.atan2(y2 - y1, x2 - x1);
                    return (
                      <>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d0312d" strokeWidth={2} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - arrowP)} />
                        {arrowP > 0.95 && <path d={`M${x2} ${y2} L${x2 - 9 * Math.cos(a - 0.45)} ${y2 - 9 * Math.sin(a - 0.45)} L${x2 - 9 * Math.cos(a + 0.45)} ${y2 - 9 * Math.sin(a + 0.45)} Z`} fill="#d0312d" />}
                        {circleP > 0 && (
                          <ellipse cx={f.x - PAGE_X + f.w / 2} cy={f.y - PAGE_Y + f.h / 2} rx={f.w / 2 + 8} ry={f.h / 2 + 5} fill="none" stroke="#d0312d" strokeWidth={1.8}
                            strokeDasharray={200} strokeDashoffset={200 * (1 - circleP)} />
                        )}
                      </>
                    );
                  })()}
                </svg>
              )}
              {noteP > 0 && (
                <div className="absolute w-[120px] rounded-md border border-yellow-300 bg-yellow-100 p-2 text-[8.5px] leading-snug text-neutral-800 shadow-md" style={{ right: 14, top: 254, opacity: noteP, transform: `scale(${0.85 + 0.15 * noteP})`, transformOrigin: "top right" }}>
                  <p className="font-semibold">Alex · just now</p>Can we confirm the fee before signing?
                </div>
              )}
              {stampP > 0 && (
                <div className="absolute rounded-md border-[2.5px] border-[#2e9e5b] px-2.5 py-0.5 text-[13px] font-black tracking-widest text-[#2e9e5b]" style={{ right: 22, top: 330, opacity: stampP, transform: `rotate(-8deg) scale(${1.6 - 0.6 * stampP})` }}>APPROVED</div>
              )}
              {/* signature */}
              <svg className="absolute overflow-visible" style={{ left: PAD, top: LINE.sig }} width={150} height={40}>
                <path ref={sigPath} d={SIG_PATH} fill="none" stroke="#1f3a8a" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sigP} />
              </svg>
              {s === "sign" && t > 700 && t < 1400 && <div className="absolute rounded border-[1.5px] border-dashed border-accent" style={{ left: PAD - 4, top: LINE.sig - 4, width: 158, height: 46 }} />}
              <span className="absolute text-[7.5px] text-neutral-500 transition-opacity" style={{ left: PAD + 190, top: LINE.sig + 24, opacity: s === "sign" ? fade(t, 3500) : sigP >= 1 ? 1 : 0 }}>5 October 2026</span>

              {/* OCR scan line + search hits */}
              {s === "ocr" && scanP > 0 && scanP < 1 && <div className="absolute inset-x-0 h-[2px] bg-accent shadow-[0_0_14px_3px_var(--accent)]" style={{ top: scanP * PAGE_H }} />}
              {s === "ocr" && query.length >= 7 && (
                <div className="absolute rounded-[1px] bg-[#ff9d2e] mix-blend-multiply" style={{ left: box("acctWord").x - PAGE_X - 1, top: box("acctWord").y - PAGE_Y - 1, width: box("acctWord").w + 2, height: box("acctWord").h + 2 }} />
              )}
            </div>
          )}

          {s === "ocr" && t >= 3100 && (
            <div className="absolute flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-ink shadow-md" style={{ left: PAGE_X + PAGE_W - 150, top: TOP + 8, width: 170, opacity: fade(t, 3100) }}>
              <Search className="size-3 text-ink-3" />{query}<span className="h-3 w-px animate-pulse bg-ink" />
              {query.length >= 7 && <span className="ml-auto text-[10px] text-ink-3">1 of 1</span>}
            </div>
          )}

          {s === "convert" && <ConvertCards t={t} />}

          {/* caption chip */}
          <div className="absolute flex justify-center px-4" style={{ left: RAIL, right: PANEL, bottom: 14, opacity: fade(t, chipAt), transform: `translateY(${(1 - fade(t, chipAt)) * 8}px)` }}>
            <div className="flex max-w-full items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-center text-[11px] leading-snug font-medium text-bg shadow-lg">
              <Check className="size-3 shrink-0 text-accent" /> {scene.caption}
            </div>
          </div>

          {/* cursor */}
          {cursorShown && (
            <div className="absolute" style={{ left: cursor[0], top: cursor[1] }}>
              {clickRing !== undefined && <span className="absolute -top-4 -left-4 size-8 rounded-full border-2 border-accent" style={{ opacity: 1 - clickRing, transform: `scale(${0.4 + clickRing})` }} />}
              <svg width="18" height="22" viewBox="0 0 18 22" className="drop-shadow-md" style={{ transform: "translate(-2px,-1px)" }}>
                <path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.7 L9.6 11.9 L15.5 11.9 Z" fill="#15171c" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {!only && (
        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <p className="text-[15px] font-medium text-ink-2" aria-live="polite">{scene.caption}.</p>
          <button onClick={trySample} disabled={opening} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline disabled:opacity-60">
            {opening ? <Loader2 className="size-4 animate-spin" /> : null} Try it with this sample PDF <ArrowRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── document text (positioned absolutely so layout is deterministic) */
function PageText({ reg, word, selected, editing, t, scan }: { reg: (id: string) => (el: HTMLElement | null) => void; word: string; selected: boolean; editing: boolean; t: number; scan: number }) {
  const line = (top: number, children: React.ReactNode, extra?: string) => (
    <div className={cn("absolute whitespace-nowrap text-[8.6px] text-neutral-800", extra)} style={{ left: PAD, top }}>{children}</div>
  );
  const body = (
    <>
      <div className="absolute text-[17px] font-bold tracking-tight text-neutral-900" style={{ left: PAD, top: LINE.title }}>Service Agreement</div>
      <div className="absolute text-[7.5px] text-neutral-500" style={{ left: PAD, top: LINE.meta }}>Acme Studio Ltd · Northwind Traders · 5 October 2026</div>
      <div className="absolute h-px bg-neutral-200" style={{ left: PAD, right: PAD, top: 70 }} />
      {line(LINE.p1, <>1. Scope: design and delivery of a complete brand identity.</>)}
      {line(LINE.p2, (
        <span className={cn("relative inline-block rounded-[2px] px-[1px] transition-shadow", editing && "shadow-[0_0_0_1.5px_var(--accent)]")}>
          2. Payment terms:{" "}
          <span ref={reg("word60")} className="relative inline-block min-w-[9px]">
            {selected && <span className="absolute -inset-x-px inset-y-0 rounded-[1px] bg-[#0c7a6455]" />}
            <span className="relative">{word}</span>
            {editing && !selected && <span className="absolute top-0 -right-px h-full w-px bg-neutral-900" style={{ opacity: Math.floor(t / 400) % 2 ? 0 : 1 }} />}
          </span>{" "}
          days from the date of invoice.
        </span>
      ))}
      {line(LINE.p3, <span ref={reg("line3")}>3. Fee: <span ref={reg("fee")}>£12,400</span> payable in two equal instalments.</span>)}
      {line(LINE.p4, <>4. Bank <span ref={reg("acctWord")}>account</span>: <span ref={reg("acct")}>4401-2290-1187</span> (Northwind Traders).</>)}
      {[168, 182, 196, 210, 224].map((y, i) => <div key={y} className="absolute h-[5px] rounded-full bg-neutral-200" style={{ left: PAD, top: y, width: `${[86, 92, 78, 88, 60][i]}%` }} />)}
      <div className="absolute overflow-hidden rounded-[3px]" style={{ left: PAD, right: PAD, top: 244, height: 78, background: "linear-gradient(135deg,#cfe7df 0%,#9cc9bd 45%,#5d8f86 100%)" }}>
        <div className="absolute bottom-0 left-[18%] h-10 w-16 rounded-t-full bg-[#4f7d74]/70" />
        <div className="absolute bottom-0 left-[44%] h-14 w-24 rounded-t-full bg-[#3f6b63]/70" />
        <div className="absolute top-3 right-6 size-5 rounded-full bg-[#fff6d5]/90" />
      </div>
      <div className="absolute text-[7.5px] text-neutral-500" style={{ left: PAD, top: LINE.sigLabel }}>Signed for Northwind Traders</div>
      <div className="absolute h-px bg-neutral-400" style={{ left: PAD, top: LINE.sig + 40, width: 160 }} />
      <div className="absolute h-px bg-neutral-400" style={{ left: PAD + 190, top: LINE.sig + 40, width: 90 }} />
    </>
  );
  if (scan >= 1) return body;
  // OCR: a blurry "scan" with the crisp text layer revealed behind the scan line.
  return (
    <>
      <div className="absolute inset-0" style={{ filter: "blur(0.7px)", opacity: 0.75 }}>{body}</div>
      <div className="absolute inset-0 bg-white" style={{ clipPath: `inset(0 0 ${(1 - scan) * 100}% 0)` }}>{body}</div>
    </>
  );
}

/* ── organise: thumbnails reordered by drag, then one rotated */
const THUMB_W = 92, THUMB_H = 122, THUMB_GAP = 16;
const thumbsLeft = RAIL + (W - RAIL - PANEL - (4 * THUMB_W + 3 * THUMB_GAP)) / 2;
const THUMB_Y = TOP + 150;
function thumbX(slot: number) { return thumbsLeft + slot * (THUMB_W + THUMB_GAP); }
function thumbCentre(slot: number): Pt { return [thumbX(slot) + THUMB_W / 2, THUMB_Y + THUMB_H / 2]; }

function Organise({ t }: { t: number }) {
  // Page 3 (index 2) is dragged to the front; the others shift right. Then page 1 is rotated.
  const drag = ease(prog(t, 900, 800));
  const shift = ease(prog(t, 1250, 450));
  const rot = ease(prog(t, 2700, 500)) * 90;
  const before = [0, 1, 2, 3], after = [1, 2, 0, 3]; // slot of each page
  return (
    <>
      <div className="absolute text-[11px] font-medium text-ink-2" style={{ left: thumbsLeft, top: TOP + 110 }}>Pages · drag to reorder</div>
      {before.map((_, page) => {
        const x = page === 2 ? lerp(thumbX(2), thumbX(0), drag) : lerp(thumbX(before[page]), thumbX(after[page]), shift);
        const lifted = page === 2 && t > 900 && t < 1750;
        return (
          <div key={page} className="absolute flex flex-col items-center gap-1" style={{ left: x, top: THUMB_Y - (lifted ? 6 : 0), zIndex: page === 2 ? 2 : 1 }}>
            <div className={cn("rounded-[2px] bg-white p-2 shadow-sm ring-1 ring-border transition-shadow", lifted && "shadow-xl ring-2 ring-accent")}
              style={{ width: THUMB_W, height: THUMB_H, transform: page === 0 ? `rotate(${rot}deg) scale(${1 - 0.24 * (rot / 90)})` : undefined }}>
              <div className="h-1.5 w-3/5 rounded bg-neutral-700/70" />
              {[80, 92, 70, 86, 64, 90].map((w, i) => <div key={i} className="mt-1.5 h-1 rounded bg-neutral-200" style={{ width: `${w}%` }} />)}
              <div className="mt-2 h-6 rounded-sm" style={{ background: ["#cfe7df", "#f6dcc8", "#d9dcf6", "#f2e6b8"][page] }} />
            </div>
            <span className="text-[10px] font-medium text-ink-3 tabular-nums">Page {page + 1}</span>
          </div>
        );
      })}
      {t > 2300 && (
        <div className="absolute flex size-6 items-center justify-center rounded-md bg-surface shadow ring-1 ring-border" style={{ left: thumbX(1) + THUMB_W - 4 - 24 + 10, top: THUMB_Y - 30, opacity: fade(t, 2300) }}>
          <RotateCw className="size-3.5 text-ink-2" />
        </div>
      )}
    </>
  );
}

/* ── convert: the PDF becomes Word / Excel / image files */
function ConvertCards({ t }: { t: number }) {
  const files = [
    { ext: "DOCX", name: "agreement.docx", color: "#1f6feb", at: 1300 },
    { ext: "XLSX", name: "agreement.xlsx", color: "#2e9e5b", at: 1900 },
    { ext: "JPG", name: "agreement-page-1.jpg", color: "#6e40c9", at: 2500 },
  ];
  const left = PAGE_X + 120;
  return (
    <>
      <ArrowRight className="absolute size-6 text-ink-3" style={{ left: left - 14, top: PAGE_Y + PAGE_H / 2 - 12, opacity: fade(t, 1100) }} />
      {files.map((f, i) => {
        const p = prog(t, f.at + 250, 700);
        return (
          <div key={f.ext} className="absolute flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5 shadow-md" style={{ left: left + 22, top: PAGE_Y + 108 + i * 72, width: 220, opacity: fade(t, f.at), transform: `translateY(${(1 - fade(t, f.at)) * 10}px)` }}>
            <span className="flex h-10 w-8 items-center justify-center rounded-[4px] text-[8px] font-bold text-white" style={{ background: f.color }}>{f.ext}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-ink">{f.name}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: f.color }} /></div>
            </div>
            {p >= 1 ? <Check className="size-4 text-ok" /> : <Loader2 className="size-4 animate-spin text-ink-3" />}
          </div>
        );
      })}
    </>
  );
}

/* ── right-hand properties panel, mirroring the real editor */
function Panel({ scene, t, sizeP, scanP }: { scene: SceneId; t: number; sizeP: number; scanP: number }) {
  const row = (k: string, v: React.ReactNode) => <div className="flex items-center justify-between py-1 text-[10px]"><span className="text-ink-3">{k}</span><span className="font-medium text-ink">{v}</span></div>;
  const title = (s: string) => <p className="mb-2 text-[9px] font-semibold tracking-wider text-ink-3 uppercase">{s}</p>;
  const btn = (label: string, on: boolean) => (
    <div className={cn("absolute inset-x-3 flex h-8 items-center justify-center rounded-lg text-[11px] font-medium transition", on ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2")} style={{ bottom: 18 }}>{label}</div>
  );
  let body: React.ReactNode = null;
  switch (scene) {
    case "edit":
      body = <>{title("Edited text")}{row("Font", "Helvetica · matched")}{row("Size", "8.6 pt")}{row("Colour", <span className="inline-block size-3 rounded-full bg-neutral-800" />)}{row("Original", t < 2300 ? "“60 days…”" : "replaced")}</>;
      break;
    case "highlight":
      body = <>{title("Highlight")}<div className="flex gap-1.5">{["#ffe14d", "#7dd3fc", "#86efac", "#f9a8d4"].map((c, i) => <span key={c} className={cn("size-5 rounded-full", i === 0 && "ring-2 ring-accent ring-offset-2 ring-offset-surface")} style={{ background: c }} />)}</div><div className="mt-3">{row("Opacity", "55%")}{row("Snap to text", "On")}</div></>;
      break;
    case "sign":
      body = <>{title("Signature")}<div className="flex rounded-md bg-surface-2 p-0.5 text-[10px]">{["Type", "Draw", "Upload"].map((x) => <span key={x} className={cn("flex-1 rounded py-1 text-center", x === "Draw" ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-3")}>{x}</span>)}</div><div className="mt-3">{row("Ink", <span className="inline-block size-3 rounded-full bg-[#1f3a8a]" />)}{row("Stored", "This tab only")}</div></>;
      break;
    case "redact":
      body = <>{title("Redaction")}<div className="rounded-md bg-danger-soft p-2 text-[9.5px] leading-snug text-danger">Content under the box is permanently removed when you save.</div><div className="mt-3">{row("Areas marked", t > 2200 ? "1" : "0")}{row("Status", t >= 3100 ? "Applied" : "Preview")}</div></>;
      break;
    case "annotate":
      body = <>{title("Markup")}{row("Arrow", t > 1500 ? "✓" : "–")}{row("Ellipse", t > 2300 ? "✓" : "–")}{row("Comment", t > 2900 ? "✓" : "–")}{row("Stamp", t > 3700 ? "APPROVED" : "–")}</>;
      break;
    case "organise":
      body = <>{title("Pages")}{row("Pages", "4")}{row("Moved", t > 1700 ? "Page 3 → 1" : "–")}{row("Rotated", t > 3200 ? "Page 1 · 90°" : "–")}</>;
      break;
    case "ocr":
      body = <>{title("OCR")}{row("Language", "English")}<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent" style={{ width: `${scanP * 100}%` }} /></div><div className="mt-2">{row("Words found", Math.round(scanP * 1248).toLocaleString())}</div>{btn(scanP >= 1 ? "Searchable ✓" : "Run OCR", t > 800 && scanP < 1)}</>;
      break;
    case "convert":
      body = <>{title("Convert to")}{["Word (.docx)", "Excel (.xlsx)", "Images (.jpg)", "PowerPoint (.pptx)"].map((f, i) => <div key={f}>{row(f, i < 3 ? <Check className="size-3 text-accent" /> : "–")}</div>)}{btn("Convert", t > 650 && t < 1300)}</>;
      break;
    case "compress": {
      const mb = lerp(8.4, 2.1, sizeP);
      body = <>{title("Compress")}{row("Level", "Recommended")}<div className="mt-3 rounded-lg bg-surface-2 p-2.5 text-center"><p className="text-[18px] font-semibold tabular-nums text-ink">{mb.toFixed(1)} MB</p><p className="text-[9.5px] text-ink-3">from 8.4 MB{sizeP >= 1 ? " · 75% smaller" : ""}</p><div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent" style={{ width: `${sizeP * 100}%` }} /></div></div>{btn(sizeP >= 1 ? "Done ✓" : "Compress", t > 800 && sizeP < 1)}</>;
      break;
    }
  }
  return (
    <div className="absolute right-0 border-l border-border bg-surface p-3" style={{ top: TOP, width: PANEL, bottom: 0 }}>
      {body}
    </div>
  );
}
