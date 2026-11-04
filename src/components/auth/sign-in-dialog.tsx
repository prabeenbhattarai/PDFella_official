"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FilePlus2, Loader2, LockKeyhole, ShieldCheck, Signature, Sparkles, Stamp, Type, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { LogoMark } from "@/components/ui/logo";
import { useAuth, type LockedFeature } from "@/lib/auth/store";
import { signInWithGoogle } from "@/lib/auth/firebase";
import { loadGsi, setGsiErrorHandler } from "@/lib/auth/gsi";

/** Set when a visitor chooses "Continue without an account" so we don't ask again this session. */
export const SKIPPED = "pdfella:auth-skipped";

const COPY: Record<LockedFeature, { title: string; body: string }> = {
  editor: { title: "Unlock the full editor", body: "Sign in to sign, stamp, add pages and use every font. It's free and takes one click." },
  signature: { title: "Sign in to add your signature", body: "Draw, type or upload a signature and place it anywhere. Free with a one-click sign-in." },
  stamp: { title: "Sign in to use stamps", body: "Approved, Draft, Confidential and your own custom stamps. Free with a one-click sign-in." },
  pages: { title: "Sign in to add pages", body: "Insert blank pages, other PDFs and images anywhere in your document. Free with a one-click sign-in." },
  share: { title: "Sign in to share your PDF", body: "Create encrypted links you can send to anyone, and delete them whenever you like. Free with a one-click sign-in." },
  fonts: { title: "Sign in to style your text", body: "Every font, plus bold, italic and underline. Free with a one-click sign-in." },
};

const UNLOCKS: { feature: LockedFeature; icon: typeof Signature; title: string; body: string }[] = [
  { feature: "signature", icon: Signature, title: "Signatures", body: "Draw, type or upload" },
  { feature: "stamp", icon: Stamp, title: "Stamps", body: "Approved, Draft and custom" },
  { feature: "pages", icon: FilePlus2, title: "Add pages", body: "Blank pages, PDFs and images" },
  { feature: "fonts", icon: Type, title: "Fonts & styles", body: "Every font, bold and italic" },
];

