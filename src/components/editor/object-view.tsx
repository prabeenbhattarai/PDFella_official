"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StickyNote, Link2, PenLine, CheckSquare, CircleDot, ChevronDown, Calendar, Type as TypeIcon } from "lucide-react";
import type { EditorObject, TextObject, TextEditObject } from "@/lib/editor/model";
import { useEditor } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { ensureStyleFonts, fontStack } from "@/lib/fonts/loader";
import { checkStyle } from "./style-choice";
import { MobileTextSheet } from "./mobile-text-sheet";
import { useTouchEditing } from "@/lib/hooks/use-touch-editing";
import {
  PathBuilder, arrowHead, checkPath, cloudPath, crossPath, ellipsePath, polygonPath, rectPath, roundedRectPath, smoothStroke, starPoints, type Pt,
} from "@/lib/pdf/geometry";

let measureCtx: CanvasRenderingContext2D | null = null;
function measureBold(text: string) {
  if (typeof document === "undefined") return text.length * 0.6;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx!.font = "bold 100px Helvetica, Arial, sans-serif";
  return measureCtx!.measureText(text).width / 100;
}

function Svg({ w, h, children, overflow = true }: { w: number; h: number; children: React.ReactNode; overflow?: boolean }) {
  return (
    <svg viewBox={`0 0 ${Math.max(w, 0.01)} ${Math.max(h, 0.01)}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={{ overflow: overflow ? "visible" : "hidden" }} aria-hidden>
      {children}
    </svg>
  );
}

const textCss = (o: TextObject | TextEditObject, z: number): React.CSSProperties => ({
  fontFamily: fontStack(o),
  fontSize: o.size * z,
  lineHeight: o.lineHeight,
  color: o.color,
  fontWeight: o.bold ? 700 : 400,
  fontStyle: o.italic ? "italic" : "normal",
  textDecoration: o.underline ? "underline" : "none",
  textDecorationThickness: Math.max(0.5, o.size * 0.06) * z,
  textUnderlineOffset: o.size * 0.12 * z,
  textAlign: o.align,
  letterSpacing: o.letterSpacing * z,
  background: o.background ?? "transparent",
  // Edited PDF lines grow sideways like the original line (new lines only on Enter);
  // added text boxes wrap at their width.
  ...(o.kind === "textEdit" ? { whiteSpace: "pre" as const } : { whiteSpace: "pre-wrap" as const, overflowWrap: "break-word" as const, wordBreak: "break-word" as const }),
});

/** Editable text box. Keeps the model height in sync with its rendered content. */
function TextBox({ obj, z, editing }: { obj: TextObject | TextEditObject; z: number; editing: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const updateObject = useEditor((s) => s.updateObject);
  const setEditing = useEditor((s) => s.setEditing);
  const commitRef = useRef(false);
  const touch = useTouchEditing();
  // Re-measure once the font (library or the PDF's own) has loaded.
  const [, setFontsReady] = useState(0);
  const assets = useEditor((s) => s.assets);
  useEffect(() => {
    let alive = true;
    ensureStyleFonts(obj, assets).then(() => alive && setFontsReady((n) => n + 1));
    return () => { alive = false; };
  }, [obj.font, obj.fontFallback, obj.bold, obj.italic, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = editing && !touch ? area.current : ref.current;
    if (!el) return;
    if (editing && area.current) { area.current.style.height = "0px"; area.current.style.height = `${area.current.scrollHeight}px`; }
    const h = el.scrollHeight / z;
    const minH = obj.size * obj.lineHeight;
    const next = Math.max(minH, h);
    const patch: Partial<TextObject> = {};
    if (Math.abs(next - obj.h) > 0.5) patch.h = next;
    // Edited lines never wrap: widen the box when the text really overflows it (compared
    // in whole pixels: comparing scaled sizes made sub-pixel rounding grow it forever).
    if (obj.kind === "textEdit" && el.scrollWidth > el.clientWidth + 1) patch.w = el.scrollWidth / z + 2;
    if (patch.h !== undefined || patch.w !== undefined) updateObject(obj.id, patch);
  });

  useEffect(() => {
    if (editing && !touch && area.current) {
      area.current.focus();
      const sel = useEditor.getState().editSelection;
      if (sel) area.current.setSelectionRange(sel[0], sel[1]);
      else area.current.select();
      commitRef.current = false;
    }
  }, [editing, touch]);

  if (editing && touch) {
    return (
      <>
        <div ref={ref} className="absolute inset-x-0 top-0 select-none outline-2 outline-offset-2 outline-accent outline-dashed" style={textCss(obj, z)}>{obj.text || "​"}</div>
        <MobileTextSheet obj={obj} />
      </>
    );
  }
  if (editing) {
    return (
      <textarea
        ref={area}
        value={obj.text}
        aria-label="Text"
        onChange={(e) => {
          if (!commitRef.current) { useEditor.getState().commit(); commitRef.current = true; }
          updateObject(obj.id, { text: e.target.value });
        }}
        onBlur={() => {
          setEditing(null);
          if (!obj.text.trim() && obj.kind === "text") useEditor.getState().removeObjects([obj.id]);
          if (obj.kind === "textEdit") void checkStyle(obj.id);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        wrap={obj.kind === "textEdit" ? "off" : undefined}
        className="absolute inset-x-0 top-0 resize-none overflow-hidden border-0 p-0 outline-none"
        style={{ ...textCss(obj, z), width: "100%", caretColor: obj.color, backgroundColor: obj.background ?? "rgba(255,255,255,0.01)" }}
        spellCheck
      />
    );
  }
  return <div ref={ref} className="absolute inset-x-0 top-0 select-none" style={textCss(obj, z)}>{obj.text || "​"}</div>;
}

const fieldIcons = { text: TypeIcon, date: Calendar, checkbox: CheckSquare, radio: CircleDot, dropdown: ChevronDown, signature: PenLine };

export const ObjectView = memo(function ObjectView({ obj, z, selected, editing, redactPreview, interactive, covered = true }: {
  obj: EditorObject; z: number; selected: boolean; editing: boolean; redactPreview: boolean; interactive: boolean;
  /** textEdit only: false once the page preview no longer contains the original text. */
  covered?: boolean;
}) {
  const assets = useEditor((s) => s.assets);
  const base: React.CSSProperties = {
    left: obj.x * z,
    top: obj.y * z,
    width: obj.w * z,
    height: obj.h * z,
    transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
    opacity: obj.kind === "highlight" ? undefined : obj.opacity,
    pointerEvents: interactive ? "auto" : "none",
  };
  // Hover outline for anything selectable; whiteouts and redactions are otherwise
  // invisible on a white page, so they get a faint outline while selectable.
  const cls = cn("absolute", interactive && !editing && "obj-pickable", interactive && (obj.kind === "whiteout" || obj.kind === "redact") && !selected && "obj-ghost");
  // Thin or tiny objects get a larger invisible hit area (at least ~14px on screen).
  const padX = Math.max(0, (14 - obj.w * z) / 2), padY = Math.max(0, (14 - obj.h * z) / 2);
  const local = new PathBuilder();

  let content: React.ReactNode = null;
  let extra: React.ReactNode = null;
  switch (obj.kind) {
    case "whiteout":
      content = <div className="absolute inset-0" style={{ background: obj.color }} />;
      break;
    case "highlight":
      content = <div className="absolute inset-0" style={{ background: obj.color, opacity: obj.opacity, mixBlendMode: "multiply" }} />;
      break;
    case "underline":
    case "strike": {
      const t = Math.max(0.75, obj.h * 0.07);
      const y = obj.kind === "underline" ? obj.h - t / 2 : obj.h * 0.55;
      content = <Svg w={obj.w} h={obj.h}><line x1={0} y1={y} x2={obj.w} y2={y} stroke={obj.color} strokeWidth={t} /></Svg>;
      break;
    }
    case "redact":
      content = redactPreview
        ? <div className="absolute inset-0" style={{ background: obj.fill }} />
        : <div className="absolute inset-0 border-2 border-[#d0312d]" style={{ background: "repeating-linear-gradient(45deg, rgba(208,49,45,.18) 0 6px, rgba(208,49,45,.06) 6px 12px)" }} />;
      break;
    case "rect":
    case "ellipse":
    case "cloud":
    case "polygon": {
      const d = obj.kind === "rect" ? rectPath(local, obj.w, obj.h)
        : obj.kind === "ellipse" ? ellipsePath(local, obj.w, obj.h)
          : obj.kind === "cloud" ? cloudPath(local, obj.w, obj.h)
            : polygonPath(local, obj.points ?? [], obj.w, obj.h);
      content = <Svg w={obj.w} h={obj.h}><path d={d.toString()} fill={obj.fill ?? "none"} stroke={obj.stroke ?? "none"} strokeWidth={obj.strokeWidth} strokeLinejoin="round" /></Svg>;
      break;
    }
    case "line":
    case "arrow": {
      const lx = (x: number) => x - obj.x, ly = (y: number) => y - obj.y;
      const head = obj.kind === "arrow" ? arrowHead(lx(obj.x1), ly(obj.y1), lx(obj.x2), ly(obj.y2), obj.strokeWidth) : null;
      content = (
        <Svg w={obj.w} h={obj.h}>
          <line x1={lx(obj.x1)} y1={ly(obj.y1)} x2={lx(obj.x2)} y2={ly(obj.y2)} stroke={obj.stroke} strokeWidth={obj.strokeWidth} strokeLinecap="round" />
          {head && <path d={new PathBuilder().M(...head[0]).L(...head[1]).L(...head[2]).Z().toString()} fill={obj.stroke} />}
          {/* wide invisible hit area */}
          <line x1={lx(obj.x1)} y1={ly(obj.y1)} x2={lx(obj.x2)} y2={ly(obj.y2)} stroke="transparent" strokeWidth={Math.max(10 / z, obj.strokeWidth + 6)} data-obj-id={obj.id} style={{ pointerEvents: interactive ? "stroke" : "none" }} />
        </Svg>
      );
      // The box itself should not capture clicks for lines; only the stroke does.
      base.pointerEvents = "none";
      break;
    }
    case "ink": {
      const p = new PathBuilder();
      obj.strokes.forEach((s) => smoothStroke(p, s.map(([x, y]) => [x * obj.w, y * obj.h] as Pt)));
      content = <Svg w={obj.w} h={obj.h}><path d={p.toString()} fill="none" stroke={obj.stroke} strokeWidth={obj.strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
      break;
    }
    case "check":
      content = <Svg w={obj.w} h={obj.h}><path d={checkPath(local, obj.w, obj.h).toString()} fill="none" stroke={obj.color} strokeWidth={Math.max(1.5, obj.w * 0.12)} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
      break;
    case "cross":
      content = <Svg w={obj.w} h={obj.h}><path d={crossPath(local, obj.w, obj.h).toString()} fill="none" stroke={obj.color} strokeWidth={Math.max(1.5, obj.w * 0.12)} strokeLinecap="round" /></Svg>;
      break;
    case "star":
      content = <Svg w={obj.w} h={obj.h}><path d={polygonPath(local, starPoints(), obj.w, obj.h).toString()} fill={obj.color} /></Svg>;
      break;
    case "dot":
      content = <Svg w={obj.w} h={obj.h}><path d={ellipsePath(local, obj.w, obj.h).toString()} fill={obj.color} /></Svg>;
      break;
    case "stamp": {
      const sw = Math.max(1.5, Math.min(obj.w, obj.h) * 0.06);
      const label = obj.label.toUpperCase();
      const size = Math.min(obj.h * 0.5, (obj.w - sw * 4) / Math.max(0.01, measureBold(label)));
      const inset = new PathBuilder((x, y) => [x + sw / 2, y + sw / 2]);
      content = (
        <Svg w={obj.w} h={obj.h}>
          <path d={roundedRectPath(inset, obj.w - sw, obj.h - sw, Math.min(obj.h * 0.18, 8)).toString()} fill="none" stroke={obj.color} strokeWidth={sw} />
          <text x={obj.w / 2} y={obj.h / 2 + size * 0.36} textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif" fontWeight="bold" fontSize={size} fill={obj.color}>{label}</text>
        </Svg>
      );
      break;
    }
    case "image":
    case "signature": {
      const src = assets[obj.asset];
      const c = obj.crop;
      content = src ? (
        <div className="absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" draggable={false} className="absolute max-w-none select-none" style={{ width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%` }} />
        </div>
      ) : null;
      break;
    }
    case "text":
      content = <TextBox obj={obj} z={z} editing={editing} />;
      break;
    case "textEdit": {
      const o = obj.original.box;
      if (covered) extra = <div data-cover className="absolute" style={{ left: (o.x - 0.5) * z, top: (o.y - 0.5) * z, width: (o.w + 1) * z, height: (o.h + 1) * z, background: obj.cover, pointerEvents: "none" }} />;
      content = <TextBox obj={obj} z={z} editing={editing} />;
      break;
    }
    case "note":
      content = (
        <div className="absolute inset-0 flex items-center justify-center rounded-[3px] shadow-sm" style={{ background: obj.color }} title={obj.text}>
          <StickyNote className="size-[70%] text-black/70" strokeWidth={2} />
        </div>
      );
      break;
    case "link":
      content = (
        <div className="absolute inset-0 border border-dashed border-[#1f6feb] bg-[#1f6feb]/10" title={obj.url}>
          <Link2 className="absolute top-0.5 right-0.5 size-3 text-[#1f6feb]" />
        </div>
      );
      break;
    case "field": {
      const Icon = fieldIcons[obj.fieldType];
      content = (
        <div className="absolute inset-0 flex items-center gap-1 overflow-hidden border border-dashed border-[#1f6feb] bg-[#e8f0fe]/80 px-1 text-[#1f4fb8]" style={{ fontSize: Math.max(8, Math.min(12, obj.h * 0.5)) * z }}>
          <Icon className="shrink-0" style={{ width: "1.1em", height: "1.1em" }} />
          {obj.fieldType !== "checkbox" && obj.fieldType !== "radio" && <span className="truncate">{obj.name}</span>}
        </div>
      );
      break;
    }
  }

  return (
    <>
      {extra}
      <div
        className={cls}
        style={base}
        data-obj-id={obj.id}
        data-kind={obj.kind}
        aria-label={obj.kind}
        aria-selected={selected}
      >
        {content}
        {interactive && (padX > 0 || padY > 0) && obj.kind !== "line" && obj.kind !== "arrow" && <span aria-hidden className="absolute" style={{ left: -padX, right: -padX, top: -padY, bottom: -padY }} />}
      </div>
    </>
  );
});
