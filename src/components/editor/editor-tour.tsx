"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, ArrowRight, Download, Eraser, Files, Highlighter, PartyPopper, Signature, SlidersHorizontal, Sparkles,
  TextCursor, Type, X, type LucideIcon,
} from "lucide-react";
import { useTouchEditing } from "@/lib/hooks/use-touch-editing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DONE_KEY = "pdfella.tour.v1";
const TIP_KEY = "pdfella.tip.dblclick";

type Side = "right" | "left" | "bottom" | "top";
interface Step {
  icon: LucideIcon;
  title: string;
  body: (touch: boolean) => string;
  /** CSS selector of the element to spotlight; none = centred card. */
  target?: string;
  side?: Side;
  /** Skip the step when its target isn't on screen (e.g. side panels on phones). */
  optional?: boolean;
}

const STEPS: Step[] = [
  { icon: Sparkles, title: "Welcome to the PDFella editor", body: () => "Take a quick tour of everything you can do here. It takes about 30 seconds, and you can skip it anytime." },
  { icon: TextCursor, title: "Edit the text in your PDF", target: '[data-tour="tool-editText"]', side: "right", body: (t) => `${t ? "Tap" : "Double-click"} any word or sentence to change it, or pick Edit text. Your new text keeps the original font, size and colour.` },
  { icon: Type, title: "Add new text", target: '[data-tour="tool-text"]', side: "right", body: (t) => `${t ? "Tap" : "Click"} anywhere on the page to add a text box, then choose from more than 60 fonts.` },
  { icon: Eraser, title: "Whiteout", target: '[data-tour="tool-whiteout"]', side: "right", body: () => "Cover anything with a solid box, or switch to Text only to remove words while keeping watermarks and images visible." },
  { icon: Highlighter, title: "Highlight, draw and shapes", target: '[data-tour="group-Markup"]', side: "right", body: () => "Highlight, underline or strike through text. Draw freehand notes, or add boxes, circles and arrows from Shapes." },
  { icon: Signature, title: "Sign and stamp", target: '[data-tour="tool-signature"]', side: "right", body: () => "Draw, type or upload your signature. Stamps add APPROVED, PAID and more, or make your own with your text and colours." },
  { icon: Files, title: "Organise your pages", target: 'aside[aria-label="Pages"]', side: "right", optional: true, body: () => "Drag pages to reorder them, or rotate, copy and delete. Hover between two pages and click + to insert a blank page, just like slides." },
  { icon: SlidersHorizontal, title: "Style anything you add", target: 'aside[aria-label="Properties"]', side: "left", optional: true, body: () => "Select text, a shape or a stamp to change its font, colour, size and more here." },
  { icon: Download, title: "Save and download", target: '[data-testid="save"]', side: "bottom", body: () => "When you're done, save to download your edited PDF. Editing happens in your browser, so your file isn't uploaded." },
  { icon: PartyPopper, title: "You're all set!", body: () => "Replay this tour anytime from the ⋯ menu at the top right." },
];

function visibleTarget(sel?: string): HTMLElement | null {
  if (!sel) return null;
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && el.offsetParent !== null) return el;
  }
  return null;
}

interface Rect { x: number; y: number; w: number; h: number }

/**
 * Dimmed backdrop with a rounded cut-out around the target. Drawn as one SVG path
 * (even-odd fill) and tweened in JS, so the spotlight glides between steps.
 */
