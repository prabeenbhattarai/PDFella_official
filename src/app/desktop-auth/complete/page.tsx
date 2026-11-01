"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { openFromBrowser } from "@/lib/auth/desktop";
import { signInWithFirebaseCustomToken } from "@/lib/auth/firebase";

/** Shown inside the desktop app when the browser hands the sign-in back (pdfella://auth). */
export default function DesktopAuthCompletePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = location.hash;
    history.replaceState(null, "", location.pathname);
    openFromBrowser(hash)
      .then(async ({ customToken, returnTo }) => {
        await signInWithFirebaseCustomToken(customToken);
        router.replace(returnTo);
      })
      .catch((e) => setError((e as Error).message || "Sign-in failed. Please try again."));
  }, [router]);

  return (
    <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8 text-center">
      {error ? (
        <>
          <h1 className="text-[20px] font-semibold text-ink">Couldn&apos;t sign you in</h1>
          <p role="alert" className="mt-2 text-[14px] text-ink-3">{error}</p>
          <button type="button" onClick={() => router.replace("/")} className="mt-6 h-11 w-full rounded-xl bg-ink text-[14px] font-semibold text-bg hover:opacity-90">Back to PDFella</button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-[14px] text-ink-3"><Loader2 className="size-6 animate-spin" /> Signing you in…</div>
      )}
    </div>
  );
}
