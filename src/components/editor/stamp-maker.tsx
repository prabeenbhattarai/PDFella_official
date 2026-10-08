"use client";

import { useEffect, useState } from "react";
import { Bookmark, Eraser, Type, X } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { ColorPicker, Field, Input, Segmented } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StampArt } from "./object-view";
import { STAMPS, STAMP_COLORS } from "./tools";

export interface SavedStamp { label: string; text: string; border: string | null }

const KEY = "pdfella.stamps";
const load = (): SavedStamp[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedStamp[]; } catch { return []; } };
const store = (list: SavedStamp[]) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12))); } catch { /* storage blocked */ } };

function Preview({ label, text, border, className }: { label: string; text: string; border: string | null; className?: string }) {
  const w = Math.max(110, Math.min(380, 44 + label.length * 13));
  return (
    <div className={cn("relative", className)} style={{ aspectRatio: `${w} / 40` }} aria-hidden>
      <StampArt obj={{ w, h: 40, label: label || " ", color: text, textColor: text, borderColor: border }} />
    </div>
  );
}

/** Stamp tool options: presets, the user's saved stamps, and a custom stamp maker. */
export function StampMaker() {
  const style = useEditor((s) => s.style);
  const { setStyle } = useEditor.getState();
  const [saved, setSaved] = useState<SavedStamp[]>([]);
  useEffect(() => setSaved(load()), []);
  const pick = (label: string, text: string, border: string | null) => setStyle({ stamp: label, stampText: text, stampBorder: border });
  const isCurrent = (label: string, text: string, border: string | null) => style.stamp === label && style.stampText === text && style.stampBorder === border;
  const save = () => {
    const label = style.stamp.trim();
    if (!label) return;
    const next = [{ label, text: style.stampText, border: style.stampBorder }, ...saved.filter((x) => !(x.label === label && x.text === style.stampText && x.border === style.stampBorder))];
    setSaved(next);
    store(next);
  };
  const remove = (i: number) => { const next = saved.filter((_, k) => k !== i); setSaved(next); store(next); };

  return (
    <div className="space-y-4" data-stamp-maker>
      <div className="space-y-2.5 rounded-lg border border-border p-3">
        <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Create your own</p>
        <div className="rounded-md bg-white px-4 py-3 shadow-[inset_0_0_0_1px_rgb(0_0_0/.06)] dark:bg-[#f4f4f1]">
          <Preview label={style.stamp} text={style.stampText} border={style.stampBorder} className="mx-auto w-full max-w-[220px]" />
        </div>
        <Field label="Stamp text">{(id) => <Input id={id} value={style.stamp} maxLength={32} placeholder="e.g. Approved by Sam" onChange={(e) => setStyle({ stamp: e.target.value })} />}</Field>
        <ColorPicker label="Text colour" value={style.stampText} onChange={(c) => setStyle({ stampText: c ?? "#2e9e5b" })} />
        <ColorPicker label="Outline colour" value={style.stampBorder} onChange={(c) => setStyle({ stampBorder: c })} allowNone />
        <Button size="sm" variant="outline" className="w-full" onClick={save} disabled={!style.stamp.trim()}><Bookmark /> Save to my stamps</Button>
        <p className="text-xs text-ink-3">Then click on the page to place it.</p>
      </div>

      {saved.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Your stamps</p>
          <div className="grid grid-cols-2 gap-1.5">
            {saved.map((st, i) => (
              <div key={`${st.label}${i}`} className="group relative">
                <button onClick={() => pick(st.label, st.text, st.border)} aria-label={`Use stamp ${st.label}`} className={cn("w-full rounded-md border border-border bg-white p-1.5 dark:bg-[#f4f4f1]", isCurrent(st.label, st.text, st.border) && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}>
                  <Preview label={st.label} text={st.text} border={st.border} />
                </button>
                <button onClick={() => remove(i)} aria-label={`Delete stamp ${st.label}`} className="absolute -top-1.5 -right-1.5 hidden rounded-full border border-border bg-surface p-0.5 text-ink-3 shadow-sm group-hover:block hover:text-danger focus:block"><X className="size-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Ready-made</p>
        <div className="grid grid-cols-2 gap-1.5">
          {STAMPS.map((l) => (
            <button key={l} onClick={() => pick(l, STAMP_COLORS[l], STAMP_COLORS[l])} className={cn("rounded-md border-2 py-1.5 text-[11px] font-black tracking-wider", isCurrent(l, STAMP_COLORS[l], STAMP_COLORS[l]) ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")} style={{ color: STAMP_COLORS[l], borderColor: STAMP_COLORS[l] }}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

const MODE_HELP = {
  cover: "Paints a solid box over everything in the area: text, images and backgrounds.",
  text: "Removes only the text under the box. Watermarks, images and background colours stay visible.",
};

/** Whiteout: cover everything, or remove only the text. */
export function WhiteoutModePicker({ value, onChange }: { value: "cover" | "text"; onChange: (v: "cover" | "text") => void }) {
  return (
    <div className="space-y-2" data-whiteout-mode>
      <Segmented
        label="Whiteout mode"
        value={value}
        onChange={onChange}
        options={[
          { value: "cover", title: "Cover everything", label: <span className="flex items-center gap-1.5"><Eraser /> Cover all</span> },
          { value: "text", title: "Text only", label: <span className="flex items-center gap-1.5"><Type /> Text only</span> },
        ]}
      />
      <p className="text-[13px] leading-snug text-ink-3">{MODE_HELP[value]}</p>
    </div>
  );
}
