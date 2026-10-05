import { getJobs } from "@/lib/server/jobs";
import { getStore } from "@/lib/server/storage";
import { config } from "@/lib/server/config";
import { json, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Deletes expired jobs and their files. Must run every 10 minutes when the
 * processing worker is enabled (Cloud Scheduler, or Vercel Cron on Pro), with
 * `Authorization: Bearer $CRON_SECRET`. vercel.json only schedules a daily run
 * because Vercel Hobby allows nothing more frequent.
 * (A storage lifecycle rule deletes anything older than 1 day as a backstop.)
 */
async function sweep(req: Request) {
  if (!config.cronSecret || req.headers.get("authorization") !== `Bearer ${config.cronSecret}`) return fail(401, "unauthorized", "Invalid cron secret");
  const jobs = getJobs();
  const expired = await jobs.listExpired(Date.now(), 500);
  let deleted = 0;
  for (const j of expired) {
    try {
      await getStore().deletePrefix(`tmp/${j.id}/`);
      await jobs.delete(j.id);
      deleted++;
    } catch (e) {
      console.error("[cleanup] failed for job", j.id, (e as Error).message);
    }
  }
  return json({ deleted });
}

export const POST = sweep;
export const GET = sweep;
