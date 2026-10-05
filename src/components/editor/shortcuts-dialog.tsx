"use client";

import { Dialog } from "@/components/ui/dialog";
import { TOOL_DEFS } from "./tools";

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
const general: [string, string][] = [
  [`${mod} Z`, "Undo"], [`${mod} ⇧ Z`, "Redo"], [`${mod} S`, "Save"], [`${mod} P`, "Print"], [`${mod} F`, "Search"],
  [`${mod} C / V`, "Copy / paste objects"], [`${mod} D`, "Duplicate"], ["Delete", "Delete selection"], ["Arrows", "Nudge (⇧ for 10pt)"],
  ["Esc", "Cancel / back to Select"], [`${mod} + / −`, "Zoom in / out"], [`${mod} 0`, "Fit width"], ["Double-click", "Edit text box"], ["?", "Show this panel"],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tools = Object.values(TOOL_DEFS).filter((t) => t.key);
  const Row = ([k, v]: [string, string]) => (
    <div key={v} className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-ink-2">{v}</span>
      <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
    </div>
  );
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" size="lg">
      <div className="grid gap-x-8 sm:grid-cols-2">
        <div><p className="mb-1 text-xs font-semibold text-ink-3 uppercase">General</p>{general.map(Row)}</div>
        <div><p className="mb-1 text-xs font-semibold text-ink-3 uppercase">Tools</p>{tools.map((t) => Row([t.key!.toUpperCase(), t.label]))}</div>
      </div>
    </Dialog>
  );
}