function Spotlight({ rect }: { rect: Rect | null }) {
  const [cur, setCur] = useState<Rect | null>(rect);
  const from = useRef<Rect | null>(rect);
  useEffect(() => {
    if (!rect) { setCur(null); from.current = null; return; }
    const start = from.current;
    if (!start) { setCur(rect); from.current = rect; return; }
    let raf = 0;
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const k = ease(Math.min(1, (now - t0) / 280));
      const r = { x: start.x + (rect.x - start.x) * k, y: start.y + (rect.y - start.y) * k, w: start.w + (rect.w - start.w) * k, h: start.h + (rect.h - start.h) * k };
      setCur(r);
      from.current = r;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rect?.x, rect?.y, rect?.w, rect?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const W = typeof window === "undefined" ? 0 : window.innerWidth, H = typeof window === "undefined" ? 0 : window.innerHeight;
  const hole = (r: Rect, rad: number) =>
    `M${r.x + rad},${r.y}H${r.x + r.w - rad}A${rad},${rad} 0 0 1 ${r.x + r.w},${r.y + rad}V${r.y + r.h - rad}A${rad},${rad} 0 0 1 ${r.x + r.w - rad},${r.y + r.h}H${r.x + rad}A${rad},${rad} 0 0 1 ${r.x},${r.y + r.h - rad}V${r.y + rad}A${rad},${rad} 0 0 1 ${r.x + rad},${r.y}Z`;
  return (
    <svg className="pointer-events-none fixed inset-0 h-full w-full animate-fade-in" aria-hidden>
      <path d={`M0,0H${W}V${H}H0Z${cur ? hole(cur, 12) : ""}`} fill="#080c12" fillOpacity={0.62} fillRule="evenodd" />
      {cur && <path d={hole(cur, 12)} fill="none" stroke="var(--accent)" strokeWidth={2.5} />}
    </svg>
  );
}

export const tourSeen = () => { try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return true; } };

/**
 * First-visit guided tour: spotlights each part of the editor with a short
 * description and Back / Next / Skip. Shown once (remembered locally); replay
 * from the ⋯ menu. Not started automatically under browser automation (tests).
 */
export function EditorTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const touch = useTouchEditing();
  const [i, setI] = useState(0);
  const [hole, setHole] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: Side | null; arrow: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  // Steps whose targets don't exist in this layout are left out.
  const steps = STEPS.filter((s) => !s.optional || !open || visibleTarget(s.target));
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;

  const finish = useCallback(() => {
    try { localStorage.setItem(DONE_KEY, "1"); localStorage.setItem(TIP_KEY, "1"); } catch { /* storage blocked */ }
    setI(0);
    onClose();
  }, [onClose]);

  const place = useCallback(() => {
    const el = visibleTarget(step?.target);
    if (el) el.scrollIntoView({ block: "nearest", inline: "center" });
    const r = el?.getBoundingClientRect() ?? null;
    setHole(r);
    const c = card.current;
    if (!c) return;
    const w = c.offsetWidth, h = c.offsetHeight, m = 16, gap = 16;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!r) { setPos({ left: (vw - w) / 2, top: Math.max(m, (vh - h) / 2), side: null, arrow: 0 }); return; }
    const pad = 6;
    const fits: Record<Side, boolean> = {
      right: r.right + pad + gap + w <= vw - m,
      left: r.left - pad - gap - w >= m,
      bottom: r.bottom + pad + gap + h <= vh - m,
      top: r.top - pad - gap - h >= m,
    };
    const order: Side[] = [step.side ?? "bottom", "right", "bottom", "left", "top"];
    const side = order.find((s) => fits[s]);
    const clampX = (x: number) => Math.max(m, Math.min(x, vw - w - m));
    const clampY = (y: number) => Math.max(m, Math.min(y, vh - h - m));
    if (!side) { setPos({ left: clampX((vw - w) / 2), top: vh - h - m, side: null, arrow: 0 }); return; }
    let left: number, top: number;
    if (side === "right") { left = r.right + pad + gap; top = clampY(r.top + r.height / 2 - h / 2); }
    else if (side === "left") { left = r.left - pad - gap - w; top = clampY(r.top + r.height / 2 - h / 2); }
    else if (side === "bottom") { top = r.bottom + pad + gap; left = clampX(r.left + r.width / 2 - w / 2); }
    else { top = r.top - pad - gap - h; left = clampX(r.left + r.width / 2 - w / 2); }
    // Arrow points at the target's centre, kept within the card's rounded edge.
    const arrow = side === "right" || side === "left"
      ? Math.max(20, Math.min(h - 20, r.top + r.height / 2 - top))
      : Math.max(20, Math.min(w - 20, r.left + r.width / 2 - left));
    setPos({ left, top, side, arrow });
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const t = setTimeout(place, 320); // after smooth scrolling settles
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, place, i]);

  useEffect(() => { if (open) next.current?.focus({ preventScroll: true }); }, [open, i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); if (last) finish(); else setI((x) => x + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); setI((x) => Math.max(0, x - 1)); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, last, finish]);

  if (!open || !step) return null;
  const Icon = step.icon;
  const pad = 6;
  const intro = i === 0;

  return createPortal(
    <div className="fixed inset-0 z-[90]" data-editor-tour>
      {/* Dim everything except the spotlighted control. */}
      <Spotlight rect={hole ? { x: hole.left - pad, y: hole.top - pad, w: hole.width + pad * 2, h: hole.height + pad * 2 } : null} />
      {!hole && <div className="pointer-events-none fixed inset-0 backdrop-blur-[2px]" aria-hidden />}
      {/* Blocks clicks on the editor while the tour is open. */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={cn("fixed w-[min(344px,calc(100vw-32px))] rounded-2xl border border-border bg-surface p-5 shadow-[0_24px_60px_-12px_rgb(0_0_0/.45)] transition-[left,top] duration-300 ease-out", !pos && "invisible")}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
      >
        {pos?.side && (
          <span
            aria-hidden
            className="absolute size-3.5 rotate-45 border-border bg-surface"
            style={
              pos.side === "right" ? { left: -7.5, top: pos.arrow - 7, borderLeftWidth: 1, borderBottomWidth: 1 }
                : pos.side === "left" ? { right: -7.5, top: pos.arrow - 7, borderRightWidth: 1, borderTopWidth: 1 }
                  : pos.side === "bottom" ? { top: -7.5, left: pos.arrow - 7, borderLeftWidth: 1, borderTopWidth: 1 }
                    : { bottom: -7.5, left: pos.arrow - 7, borderRightWidth: 1, borderBottomWidth: 1 }
            }
          />
        )}
        <div key={i} className="animate-pop">
          <div className="flex items-start gap-3">
            <span className={cn("grid shrink-0 place-items-center rounded-xl bg-accent-soft text-accent", intro || last ? "size-12" : "size-10")}>
              <Icon className={intro || last ? "size-6" : "size-5"} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              {!intro && !last && <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">Step {i} of {steps.length - 2}</p>}
              <h2 id="tour-title" className={cn("font-semibold tracking-tight text-ink", intro || last ? "text-[19px] leading-snug" : "text-[16px]")}>{step.title}</h2>
            </div>
            {!last && (
              <button onClick={finish} aria-label="Skip tour" className="-mt-1 -mr-1 rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="size-4" /></button>
            )}
          </div>
          <p id="tour-body" className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{step.body(touch)}</p>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-1.5" aria-hidden>
            {steps.map((_, k) => (
              <span key={k} className={cn("h-1.5 rounded-full transition-all duration-300", k === i ? "w-5 bg-accent" : k < i ? "w-1.5 bg-accent/50" : "w-1.5 bg-border-strong")} />
            ))}
          </div>
          {intro ? (
            <>
              <Button variant="ghost" size="sm" onClick={finish}>Skip</Button>
              <Button ref={next} size="sm" onClick={() => setI(1)}>Start tour <ArrowRight /></Button>
            </>
          ) : last ? (
            <Button ref={next} size="sm" onClick={finish}>Start editing</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setI((x) => Math.max(0, x - 1))} aria-label="Previous step"><ArrowLeft /> Back</Button>
              <Button ref={next} size="sm" onClick={() => setI((x) => x + 1)}>Next <ArrowRight /></Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
