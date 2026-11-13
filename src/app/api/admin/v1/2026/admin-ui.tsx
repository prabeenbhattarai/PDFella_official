"use client";

import { cn } from "@/lib/utils";

/** Shared building blocks for the admin panel, so every section looks the same. */

export const fmt = (n: number) => n.toLocaleString();
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—");

/** Stripe amounts are in cents. */
export function money(cents: number, currency = "usd", whole = false) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), ...(whole ? { maximumFractionDigits: 0 } : {}) }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

type Icon = React.ComponentType<{ className?: string }>;

/** A headline number. */
export function Stat({ icon: Icon, label, value, hint, tone = "default", testId }: { icon: Icon; label: string; value: string; hint?: React.ReactNode; tone?: "default" | "accent"; testId?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:p-5" data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-3")}><Icon className="size-4" aria-hidden /></span>
      </div>
      <p className="mt-1 text-[24px] leading-tight font-semibold tracking-tight text-ink tabular-nums sm:text-[28px]">{value}</p>
      {hint && <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>;
}

/** A titled block within a page. */
export function Block({ title, description, actions, children, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mt-8", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A bordered card for tables and lists. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.03)]", className)}>{children}</div>;
}

export function Missing({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border-strong bg-surface p-5 text-[14px] text-ink-3">{text}</p>;
}

const TONES = {
  ok: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-2 text-ink-2",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap", TONES[tone])}>{children}</span>;
}

/** Table header cell and body cell styles. */
export const th = "px-4 py-2.5 text-[12px] font-medium whitespace-nowrap text-ink-3 sm:px-5";
export const td = "px-4 py-3 sm:px-5";
