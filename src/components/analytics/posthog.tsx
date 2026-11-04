"use client";

import { useEffect } from "react";
import type { CaptureResult } from "posthog-js";
import { useAuth } from "@/lib/auth/store";
import { isDesktopApp } from "@/lib/auth/desktop";

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

/** A share link's #fragment is the key to someone's file: never let analytics load on that page. */
const onSharedFilePage = () => location.pathname.startsWith("/s/");

function scrub(event: CaptureResult): CaptureResult | null {
  if (onSharedFilePage()) return null;
  const editor = location.pathname.startsWith("/editor");
  if (editor && event.event.startsWith("$") && !KEEP_IN_EDITOR.has(event.event)) return null;
  return event;
}

export function PostHogAnalytics() {
  useEffect(() => {
    if (!KEY || onSharedFilePage()) return;
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
      // Lets the admin panel count desktop app users apart from the website.
      posthog.register({ app: isDesktopApp() ? "desktop" : "web" });
      // Lets the admin panel split visitors into signed-in and not registered, and show a
      // signed-in account's own activity. `uid` is the random Firebase ID, never the email.
      const tag = (uid: string | undefined) => {
        posthog.register({ signed_in: !!uid });
        if (uid) posthog.register({ uid });
        else posthog.unregister("uid");
      };
      tag(useAuth.getState().user?.uid);
      unsubscribe = useAuth.subscribe((s, prev) => { if (s.user?.uid !== prev.user?.uid) tag(s.user?.uid); });
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
