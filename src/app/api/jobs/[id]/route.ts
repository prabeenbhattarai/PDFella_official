import { getJobs } from "@/lib/server/jobs";
import { getStore } from "@/lib/server/storage";
import { checkJobToken } from "@/lib/server/tokens";
import { json, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!checkJobToken(id, req.headers.get("authorization"))) return fail(401, "unauthorized", "Invalid token");
  const job = await getJobs().get(id);
  if (!job) return fail(404, "not_found", "Job not found");
  if (job.expiresAt < Date.now() && job.status !== "EXPIRED") return json({ jobId: id, status: "EXPIRED" });
  const res: Record<string, unknown> = { jobId: id, status: job.status, progress: job.progress };
  if (job.status === "ERROR") res.error = job.error;
  if (job.status === "READY" && job.output) {
    const name = `result.${job.output.ext}`;
    res.resultUrl = await getStore().signedDownloadUrl(job.output.key, name);
    res.resultName = name;
  }
  return json(res);
}

/** User-initiated deletion: removes all files for the job immediately. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!checkJobToken(id, req.headers.get("authorization"))) return fail(401, "unauthorized", "Invalid token");
  await getStore().deletePrefix(`tmp/${id}/`);
  await getJobs().delete(id);
  return new Response(null, { status: 204 });
}
