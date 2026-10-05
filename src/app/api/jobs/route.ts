import { getJobs, type Job } from "@/lib/server/jobs";
import { getStore } from "@/lib/server/storage";
import { getLimiter } from "@/lib/server/ratelimit";
import { config, processingAvailable } from "@/lib/server/config";
import { newJobId, jobToken, hashClient } from "@/lib/server/tokens";
import { OPS, isServerOp } from "@/lib/server/ops";
import { json, fail, clientIp, sameOrigin } from "@/lib/server/http";
import { limitsFor } from "@/lib/limits";

export const dynamic = "force-dynamic";

const EXT_OK = /^(pdf|docx|xlsx|pptx|odt|txt|png|jpe?g|webp)$/;

/** Create a job and return signed upload URLs. No file contents pass through this server. */
export async function POST(req: Request) {
  if (!processingAvailable()) return fail(503, "processing_unavailable", "Processing is not available");
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  let body: { op?: unknown; files?: { name?: unknown; size?: unknown; type?: unknown }[] };
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Invalid JSON"); }
  if (!isServerOp(body.op)) return fail(400, "bad_op", "Unknown operation");
  const op = OPS[body.op];
  const plan = limitsFor();
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length || files.length > op.maxFiles) return fail(400, "bad_files", "Wrong number of files");

  const client = hashClient(clientIp(req));
  const [burst, daily] = await Promise.all([
    getLimiter().hit(`b_${client}`, 10, 60),
    getLimiter().hit(`d_${client}`, plan.serverTasksPerDay, 86_400),
  ]);
  if (!burst.ok || !daily.ok) return fail(429, "rate_limited", "Too many requests");

  const id = newJobId();
  const inputs: Job["inputs"] = [];
  const uploads: { url: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const size = Number(f.size);
    if (!Number.isFinite(size) || size <= 0 || size > plan.maxFileBytes) return fail(413, "too_large", "File is too large");
    const ext = String(f.name ?? "").toLowerCase().split(".").pop() ?? "";
    const safeExt = EXT_OK.test(ext) ? ext.replace("jpeg", "jpg") : "bin";
    const key = `tmp/${id}/in-${i}.${safeExt}`;
    const contentType = typeof f.type === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(f.type) ? f.type : "application/octet-stream";
    inputs.push({ key, size, contentType, ext: safeExt });
    uploads.push({ url: await getStore().signedUploadUrl(key, contentType, plan.maxFileBytes) });
  }
  const now = Date.now();
  await getJobs().create({ id, op: body.op, status: "UPLOADING", inputs, createdAt: now, updatedAt: now, expiresAt: now + config.jobTtlMs, ownerId: null });
  return json({ jobId: id, token: jobToken(id), uploads, expiresAt: now + config.jobTtlMs }, 201);
}
