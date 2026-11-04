import { json, fail, clientIp, sameOrigin } from "@/lib/server/http";
import { shareConfig } from "@/lib/server/config";
import { hashClient } from "@/lib/server/tokens";
import { getLimiter } from "@/lib/server/ratelimit";
import { getShares, isLive, validShareId } from "@/lib/server/shares";

export const dynamic = "force-dynamic";

const REASONS = ["malware", "phishing", "copyright", "illegal", "other"];
const MAX_REPORTS_KEPT = 25;

/** Anyone holding a link can report it. Reports appear in the admin panel. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  if (shareConfig().backend === "off" || !validShareId(id)) return fail(404, "not_found", "Not found");
  const { ok } = await getLimiter().hit(`sr_${hashClient(clientIp(req))}`, 10, 3600);
  if (!ok) return fail(429, "rate_limited", "Too many reports. Please try again later.");
  let body: { reason?: unknown; details?: unknown };
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Invalid JSON"); }
  const reason = String(body.reason);
  if (!REASONS.includes(reason)) return fail(400, "bad_request", "Choose a reason");
  const shares = getShares();
  const r = await shares.get(id);
  if (!isLive(r)) return fail(404, "not_found", "Not found");
  const report = { reason, details: String(body.details ?? "").slice(0, 500), at: Date.now() };
  await shares.update(id, { reports: [...r.reports, report].slice(-MAX_REPORTS_KEPT) });
  return json({ ok: true });
}
