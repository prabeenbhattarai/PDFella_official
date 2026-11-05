"use client";

import Link from "next/link";
import { billingEnabled } from "@/lib/billing-client";
import { useEffect, useRef, useState } from "react";
import { CreditCard, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { authEnabled, useAuth } from "@/lib/auth/store";
import { signOutUser } from "@/lib/auth/firebase";

/** Header control: "Sign in" for visitors, an avatar menu once signed in. */
export function AccountButton({ compact, signInClassName = "hidden sm:inline-flex", menuAbove }: { compact?: boolean; signInClassName?: string; menuAbove?: boolean }) {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!authEnabled || !ready) return null;

  if (!user) {
    return (
      <button type="button" onClick={() => useAuth.getState().openPrompt("editor")}
        className={cn("h-10 items-center rounded-xl px-3 font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", signInClassName, compact ? "text-[13.5px]" : "text-[14px]")}>
        Sign in
      </button>
    );
  }

  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Account"
        className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 text-[14px] font-semibold text-ink">
        {user.photo
          // eslint-disable-next-line @next/next/no-img-element -- remote avatar, tiny; next/image would need a remote pattern
          ? <img src={user.photo} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          : initial}
      </button>
      {open && (
        <div role="menu" className={cn("absolute z-50 w-64", menuAbove ? "bottom-12 left-0" : "right-0 top-12", "rounded-xl border border-border bg-surface p-2 shadow-lg")}>
          <div className="px-2.5 py-2">
            {user.name && <p className="truncate text-[14px] font-semibold text-ink">{user.name}</p>}
            {user.email && <p className="truncate text-[13px] text-ink-3">{user.email}</p>}
          </div>
          <div className="my-1 border-t border-border" />
          {billingEnabled && (
            <Link href="/account" role="menuitem" onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              <CreditCard className="size-4" /> Manage subscription
            </Link>
          )}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); void signOutUser(); }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
