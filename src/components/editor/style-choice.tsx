"use client";

import { useState } from "react";
import { Wand2, X } from "lucide-react";
import type { TextEditObject } from "@/lib/editor/model";
import { useEditor, findObject } from "@/lib/editor/store";
import { fontDisplayName, styleDiff, type StyleDiff } from "@/lib/editor/detect-style";
import { facesFor, isOriginal, missingChars } from "@/lib/fonts/loader";
import { catalogFont } from "@/lib/fonts/catalog";
import { Button } from "@/components/ui/button";

/** Restore the detected look of the original text. */
export function applyOriginalStyle(o: TextEditObject) {
  if (!o.originalStyle) return;
  const s = useEditor.getState();
  s.updateObject(o.id, { ...o.originalStyle, fontFallback: o.originalStyle.fontFallback, styleAck: undefined } as Partial<TextEditObject>, { commit: true });
  if (s.stylePrompt?.id === o.id) s.setStylePrompt(null);
}

/**
 * After an edit (or a style change in the panel), ask whether to keep a look that
 * differs from the original text. Asked once per object unless the user restores it.
 */
export async function checkStyle(id: string) {
  const s = useEditor.getState();
  if (!s.askStyle) return;
  const f = findObject(s.objects, id);
  if (!f || f.obj.kind !== "textEdit" || f.obj.styleAck === "keep") return;
  const o = f.obj;
  if (styleDiff(o).length) { s.setStylePrompt({ id }); return; }
  // Letters missing from the PDF's embedded font are drawn with the fallback font;
  // only worth asking about when that fallback is a different design.
  if (isOriginal(o.font) && o.fontMatch && !o.fontMatch.fallbackMetric) {
    const faces = (await facesFor(o, s.assets)).filter((x) => x.id === o.font);
    const miss = missingChars(faces, o.text);
    if (miss && useEditor.getState().editingId !== id) s.setStylePrompt({ id, missing: miss });
  }
}

const KEY_LABEL: Record<StyleDiff["key"], string> = {
  font: "Font", fontFallback: "Font", size: "Size", color: "Colour", bold: "Bold", italic: "Italic", letterSpacing: "Letter spacing",
};

function DiffValue({ d, o, which }: { d: StyleDiff; o: TextEditObject; which: "from" | "to" }) {
  const v = d[which];
  if (d.key === "font") return <>{fontDisplayName(v as string, o)}</>;
  if (d.key === "size") return <>{String(v)} pt</>;
  if (d.key === "letterSpacing") return <>{Number(v).toFixed(1)} pt</>;
  if (d.key === "color") return <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm border border-black/15" style={{ background: v as string }} />{String(v)}</span>;
  return <>{v ? "on" : "off"}</>;
}

export function StyleChoice({ prompt, obj, z }: { prompt: { id: string; missing?: string }; obj: TextEditObject; z: number }) {
  const [dontAsk, setDontAsk] = useState(false);
  const s = useEditor.getState();
  const diffs = styleDiff(obj);
  const close = () => {
    if (dontAsk) s.setAskStyle(false);
    s.setStylePrompt(null);
  };
  const keep = () => {
    s.updateObject(obj.id, { styleAck: "keep" } as Partial<TextEditObject>);
    close();
  };
  const fallback = obj.fontFallback ? catalogFont(obj.fontFallback)?.label ?? obj.fontFallback : "";
  const missingOnly = !diffs.length && !!prompt.missing;

  return (
    <div
      role="dialog"
      aria-label="Text style differs from the original"
      data-style-choice
      className="absolute z-30 w-[300px] rounded-xl border border-border bg-surface p-3.5 text-left shadow-lg animate-pop"
      style={{ left: Math.max(0, obj.x * z), top: (obj.y + obj.h) * z + 10 }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") close(); }}
    >
      <div className="flex items-start gap-2">
        <Wand2 className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">{missingOnly ? "Some letters aren't in this PDF's font" : "This text looks different from the original"}</p>
          {missingOnly ? (
            <p className="mt-1 text-[13px] leading-snug text-ink-2">
              The font embedded in the PDF only contains the letters it already used, so <b>{[...prompt.missing!].join(" ")}</b> {prompt.missing!.length > 1 ? "are" : "is"} drawn in {fallback}, the closest match.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-[13px] text-ink-2">
              {diffs.map((d) => (
                <li key={d.key} className="flex flex-wrap items-center gap-x-1.5">
                  <span className="font-medium text-ink-3">{KEY_LABEL[d.key]}:</span>
                  <DiffValue d={d} o={obj} which="from" /> <span className="text-ink-3">→</span> <span className="font-medium text-ink"><DiffValue d={d} o={obj} which="to" /></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button aria-label="Close" onClick={close} className="-mt-1 -mr-1 rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {missingOnly ? (
          <>
            <Button size="sm" onClick={keep}>Keep as is</Button>
            <Button size="sm" variant="outline" onClick={() => { s.updateObject(obj.id, { font: obj.fontFallback!, fontFallback: undefined, styleAck: "keep" } as Partial<TextEditObject>, { commit: true }); close(); }}>Use {fallback} for all</Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => { applyOriginalStyle(obj); close(); }}>Use original style</Button>
            <Button size="sm" variant="outline" onClick={keep}>Keep new style</Button>
          </>
        )}
      </div>
      <label className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-3">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="accent-[var(--accent)]" /> Don&apos;t ask again
      </label>
    </div>
  );
}
