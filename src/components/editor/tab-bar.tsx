"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, Layers, Loader2, Plus, X } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { closeTab, newTab, switchTab, useTabs, type Tab } from "@/lib/editor/tabs";
import { cn } from "@/lib/utils";

/** Browser-style document tabs above the editor. */
export function TabBar({ tip = false, onTipClose }: { tip?: boolean; onTipClose?: () => void }) {
  const tabs = useTabs((s) => s.tabs);
  const active = useTabs((s) => s.active);
  const plus = useRef<HTMLButtonElement>(null);

  return (
    <>
    <div className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-surface-2 px-2 pt-1.5 [scrollbar-width:none]" role="tablist" aria-label="Open documents">
      {tabs.map((t) => <TabButton key={t.id} tab={t} active={t.id === active} />)}
      <button ref={plus} data-tour="tabs" type="button" onClick={() => { onTipClose?.(); newTab(); }} aria-label="New tab" title="New tab"
        className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface hover:text-ink">
        <Plus className="size-4" />
      </button>
    </div>
    {tip && onTipClose && <TabTip anchor={plus} onClose={onTipClose} />}
    </>
  );
}

const TIP_MS = 12_000;

/** Short pointer to the + button. It doesn't block the page and goes away by itself. */
function TabTip({ anchor, onClose }: { anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const [left, setLeft] = useState<number | null>(null);
  const WIDTH = 280;
  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (r) setLeft(Math.max(8, Math.min(r.left + r.width / 2 - 24, window.innerWidth - WIDTH - 8)));
  }, [anchor]);
  useEffect(() => {
    const t = setTimeout(onClose, TIP_MS);
    return () => clearTimeout(t);
  }, [onClose]);
  if (left === null) return null;
  return (
    <div role="status" data-testid="tab-tip" style={{ left, width: WIDTH }} className="fixed top-11 z-40 rounded-xl border border-border bg-surface p-3 shadow-lg animate-pop">
      <span className="absolute -top-1.5 left-[18px] size-3 rotate-45 border-t border-l border-border bg-surface" aria-hidden />
      <div className="flex items-start gap-2.5">
        <Layers className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">Work in several tabs</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Click + to open another document in its own tab.</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-medium text-accent hover:bg-surface-2">Got it</button>
      </div>
    </div>
  );
}

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  // The open tab reads the live editor; the others read their parked snapshot.
  const status = useEditor((s) => s.status);
  const name = useEditor((s) => s.docName);
  const dirty = useEditor((s) => s.dirty);
  const doc = active ? { status, name, dirty }
    : tab.snapshot ? { status: tab.snapshot.status, name: tab.snapshot.docName, dirty: tab.snapshot.dirty } : { status: "empty" as const, name: "", dirty: false };
  const title = doc.status === "loading" ? "Opening…" : doc.status === "ready" || doc.status === "saving" ? doc.name : "New tab";

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={title}
      onClick={() => switchTab(tab.id)}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchTab(tab.id); } }}
      className={cn(
        "group relative flex h-[34px] w-[200px] min-w-[120px] shrink cursor-default items-center gap-2 rounded-t-lg pr-1.5 pl-3 text-[13px] select-none",
        active ? "border border-b-0 border-border bg-surface text-ink" : "text-ink-2 hover:bg-surface/60",
      )}
    >
      {doc.status === "loading" ? <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-3" aria-hidden /> : <FileText className={cn("size-3.5 shrink-0", active ? "text-accent" : "text-ink-3")} aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {doc.dirty && <span className="size-1.5 shrink-0 rounded-full bg-warn group-hover:hidden" aria-label="Unsaved changes" />}
      <button type="button" onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} aria-label={`Close ${title}`}
        className={cn("flex size-5 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink", doc.dirty && "hidden group-hover:flex", !active && !doc.dirty && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}
