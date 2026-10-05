#!/usr/bin/env bash
# Build and deploy the processing worker to Cloud Run.
#  * no unauthenticated access (only the Cloud Tasks invoker SA may call it)
#  * all egress through a VPC without NAT → no general internet; Google APIs (signed GCS URLs)
#    remain reachable through Private Google Access
#  * per-request concurrency 1 so one hostile file can't affect another job
set -euo pipefail
: "${PROJECT:?}" "${REGION:=europe-west1}" "${APP_SECRET:?}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/pdfella/worker:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

gcloud artifacts repositories create pdfella --repository-format=docker --location="$REGION" || true
gcloud builds submit services/worker --tag "$IMAGE"

gcloud compute networks create pdfella-worker-net --subnet-mode=custom || true
gcloud compute networks subnets create pdfella-worker-subnet --network=pdfella-worker-net --region="$REGION" \
  --range=10.8.0.0/26 --enable-private-ip-google-access || true

gcloud run deploy pdfella-worker --image "$IMAGE" --region "$REGION" \
  --service-account "pdfella-worker@$PROJECT.iam.gserviceaccount.com" \
  --no-allow-unauthenticated --ingress internal-and-cloud-load-balancing \
  --network pdfella-worker-net --subnet pdfella-worker-subnet --vpc-egress all-traffic \
  --cpu 2 --memory 4Gi --concurrency 1 --timeout 900 --max-instances 20 \
  --set-env-vars "APP_SECRET=$APP_SECRET,MAX_INPUT_BYTES=1073741824,OP_TIMEOUT_SECONDS=300"

gcloud run services add-iam-policy-binding pdfella-worker --region "$REGION" \
  --member "serviceAccount:pdfella-invoker@$PROJECT.iam.gserviceaccount.com" --role roles/run.invoker
gcloud run services describe pdfella-worker --region "$REGION" --format='value(status.url)'
