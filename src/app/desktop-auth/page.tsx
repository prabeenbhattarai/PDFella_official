"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Monitor } from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import { brand } from "@/lib/brand";
import { useAuth } from "@/lib/auth/store";
import { currentIdToken, signInWithGoogle } from "@/lib/auth/firebase";
import { sealForApp } from "@/lib/auth/desktop";

/** Opened in the system browser by the desktop app: sign in here, then hand over to the app. */
export default function DesktopAuthPage() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const params = useRef<{ k: string; s: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Read the one-time key from the fragment and drop it from the address bar and history.
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    const k = p.get("k"), s = p.get("s");
    if (k && s) params.current = { k, s };
    else setError("Open this page from the PDFella desktop app by clicking Sign in.");
    history.replaceState(null, "", location.pathname);
  }, []);

  // Once signed in, mint the hand-over link and open the app.
  useEffect(() => {
    if (!user || !params.current || link) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/desktop-token", { method: "POST", headers: { Authorization: `Bearer ${await currentIdToken()}` } });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.customToken) throw new Error(body?.message ?? "Couldn't prepare the sign-in for the app.");
        const url = await sealForApp(params.current!.k, params.current!.s, body.customToken);
        if (cancelled) return;
        setLink(url);
        location.href = url;
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [user, link]);

  return (
    <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
      <div className="relative mx-auto w-fit">
        <LogoMark className="size-14" />
        <span className="absolute -right-2 -bottom-1 flex size-7 items-center justify-center rounded-full border-2 border-surface bg-ink text-bg"><Monitor className="size-3.5" /></span>
      </div>
      {link ? (
        <>
          <CheckCircle2 className="mx-auto mt-6 size-8 text-accent" />
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-ink">You&apos;re signed in</h1>
          <p className="mt-2 text-[14px] text-ink-3">Return to the {brand.name} app. If it didn&apos;t open, click below.</p>
          <a href={link} className="mt-6 flex h-12 items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-bg hover:opacity-90">Open {brand.name}</a>
          <p className="mt-4 text-[12.5px] text-ink-3">You can close this tab.</p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-[22px] font-semibold tracking-tight text-ink">Sign in to the {brand.name} app</h1>
          <p className="mt-2 text-[14px] text-ink-3">Sign in with Google here and we&apos;ll take you back to the app.</p>
          {error ? (
            <p role="alert" className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>
          ) : !ready || (user && !link) ? (
            <Loader2 className="mx-auto mt-6 size-6 animate-spin text-ink-3" />
          ) : (
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await signInWithGoogle(); } catch { /* closed */ } finally { setBusy(false); } }}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-white text-[15px] font-semibold text-[#1f1f1f] hover:bg-[#f8f9fa] disabled:opacity-70">
              {busy && <Loader2 className="size-5 animate-spin" />} Continue with Google
            </button>
          )}
        </>
      )}
    </div>
  );
}
