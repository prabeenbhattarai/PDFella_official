"use client";

import { create } from "zustand";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; title: string; body?: string; action?: { label: string; onClick: () => void } }

const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === "error" ? 8000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, body?: string) => useToasts.getState().push({ kind: "success", title, body }),
  error: (title: string, body?: string, action?: Toast["action"]) => useToasts.getState().push({ kind: "error", title, body, action }),
  info: (title: string, body?: string) => useToasts.getState().push({ kind: "info", title, body }),
};

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end" role="region" aria-label="Notifications">
      {toasts.map((t) => {
        const Icon = icons[t.kind];
        return (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-lg animate-pop">
            <Icon className={cn("mt-0.5 size-4 shrink-0", t.kind === "success" && "text-ok", t.kind === "error" && "text-danger", t.kind === "info" && "text-accent")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] text-ink-3">{t.body}</p>}
              {t.action && (
                <button className="mt-1.5 text-[13px] font-medium text-accent hover:underline" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="rounded p-1 text-ink-3 hover:bg-surface-2" aria-label="Dismiss"><X className="size-3.5" /></button>
          </div>
        );
      })}
    </div>
  );
}