const TRUST = [
  { icon: Zap, label: "Free forever" },
  { icon: LockKeyhole, label: "No password" },
  { icon: ShieldCheck, label: "Files stay private" },
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function errorMessage(e: unknown): string | null {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return null;
  if (code.includes("popup-blocked")) return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (code.includes("network")) return "You seem to be offline. Check your connection and try again.";
  return "We couldn't sign you in. Please try again.";
}

/** Branded side: what signing in unlocks, with the feature they just tried highlighted. */
function BrandPanel({ feature }: { feature: LockedFeature }) {
  return (
    <div className="relative hidden overflow-hidden bg-[linear-gradient(155deg,#0f8a71_0%,#0b6b57_45%,#063f34_100%)] p-8 text-white md:flex md:flex-col">
      {/* soft light and a faint grid */}
      <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:28px_28px]" aria-hidden />

      <div className="relative flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white/95"><LogoMark className="size-7 drop-shadow-none" /></span>
        <span className="text-[15px] font-semibold tracking-tight">{brand.name}</span>
      </div>

      <p className="relative mt-8 font-display text-[34px] leading-[1.05] tracking-tight">Everything you need to finish the document.</p>

      {/* a signature drawing itself */}
      <div className="relative mt-6 rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-sm">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-white/60 uppercase">Signed</p>
        <svg viewBox="0 0 240 56" preserveAspectRatio="xMinYMid meet" className="mt-1 h-12 w-full" aria-hidden>
          <path d="M6 40c14-22 26-30 32-22 5 7-7 24 1 25 9 1 18-30 26-27 7 3-6 25 2 26 10 2 20-28 30-26 8 2 2 22 10 22 11 0 18-17 28-19 9-2 4 14 12 15 12 1 26-12 40-14 13-2 22 2 40 0"
            fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 360, ["--len" as string]: 360, animation: "draw 2.2s ease-out 0.2s both" }} />
        </svg>
        <div className="mt-1 h-px bg-white/25" />
      </div>

      <ul className="relative mt-6 grid grid-cols-2 gap-2.5">
        {UNLOCKS.map(({ feature: f, icon: Icon, title, body }) => {
          const hit = f === feature;
          return (
            <li key={f} className={cn("rounded-xl border p-3 transition-colors", hit ? "border-white/70 bg-white/20 shadow-[0_0_0_3px_rgb(255_255_255/0.12)]" : "border-white/15 bg-white/[0.06]")}>
              <div className="flex items-center justify-between">
                <Icon className="size-4" aria-hidden />
                {hit && <span className="rounded-full bg-white px-1.5 py-px text-[10px] font-bold text-[#0b6b57]">You need this</span>}
              </div>
              <p className="mt-2 text-[13.5px] font-semibold">{title}</p>
              <p className="text-[12px] text-white/70">{body}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The sign-in modal. Google's own personalised button ("Continue as Name")
 * when Google Identity Services is configured, otherwise a Google popup button.
 */
export function SignInDialog() {
  const prompt = useAuth((s) => s.prompt);
  const close = useAuth((s) => s.closePrompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const [width, setWidth] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const gsiSlot = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const open = !!prompt;

  const skip = () => {
    try { sessionStorage.setItem(SKIPPED, "1"); } catch { /* private mode */ }
    close();
  };

  // Focus, Esc, focus trap, scroll lock — as components/ui/dialog.tsx.
  useEffect(() => {
    if (!open) return;
    setError(null);
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button, [href], iframe, [tabindex]:not([tabindex="-1"])') ?? []).filter((el) => !el.hasAttribute("disabled"));
    node?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); skip(); }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setGsiErrorHandler((e) => setError(errorMessage(e)));
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      setGsiErrorHandler(null);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skip() only reads stable store actions
  }, [open]);

  // Google's personalised button needs a pixel width; measure the column it sits in.
  useEffect(() => {
    if (!open || !gsiSlot.current) return;
    const el = gsiSlot.current.parentElement!;
    const ro = new ResizeObserver(() => setWidth(Math.min(400, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !width) return;
    let cancelled = false;
    loadGsi().then((google) => {
      if (cancelled || !google || !gsiSlot.current) return;
      google.accounts.id.cancel(); // no One Tap card on top of the dialog
      gsiSlot.current.innerHTML = "";
      google.accounts.id.renderButton(gsiSlot.current, {
        type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", logo_alignment: "left", width,
      });
      setGsiReady(true);
    });
    return () => { cancelled = true; };
  }, [open, width]);

  if (!open || typeof document === "undefined") return null;
  const copy = COPY[prompt.feature];

  const popup = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[#0b0d10]/55 backdrop-blur-[3px] animate-fade-in" onClick={skip} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
        className="relative grid max-h-[94vh] w-full overflow-hidden rounded-t-3xl border border-border bg-surface shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)] animate-pop sm:max-w-[880px] sm:rounded-3xl md:grid-cols-[1.05fr_1fr]">
        <BrandPanel feature={prompt.feature} />

        <div className="relative flex flex-col overflow-y-auto px-6 pt-7 pb-6 sm:px-10 sm:pt-10 sm:pb-8">
          <button type="button" onClick={skip} aria-label="Close" className="absolute top-4 right-4 rounded-full p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
            <X className="size-4" />
          </button>
          <div className="mx-auto h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />

          <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent sm:mt-0">
            <Sparkles className="size-3.5" aria-hidden /> Free account
          </span>
          <h2 id={titleId} className="mt-4 text-[26px] leading-tight font-semibold tracking-tight text-ink">{copy.title}</h2>
          <p id={descId} className="mt-2 text-[15px] leading-relaxed text-ink-3">{copy.body}</p>

          {/* Mobile: the unlocks as compact chips (the brand panel is hidden). */}
          <div className="mt-4 flex flex-wrap gap-1.5 md:hidden">
            {UNLOCKS.map(({ feature: f, icon: Icon, title }) => (
              <span key={f} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px]", f === prompt.feature ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border text-ink-2")}>
                <Icon className="size-3.5" aria-hidden /> {title}
              </span>
            ))}
          </div>

          <div className="mt-7">
            {/* Google's personalised button: shows the account already signed in to this browser. */}
            <div ref={gsiSlot} className={cn("flex min-h-11 justify-center", !gsiReady && "hidden")} />
            {!gsiReady && (
              <button type="button" data-autofocus onClick={popup} disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border-strong bg-white text-[15px] font-semibold text-[#1f1f1f] shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition hover:bg-[#f8f9fa] hover:shadow-[0_2px_6px_rgb(0_0_0/0.08)] disabled:opacity-70">
                {busy ? <Loader2 className="size-5 animate-spin text-[#5f6368]" aria-hidden /> : <GoogleMark />}
                {busy ? "Waiting for Google…" : "Continue with Google"}
              </button>
            )}
            {gsiReady && (
              <button type="button" onClick={popup} disabled={busy} className="mt-3 w-full text-center text-[13px] font-medium text-ink-3 hover:text-ink">
                {busy ? "Waiting for Google…" : "Use another Google account"}
              </button>
            )}
            {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
          </div>

          <div className="my-6 flex items-center gap-3 text-[12px] text-ink-3">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <button type="button" onClick={skip}
            className="h-11 w-full rounded-xl border border-border text-[14px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            {prompt.feature === "editor" ? "Continue without an account" : "Not now"}
          </button>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3"><Icon className="size-3.5 text-accent" aria-hidden /> {label}</li>
            ))}
          </ul>

          <p className="mt-auto pt-6 text-center text-[11.5px] leading-relaxed text-ink-3">
            By continuing you agree to our <Link href="/terms" onClick={close} className="underline hover:text-ink">Terms</Link> and <Link href="/privacy#accounts" onClick={close} className="underline hover:text-ink">Privacy Policy</Link>. We only receive your name, email and photo. Your documents are never uploaded to your account.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
