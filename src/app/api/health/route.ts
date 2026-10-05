import { json } from "@/lib/server/http";
import { config, processingAvailable } from "@/lib/server/config";

export const dynamic = "force-dynamic";

// Cache the worker probe briefly so health checks stay cheap.
let cache: { at: number; ok: boolean } | null = null;

async function workerReachable(): Promise<boolean> {
  if (!processingAvailable()) return false;
  if (cache && Date.now() - cache.at < 15_000) return cache.ok;
  let ok = false;
  try {
    // In production the worker is private (Cloud Run IAM) and reached only via Cloud Tasks;
    // we can't probe it, so trust configuration there.
    if (config.queue === "cloudtasks") ok = true;
    else ok = (await fetch(`${config.workerUrl}/healthz`, { signal: AbortSignal.timeout(1500), cache: "no-store" })).ok;
  } catch { ok = false; }
  cache = { at: Date.now(), ok };
  return ok;
}

export async function GET() {
  return json({ ok: true, processing: await workerReachable() });
}
