"use client";

import { useEffect } from "react";
import type { CaptureResult } from "posthog-js";
import { useAuth } from "@/lib/auth/store";

/**
 * PostHog product analytics. Loads only when NEXT_PUBLIC_POSTHOG_KEY is set, and
 * is configured so nothing from a user's document can reach it:
 *  - cookieless: no cookies or local storage, so no consent banner is needed
 *    (cookieless mode must also be enabled in the PostHog project settings);
 *  - autocapture records which element was clicked, never its text or attributes;
 *  - inside the editor, where the page is made of document content, only our own
 *    allowlisted events (see lib/analytics.ts) and pageviews are sent;
 *  - no session recordings, surveys or exception capture.
 * Requests go through the /ingest rewrite in next.config.ts so the CSP stays 'self'.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const KEEP_IN_EDITOR = new Set(["$pageview", "$pageleave"]);

function scrub(event: CaptureResult): CaptureResult | null {
  const editor = location.pathname.startsWith("/editor");
  if (editor && event.event.startsWith("$") && !KEEP_IN_EDITOR.has(event.event)) return null;
  return event;
}

export function PostHogAnalytics() {
  useEffect(() => {
    if (!KEY) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    // Loaded after hydration so it never weighs on first paint.
    import("posthog-js").then(({ default: posthog }) => {
      if (cancelled || posthog.__loaded) return;
      posthog.init(KEY, {
        api_host: "/ingest",
        ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://eu.posthog.com",
        defaults: "2026-08-30",
        cookieless_mode: "always",
        person_profiles: "identified_only",
        mask_all_text: true,
        mask_all_element_attributes: true,
        disable_session_recording: true,
        disable_surveys: true,
        capture_exceptions: false,
        before_send: scrub,
      });
      window.__pdfellaAnalytics = (event, props) => posthog.capture(event, props);
      // Lets the admin panel split visitors into signed-in and not registered.
      const tag = (signedIn: boolean) => posthog.register({ signed_in: signedIn });
      tag(!!useAuth.getState().user);
      unsubscribe = useAuth.subscribe((s, prev) => { if (!!s.user !== !!prev.user) tag(!!s.user); });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  return null;
}

declare global {
  interface Window {
    __pdfellaAnalytics?: (event: string, props: Record<string, string | number | boolean | undefined>) => void;
  }
}
