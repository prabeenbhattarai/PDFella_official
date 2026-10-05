import "server-only";
import { NextResponse } from "next/server";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Errors are always generic for clients; details go to logs without document data. */
export function fail(status: number, code: string, message: string) {
  return json({ code, message }, status);
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/** Same-origin check for state-changing browser requests (CSRF defence in depth; we use no cookies). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients
  try {
    return new URL(origin).host === new URL(req.url).host || origin === process.env.APP_URL;
  } catch {
    return false;
  }
}
