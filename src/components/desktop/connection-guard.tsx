"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktopApp } from "@/lib/auth/desktop";

const CHECK_EVERY_MS = 30_000;
const CHECK_TIMEOUT_MS = 8_000;

/** The browser's online flag can stay true with no real connection, so ask the server too. */
async function reachable() {
  if (!navigator.onLine) return false;
  try {
    await fetch("/api/health", { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Desktop app only: it needs the internet, so without a connection this covers
 * the window with an error until it's back. Open documents stay as they are underneath.
 */
export function DesktopConnectionGuard() {
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setDown(!(await reachable()));
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!isDesktopApp()) return;
    const lost = () => setDown(true);
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    window.addEventListener("offline", lost);
    window.addEventListener("online", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("offline", lost);
      window.removeEventListener("online", check);
    };
  }, [check]);

  if (!down) return null;
  return (
    <div role="alert" className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/95 p-4 backdrop-blur-sm" data-testid="no-connection">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8 text-center shadow-lg">
        <WifiOff className="mx-auto size-10 text-ink-3" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold tracking-tight">No internet connection</h2>
        <p className="mt-1.5 text-sm text-ink-3">PDFella needs the internet to work. Your open documents are still here, and you can carry on as soon as you reconnect.</p>
        <Button size="lg" className="mt-5 w-full" disabled={checking} onClick={() => void check()}>{checking && <Loader2 className="animate-spin" />} Try again</Button>
      </div>
    </div>
  );
}
