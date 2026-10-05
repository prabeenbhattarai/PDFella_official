"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, X, SquareSlash, ScanText } from "lucide-react";
import { useSearch } from "@/lib/editor/search";
import { useEditor } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/form";
import { uid } from "@/lib/utils";
import type { EditorObject } from "@/lib/editor/model";

export function SearchBar({ onOcr }: { onOcr: () => void }) {
  const { query, hits, active, searching, run, step, setOpen } = useSearch();
  const pages = useEditor((s) => s.pages);
  const scanned = useEditor((s) => Object.values(s.sources).some((x) => x.scanned));
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => input.current?.focus(), []);

  const redactAll = () => {
    const s = useEditor.getState();
    s.commit();
    const add: Record<string, EditorObject[]> = {};
    for (const h of hits) {
      (add[h.pageId] ??= []).push({ id: uid("o"), kind: "redact", fill: "#000000", rotation: 0, opacity: 1, x: h.box.x - 1, y: h.box.y, w: h.box.w + 2, h: h.box.h });
    }
    useEditor.setState((st) => ({ objects: Object.fromEntries([...new Set([...Object.keys(st.objects), ...Object.keys(add)])].map((k) => [k, [...(st.objects[k] ?? []), ...(add[k] ?? [])]])) }));
  };

  return (
    <div className="absolute top-3 right-3 z-30 w-[min(420px,calc(100%-24px))] rounded-xl border border-border bg-surface p-2 shadow-lg animate-pop" role="search">
      <div className="flex items-center gap-1">
        <input
          ref={input}
          defaultValue={query}
          placeholder="Search in document"
          aria-label="Search in document"
          className="h-9 min-w-0 flex-1 rounded-lg bg-surface-2 px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
          onChange={(e) => { clearTimeout(timer.current); const v = e.target.value; timer.current = setTimeout(() => run(v, pages), 200); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") step(e.shiftKey ? -1 : 1);
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <span className="w-16 text-center text-xs tabular-nums text-ink-3" aria-live="polite">
          {searching ? <Spinner className="size-3" /> : query ? (hits.length ? `${active + 1} / ${hits.length}` : "0 results") : ""}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Previous result" onClick={() => step(-1)} disabled={!hits.length}><ChevronUp /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next result" onClick={() => step(1)} disabled={!hits.length}><ChevronDown /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close search" onClick={() => setOpen(false)}><X /></Button>
      </div>
      {hits.length > 0 && (
        <button onClick={redactAll} className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-surface-2"><SquareSlash className="size-3.5 text-danger" /> Mark all {hits.length} matches for redaction</button>
      )}
      {query && !hits.length && !searching && scanned && (
        <button onClick={onOcr} className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-accent hover:bg-surface-2"><ScanText className="size-3.5" /> Run OCR to make this document searchable</button>
      )}
    </div>
  );
}
