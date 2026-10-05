"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Undo2, Redo2, ZoomIn, ZoomOut, Search, Printer, Maximize, Download, Save, MoreHorizontal, Keyboard, FilePlus2,
  PanelLeft, PanelRight, MoveHorizontal, Scan, FolderOpen, Check,
} from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { useSearch } from "@/lib/editor/search";
import { LogoMark } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme";
import { cn, stripExtension } from "@/lib/utils";
import { downloadNow, printDocument } from "./actions";

interface Props {
  onSave: () => void;
  onNew: () => void;
  onOpen: () => void;
  onShortcuts: () => void;
  showThumbs: boolean;
  showPanel: boolean;
  toggleThumbs: () => void;
  togglePanel: () => void;
}

export function TopBar({ onSave, onNew, onOpen, onShortcuts, showThumbs, showPanel, toggleThumbs, togglePanel }: Props) {
  const docName = useEditor((s) => s.docName);
  const zoom = useEditor((s) => s.zoom);
  const fit = useEditor((s) => s.fit);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const dirty = useEditor((s) => s.dirty);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const s = useEditor.getState;

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  const rename = (v: string) => {
    const name = v.trim();
    if (name) s().setDocName(`${stripExtension(name)}.pdf`);
    setRenaming(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface px-2 sm:px-3">
      <Link href="/" aria-label="Home" className="mr-1 rounded-lg p-1 hover:bg-surface-2"><LogoMark /></Link>
      <Button variant="ghost" size="icon" aria-label="Toggle page thumbnails" aria-pressed={showThumbs} onClick={toggleThumbs} className="hidden md:inline-flex" title="Pages"><PanelLeft /></Button>

      <div className="min-w-0 max-w-[30vw] px-1 sm:max-w-xs">
        {renaming ? (
          <input autoFocus defaultValue={stripExtension(docName)} aria-label="Document name" onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") rename(e.currentTarget.value); if (e.key === "Escape") setRenaming(false); }} className="h-8 w-full rounded-md border border-accent bg-surface px-2 text-sm outline-none" />
        ) : (
          <button onClick={() => setRenaming(true)} className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-surface-2" title="Rename">
            <span className="truncate">{docName}</span>
            <span className={cn("size-1.5 shrink-0 rounded-full", dirty ? "bg-warn" : "bg-ok")} title={dirty ? "Unsaved changes (auto-saved locally)" : "Saved"} aria-label={dirty ? "Unsaved changes" : "Saved"} />
          </button>
        )}
      </div>

      <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
      <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => s().undo()}><Undo2 /></Button>
      <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => s().redo()}><Redo2 /></Button>

      <div className="mx-auto hidden items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 lg:flex">
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => s().setZoom(zoom / 1.2)}><ZoomOut /></Button>
        <button className="w-14 text-center text-xs tabular-nums text-ink-2 hover:text-ink" onClick={() => s().setZoom(1)} title="Actual size">{Math.round(zoom * 100)}%</button>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => s().setZoom(zoom * 1.2)}><ZoomIn /></Button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon-sm" aria-label="Fit width" title="Fit width" active={fit === "width"} onClick={() => s().setZoom(zoom, "width")}><MoveHorizontal /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Fit page" title="Fit page" active={fit === "page"} onClick={() => s().setZoom(zoom, "page")}><Scan /></Button>
      </div>

      <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
        <Button variant="ghost" size="icon" aria-label="Search" title="Search (Ctrl+F)" onClick={() => useSearch.getState().setOpen(true)}><Search /></Button>
        <Button variant="ghost" size="icon" aria-label="Print" title="Print (Ctrl+P)" onClick={printDocument} className="hidden sm:inline-flex"><Printer /></Button>
        <div className="relative" ref={menuRef}>
          <Button variant="ghost" size="icon" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal /></Button>
          {menu && (
            <div role="menu" className="absolute top-full right-0 z-50 mt-1 w-56 rounded-xl border border-border bg-surface p-1 shadow-lg animate-pop" onClick={() => setMenu(false)}>
              {[
                { icon: FolderOpen, label: "Open another file", on: onOpen },
                { icon: FilePlus2, label: "New document", on: onNew },
                { icon: Download, label: "Download without dialog", on: downloadNow },
                { icon: Printer, label: "Print", on: printDocument },
                { icon: Maximize, label: "Full screen", on: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) },
                { icon: PanelRight, label: showPanel ? "Hide properties" : "Show properties", on: togglePanel },
                { icon: Keyboard, label: "Keyboard shortcuts", on: onShortcuts },
              ].map(({ icon: Icon, label, on }) => (
                <button key={label} role="menuitem" onClick={on} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-surface-2"><Icon className="size-4 text-ink-3" /> {label}</button>
              ))}
              <div className="flex items-center justify-between px-2.5 py-1 text-[13px] text-ink-3">Theme <ThemeToggle /></div>
            </div>
          )}
        </div>
        <Button variant="outline" size="md" onClick={downloadNow} className="ml-1 hidden md:inline-flex" aria-label="Download"><Download /> Download</Button>
        <Button size="md" onClick={onSave} className="ml-1" data-testid="save">{dirty ? <Save /> : <Check />} <span className="hidden sm:inline">Save changes</span><span className="sm:hidden">Save</span></Button>
      </div>
    </header>
  );
}
