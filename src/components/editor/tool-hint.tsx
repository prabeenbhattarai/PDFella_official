"use client";

import { useEffect, useState } from "react";
import { X, MousePointerClick } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { TOOL_DEFS } from "./tools";
import { useTouchEditing } from "@/lib/hooks/use-touch-editing";

const TIP_KEY = "pdfella.tip.dblclick";

/**
 * Always tells the user what the active tool does and how to leave it.
 * With the Select tool it shows a one-time tip about double-click editing.
 */
export function ToolHint() {
  const tool = useEditor((s) => s.tool);
  const pending = useEditor((s) => s.pendingAsset);
  const editing = useEditor((s) => s.editingId);
  const [tipSeen, setTipSeen] = useState(true);
  const touch = useTouchEditing();
  useEffect(() => {
    const read = () => { try { setTipSeen(localStorage.getItem(TIP_KEY) === "1"); } catch { setTipSeen(false); } };
    read();
    // The guided tour covers this tip; it marks it seen when it closes.
    window.addEventListener("pdfella:tip-seen", read);
    return () => window.removeEventListener("pdfella:tip-seen", read);
  }, []);
  const dismissTip = () => {
    setTipSeen(true);
    try { localStorage.setItem(TIP_KEY, "1"); } catch { /* storage blocked */ }
  };

  if (pending || editing) return null;
  if (tool === "select") {
    if (tipSeen) return null;
    return (
      <div className="pointer-events-auto absolute top-3 left-1/2 z-20 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-border bg-surface py-1.5 pr-1.5 pl-3.5 text-[12px] leading-snug shadow-md animate-pop sm:rounded-full sm:text-[13px]" role="status">
        <MousePointerClick className="size-4 shrink-0 text-accent" />
        <span><b className="font-semibold">Tip:</b> {touch ? "tap" : "double-click"} any word or sentence in the PDF to edit it.</span>
        <button onClick={dismissTip} className="rounded-full p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Dismiss tip"><X className="size-3.5" /></button>
      </div>
    );
  }
  const def = TOOL_DEFS[tool];
  const Icon = def.icon;
  return (
    <div className="pointer-events-auto absolute top-3 left-1/2 z-20 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-ink py-1.5 pr-1.5 pl-3.5 text-[12px] leading-snug text-bg shadow-lg animate-pop sm:rounded-full sm:text-[13px]" role="status" aria-live="polite">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate"><b className="font-semibold">{def.label}:</b> {def.hint}</span>
      <button onClick={() => useEditor.getState().setTool("select")} className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium hover:bg-white/25">Done <kbd className="ml-1 opacity-60">Esc</kbd></button>
    </div>
  );
}
