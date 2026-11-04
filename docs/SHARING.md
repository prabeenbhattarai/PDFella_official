# Share links

Share links keep encrypted files for up to 30 days. Files are encrypted in the
sender's browser, and the key stays in the link's `#fragment`, so the server
stores only data it can't read. The tool stays hidden until this is set up.

## Set up (Firebase)

1. **Storage:** Firebase console → Build → Storage → Get started. New projects may
   need the Blaze plan. Set a budget alert. Note the bucket name, such as
   `your-project.firebasestorage.app`.
2. **Firestore:** Build → Firestore Database → Create database. The server's
   Admin SDK ignores security rules, so production mode (deny all) is correct.
3. **CORS on the bucket**, so browsers can upload and download directly. Save this
   as `cors.json`, replacing the origin if needed:

   ```json
   [{
     "origin": ["https://www.pdfella.com", "https://pdfella.com"],
     "method": ["GET", "PUT"],
     "responseHeader": ["Content-Type", "x-goog-content-length-range"],
     "maxAgeSeconds": 3600
   }]
   ```

   Then run `gsutil cors set cors.json gs://YOUR_BUCKET`.
4. **Backstop deletion:** in Google Cloud console → Storage → the bucket →
   Lifecycle, add a rule to delete objects older than 31 days, with the prefix
   `shares/`. The daily `/api/cleanup` job normally deletes them first, and needs
   `CRON_SECRET` set.
5. **Vercel environment variables**, then redeploy:

   ```
   NEXT_PUBLIC_SHARE_ENABLED=1
   SHARE_BACKEND=firebase
   SHARE_BUCKET=your-project.firebasestorage.app
   ```

   `FIREBASE_SERVICE_ACCOUNT` must already be set. Its service account needs
   access to Storage and Firestore (the Firebase Admin SDK account has this).
6. **Try it:** create a link, open it in a private window, report it, then take it
   down from the admin panel.

## Limits

5 MB per file, 1, 7 or 30 days, and 20 active links per account. Rate limits use
`JOBS_BACKEND`: without `firestore` they count per server instance, so they're
only approximate. The active-link cap is always exact.

## Privacy notes

- PostHog never loads on `/s/…`, because the fragment there is the file's key.
- The server can't scan files. Abuse handling relies on *Report this file* and on
  taking links down from the admin panel.
