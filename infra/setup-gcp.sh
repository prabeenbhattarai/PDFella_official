#!/usr/bin/env bash
# One-time GCP/Firebase setup for the processing backend. Review before running.
# Usage: PROJECT=my-project REGION=europe-west1 DOMAIN=example.com ./infra/setup-gcp.sh
set -euo pipefail
: "${PROJECT:?}" "${REGION:=europe-west1}" "${DOMAIN:?}"
BUCKET="${PROJECT}-pdfella-tmp"

gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com cloudtasks.googleapis.com firestore.googleapis.com storage.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com vpcaccess.googleapis.com compute.googleapis.com

# ── Private, auto-expiring storage
gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=infra/gcs-lifecycle.json
sed "s#https://YOUR_DOMAIN#https://$DOMAIN#" infra/gcs-cors.json > /tmp/cors.json
gcloud storage buckets update "gs://$BUCKET" --cors-file=/tmp/cors.json

# ── Firestore (Native mode) with TTL on job and usage records
gcloud firestore databases create --location="$REGION" --type=firestore-native || true
gcloud firestore fields ttls update expiresAtTs --collection-group=jobs --enable-ttl
gcloud firestore fields ttls update expiresAtTs --collection-group=usage --enable-ttl

# ── Service accounts
gcloud iam service-accounts create pdfella-api --display-name="PDFella API" || true
gcloud iam service-accounts create pdfella-worker --display-name="PDFella worker (no storage access)" || true
gcloud iam service-accounts create pdfella-invoker --display-name="Cloud Tasks → worker invoker" || true
API_SA="pdfella-api@$PROJECT.iam.gserviceaccount.com"
INVOKER_SA="pdfella-invoker@$PROJECT.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$API_SA" --role=roles/storage.objectAdmin
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$API_SA" --role=roles/datastore.user
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$API_SA" --role=roles/cloudtasks.enqueuer
gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" --member="serviceAccount:$API_SA" --role=roles/iam.serviceAccountUser
# The API signs V4 URLs with its own identity (no key files).
gcloud iam service-accounts add-iam-policy-binding "$API_SA" --member="serviceAccount:$API_SA" --role=roles/iam.serviceAccountTokenCreator

# ── Queue with retry + concurrency limits
gcloud tasks queues create pdf-jobs --location="$REGION" --max-concurrent-dispatches=20 --max-dispatches-per-second=10 \
  --max-attempts=3 --min-backoff=10s || true

echo "Bucket: $BUCKET  — now deploy the worker with infra/deploy-worker.sh"
