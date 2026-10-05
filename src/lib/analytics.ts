/**
 * Privacy-conscious analytics. Only event names and coarse, non-identifying
 * properties are allowed — never file names, contents, or text the user typed.
 */
export type AnalyticsEvent =
  | "tool_opened"
  | "file_uploaded"
  | "edit_started"
  | "edit_completed"
  | "conversion_started"
  | "conversion_completed"
  | "download_completed"
  | "error_occurred";

type SafeProps = Record<string, string | number | boolean | undefined>;

const ALLOWED_KEYS = new Set(["tool", "pages", "sizeBucket", "format", "code", "engine", "count"]);

export function sizeBucket(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return "<1MB";
  if (mb < 10) return "1-10MB";
  if (mb < 50) return "10-50MB";
  return "50MB+";
}

export function track(event: AnalyticsEvent, props: SafeProps = {}) {
  const safe: SafeProps = {};
  for (const [k, v] of Object.entries(props)) if (ALLOWED_KEYS.has(k)) safe[k] = v;
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event, safe);
    return;
  }
  // Provider hook: window.__pdfellaAnalytics is set by an optional provider script
  // (e.g. Firebase Analytics) only after consent.
  const sink = (window as unknown as { __pdfellaAnalytics?: (e: string, p: SafeProps) => void }).__pdfellaAnalytics;
  sink?.(event, safe);
}
