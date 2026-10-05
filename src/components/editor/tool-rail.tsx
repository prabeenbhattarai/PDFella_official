"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { useEditor, type ToolId } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { RAIL, TOOL_DEFS, type ToolDef } from "./tools";

interface Props {
  onPick: (t: ToolId) => void;
  orientation: "vertical" | "horizontal";
}

/**
 * A layer rendered into <body> and positioned next to an anchor element.
 * The tool rail scrolls, so anything positioned inside it would be clipped;
 * this keeps menus and hover cards fully visible and inside the viewport.
 */
function Floating({ anchor, side, children, className, role, label, onRef }: {
  anchor: HTMLElement; side: "right" | "top"; children: ReactNode; className?: string; role?: string; label?: string; onRef?: (el: HTMLDivElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const el = ref.current;
      if (!el) return;
      const w = el.offsetWidth, h = el.offsetHeight, m = 8;
      let left: number, top: number;
      if (side === "right") {
        left = a.right + m;
        top = a.top + a.height / 2 - h / 2;
      } else {
        left = a.left + a.width / 2 - w / 2;
        top = a.top - h - m;
      }
      left = Math.max(m, Math.min(left, window.innerWidth - w - m));
      top = Math.max(m, Math.min(top, window.innerHeight - h - m));
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, side]);
  return createPortal(
    <div
      ref={(el) => { ref.current = el; onRef?.(el); }}
      role={role}
      aria-label={label}
      className={cn("fixed z-[120]", className)}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Explains what a tool does (shown on hover / keyboard focus). */
function HoverCard({ def, group }: { def: ToolDef; group?: string }) {
  return (
    <div className="pointer-events-none w-64 rounded-xl border border-border bg-surface p-3 text-left shadow-lg animate-fade-in">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        {def.label}
        {def.key && <kbd className="ml-auto rounded border border-border px-1.5 text-[10px] font-medium text-ink-3">{def.key.toUpperCase()}</kbd>}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{def.hint}</p>
      {group && <p className="mt-2 text-[11px] font-medium text-accent">Click to see all {group.toLowerCase()} tools ›</p>}
    </div>
  );
}

/** Tool palette with a visible label under every tool. Groups open a menu and remember the last tool used. */
export function ToolRail({ onPick, orientation }: Props) {
  const tool = useEditor((s) => s.tool);
  const [lastInGroup, setLast] = useState<Record<number, ToolId>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const buttons = useRef<Record<number, HTMLButtonElement | null>>({});
  const menuEl = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuEl.current?.contains(t)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  // Move focus into an opened menu for keyboard users.
  useEffect(() => {
    if (open !== null) requestAnimationFrame(() => menuEl.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }));
  }, [open]);

  const vertical = orientation === "vertical";
  const side = vertical ? "right" : "top";

  return (
    <div ref={ref} role="toolbar" aria-label="Tools" aria-orientation={orientation} className={cn("flex items-center gap-0.5", vertical ? "flex-col py-2" : "flex-row overflow-x-auto px-1 py-1")}>
      {RAIL.map((item, i) => {
        if (item === "|") return <div key={i} className={cn("shrink-0 bg-border", vertical ? "my-1 h-px w-10" : "mx-0.5 h-8 w-px")} />;
        const group = typeof item === "object" ? item : null;
        const id = group ? (group.tools.includes(tool) ? tool : lastInGroup[i] ?? group.tools[0]) : (item as ToolId);
        const def = TOOL_DEFS[id];
        const Icon = def.icon;
        const active = group ? group.tools.includes(tool) : tool === id;
        // Groups show their own name until a specific tool in them is active.
        const caption = group && !active ? group.name : def.short;
        const anchor = buttons.current[i];
        return (
          <div key={i} className="relative shrink-0">
            <button
              ref={(el) => { buttons.current[i] = el; }}
              onClick={() => { setHover(null); if (group) setOpen(open === i ? null : i); else { onPick(id); setOpen(null); } }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setHover(i); }}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              aria-label={`${def.label}${def.key ? ` (${def.key.toUpperCase()})` : ""}`}
              aria-pressed={active}
              aria-haspopup={group ? "menu" : undefined}
              aria-expanded={group ? open === i : undefined}
              data-tool={id}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink",
                vertical ? "h-[52px] w-[64px]" : "h-[50px] w-[58px]",
                (active || open === i) && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
              <span className="max-w-full truncate px-0.5 text-[10.5px] leading-tight font-medium">{caption}</span>
              {group && <ChevronRight className={cn("absolute size-2.5 opacity-60", vertical ? "top-1.5 right-1" : "top-1 right-1 -rotate-90")} aria-hidden />}
            </button>

            {/* Hover cards only on devices with a real pointer; touch users get the hint bar. */}
            {hover === i && open !== i && anchor && (
              <Floating anchor={anchor} side={side} className="hidden [@media(hover:hover)]:block">
                <HoverCard def={def} group={group?.name} />
              </Floating>
            )}

            {group && open === i && anchor && (
              <Floating anchor={anchor} side={side} role="menu" label={group.name} onRef={(el) => { menuEl.current = el; }}
                className="w-72 rounded-xl border border-border bg-surface p-1.5 shadow-lg animate-pop">
                <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{group.name}</p>
                {group.tools.map((g) => {
                  const d = TOOL_DEFS[g];
                  const GI = d.icon;
                  return (
                    <button key={g} role="menuitem" onClick={() => { setLast((l) => ({ ...l, [i]: g })); onPick(g); setOpen(null); }}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                        e.preventDefault();
                        const items = Array.from(menuEl.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
                        const k = items.indexOf(e.currentTarget);
                        items[(k + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
                      }}
                      className={cn("flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2", tool === g && "bg-accent-soft")}>
                      <GI className={cn("mt-0.5 size-4 shrink-0", tool === g ? "text-accent" : "text-ink-2")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[13px] font-medium">{d.label}{d.key && <kbd className="ml-auto rounded border border-border px-1 text-[10px] text-ink-3">{d.key.toUpperCase()}</kbd>}</span>
                        <span className="block text-xs leading-snug text-ink-2">{d.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </Floating>
            )}
          </div>
        );
      })}
    </div>
  );
}
