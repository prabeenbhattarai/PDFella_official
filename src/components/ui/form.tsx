"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return (
    <input
      ref={ref}
      className={cn("h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50", className)}
      {...p}
    />
  );
});

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)]", className)} {...p}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-2">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format, onCommit }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onCommit?: () => void; format?: (v: number) => string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-ink-2">{label}</label>
        <span className="text-xs tabular-nums text-ink-3">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onCommit}
        onKeyDown={(e) => { if (e.key.startsWith("Arrow")) onCommit?.(); }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-[var(--accent)]"
      />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          aria-label={o.title}
          onClick={() => onChange(o.value)}
          className={cn("flex h-8 flex-1 items-center justify-center rounded-md text-[13px] font-medium text-ink-2 transition [&_svg]:size-4", value === o.value && "bg-surface text-ink shadow-sm")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative h-5 w-9 rounded-full transition", checked ? "bg-accent" : "bg-surface-3")}>
        <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition", checked && "translate-x-4")} />
      </button>
    </label>
  );
}

const SWATCHES = ["#15171c", "#5b6170", "#ffffff", "#d0312d", "#e8780c", "#f5c400", "#ffe14d", "#2e9e5b", "#0c7a64", "#1f6feb", "#6e40c9", "#d6339a"];

export function ColorPicker({ label, value, onChange, allowNone, swatches = SWATCHES }: { label: string; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean; swatches?: string[] }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <span id={id} className="block text-xs font-medium text-ink-2">{label}</span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-1.5">
        {allowNone && (
          <button onClick={() => onChange(null)} aria-label="No colour" aria-pressed={value === null} className={cn("relative size-6 rounded-full border border-border-strong bg-surface", value === null && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}>
            <span className="absolute top-1/2 left-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-danger" />
          </button>
        )}
        {swatches.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            aria-label={`Colour ${c}`}
            aria-pressed={value?.toLowerCase() === c}
            className={cn("size-6 rounded-full border border-black/10", value?.toLowerCase() === c && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}
            style={{ background: c }}
          />
        ))}
        <label className="relative size-6 cursor-pointer overflow-hidden rounded-full border border-border-strong" title="Custom colour" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}>
          <input type="color" value={value ?? "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" />
        </label>
      </div>
    </div>
  );
}

export function Progress({ value, className }: { value: number | null; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
      <div className={cn("h-full rounded-full bg-accent transition-[width] duration-300", value === null && "w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite]")} style={value === null ? undefined : { width: `${value}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden />;
}
