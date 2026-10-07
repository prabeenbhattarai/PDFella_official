"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Wand2 } from "lucide-react";
import type { TextObject, TextEditObject } from "@/lib/editor/model";
import { useEditor } from "@/lib/editor/store";
import { styleDiff } from "@/lib/editor/detect-style";
import { Button } from "@/components/ui/button";
import { applyOriginalStyle, checkStyle } from "./style-choice";

/**
 * Text editing on phones: PDF text is tiny at phone zoom and the on-screen keyboard
 * covers the page, so the text is edited in a large field docked above the keyboard
 * while the page shows the result live.
 */
export function MobileTextSheet({ obj }: { obj: TextObject | TextEditObject }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const committed = useRef(false);
  const [bottom, setBottom] = useState(0);
  const s = useEditor.getState();

  // Stay above the keyboard (the visual viewport shrinks when it opens).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const place = () => setBottom(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => { vv.removeEventListener("resize", place); vv.removeEventListener("scroll", place); };
  }, []);

  // Focus, select the tapped word, and scroll the line near the top so it isn't hidden.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const sel = useEditor.getState().editSelection;
    if (sel) el.setSelectionRange(sel[0], sel[1]);
    else el.setSelectionRange(el.value.length, el.value.length);
    const target = document.querySelector<HTMLElement>(`[data-obj-id="${obj.id}"]`);
    const scroller = target?.closest<HTMLElement>(".overflow-auto");
    if (target && scroller) {
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      scroller.scrollBy({ top: top - 72, behavior: "smooth" });
    }
  }, [obj.id]);

  const done = () => {
    s.setEditing(null);
    if (!obj.text.trim() && obj.kind === "text") s.removeObjects([obj.id]);
    if (obj.kind === "textEdit") void checkStyle(obj.id);
  };
  const differs = obj.kind === "textEdit" && styleDiff(obj).length > 0;

  return createPortal(
    <div
      className="fixed inset-x-0 z-[70] border-t border-border bg-surface px-3 pt-2.5 pb-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/.25)]"
      style={{ bottom }}
      data-mobile-text-sheet
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{obj.kind === "textEdit" ? "Edit text" : "Text"}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {differs && <Button size="sm" variant="outline" onPointerDown={(e) => e.preventDefault()} onClick={() => applyOriginalStyle(obj as TextEditObject)}><Wand2 /> Match original</Button>}
          <Button size="sm" onPointerDown={(e) => e.preventDefault()} onClick={done}><Check /> Done</Button>
        </div>
      </div>
      <textarea
        ref={area}
        aria-label="Text"
        value={obj.text}
        rows={Math.min(4, Math.max(2, obj.text.split("\n").length))}
        onChange={(e) => {
          if (!committed.current) { s.commit(); committed.current = true; }
          s.updateObject(obj.id, { text: e.target.value });
        }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") done(); }}
        onBlur={(e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest("[data-mobile-text-sheet]")) done(); }}
        className="block w-full resize-none rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-[16px] leading-snug text-ink focus:border-accent focus:outline-none"
        spellCheck
      />
    </div>,
    document.body,
  );
}
