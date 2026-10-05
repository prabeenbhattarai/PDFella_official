# Deployment

## Topology
```
Browser ──► Vercel (Next.js: pages, editor, /api)
              │  signed URLs                    ▲ callback (HMAC)
              ▼                                 │
         GCS bucket (private, 1-day lifecycle)  │
              ▲  signed GET/PUT                 │
              │                                 │
         Cloud Tasks ──OIDC──► Cloud Run worker ┘   (no internet egress)
              ▲
          /api/jobs/:id/start
Firestore: jobs, usage (TTL)        Vercel Cron → /api/cleanup every 10 min
```
Heavy processing never runs in Vercel functions.

## 1. Browser-only deployment
Deploy to Vercel with `NEXT_PUBLIC_SITE_URL` set. Leave `WORKER_URL` empty: every browser tool works and cloud tools explain they're unavailable.

`vercel.json` schedules `/api/cleanup` once a day, the most Vercel Hobby allows. That is enough while no files are stored on the server.

## 2. Processing backend (GCP)
```bash
PROJECT=my-project REGION=europe-west1 DOMAIN=example.com ./infra/setup-gcp.sh
PROJECT=my-project REGION=europe-west1 APP_SECRET=… ./infra/deploy-worker.sh   # prints the worker URL
```
Then set on Vercel:
```
APP_URL=https://example.com
APP_SECRET=…                     # same as the worker
CRON_SECRET=…
WORKER_URL=https://pdfella-worker-….run.app
STORAGE_BACKEND=gcs   STORAGE_BUCKET=my-project-pdfella-tmp
JOBS_BACKEND=firestore
QUEUE_BACKEND=cloudtasks  CLOUD_TASKS_LOCATION=europe-west1  CLOUD_TASKS_QUEUE=pdf-jobs
WORKER_INVOKER_SA=pdfella-invoker@my-project.iam.gserviceaccount.com
GCP_PROJECT=my-project
```
**Cleanup every 10 minutes is required once the worker is on**, so that uploaded files really are deleted within `JOB_TTL_MINUTES` as the site states. On Vercel Hobby use Cloud Scheduler (free for up to 3 jobs):
```bash
gcloud scheduler jobs create http pdfella-cleanup --location=europe-west1 --schedule="*/10 * * * *" \
  --uri="https://example.com/api/cleanup" --http-method=POST --headers="Authorization=Bearer $CRON_SECRET"
```
On Vercel Pro you can instead set the `vercel.json` schedule back to `*/10 * * * *`.

Give Vercel Google credentials through Workload Identity Federation (OIDC) for the `pdfella-api` service account — no key files. Signed URLs are created with the service account's own identity (`iam.serviceAccountTokenCreator` on itself).

Optionally deploy the Next.js app to Cloud Run instead of Vercel; nothing in the code depends on Vercel except `vercel.json`'s cron (replace with Cloud Scheduler calling `/api/cleanup`).

## 3. Checklist
- [ ] `APP_SECRET` is long and random, identical on API and worker
- [ ] Bucket has lifecycle + CORS for your domain, public access prevention on
- [ ] Firestore TTL enabled on `jobs.expiresAtTs` and `usage.expiresAtTs`
- [ ] Worker: `--no-allow-unauthenticated`, VPC egress all-traffic, concurrency 1
- [ ] Cleanup hitting `/api/cleanup` every 10 minutes with `CRON_SECRET` (Cloud Scheduler on Hobby)
- [ ] Commercial licences for AGPL components (PyMuPDF, Ghostscript) if required
- [ ] Review placeholder Terms with counsel; set `supportEmail` in `src/lib/brand.ts`
