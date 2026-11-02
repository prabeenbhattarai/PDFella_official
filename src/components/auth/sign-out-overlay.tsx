"use client";

import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth/store";
import { cn } from "@/lib/utils";

/** "Signing you out…" then "You're signed out", shown by signOutUser() in lib/auth/firebase.ts. */
export function SignOutOverlay() {
  const state = useAuth((s) => s.signingOut);
  if (!state) return null;
  const { user, done } = state;
  const first = user.name?.split(" ")[0];
  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface px-8 py-10 text-center shadow-[0_30px_80px_-30px_rgb(0_0_0/.35)]">
        <div className="relative mx-auto grid size-24 place-items-center">
          <svg viewBox="0 0 100 100" className={cn("absolute inset-0 size-full motion-reduce:animate-none", !done && "animate-spin [animation-duration:1.1s]")} aria-hidden>
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={done ? "290 0" : "70 220"} className="transition-[stroke-dasharray] duration-500" />
          </svg>
          <span className="flex size-[72px] items-center justify-center overflow-hidden rounded-full bg-surface-2 text-[26px] font-semibold text-ink">
            {user.photo
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar, tiny; next/image would need a remote pattern
              ? <img src={user.photo} alt="" referrerPolicy="no-referrer" className={cn("size-full object-cover transition", done && "opacity-40 grayscale")} />
              : initial}
          </span>
          {done && (
            <span className="absolute -right-0.5 -bottom-0.5 flex size-8 items-center justify-center rounded-full border-4 border-surface bg-accent text-accent-ink animate-fade-in">
              <Check className="size-4" strokeWidth={3} />
            </span>
          )}
        </div>
        <p className="mt-6 text-[19px] font-semibold tracking-tight text-ink">{done ? "You're signed out" : "Signing you out…"}</p>
        <p className="mt-1.5 text-[14px] text-ink-3">
          {done ? "Sign in any time to pick up where you left off." : `See you soon${first ? `, ${first}` : ""}.`}
        </p>
        {user.email && <p className="mt-5 inline-flex max-w-full truncate rounded-full bg-surface-2 px-3 py-1 text-[12.5px] font-medium text-ink-2">{user.email}</p>}
      </div>
    </div>
  );
}
