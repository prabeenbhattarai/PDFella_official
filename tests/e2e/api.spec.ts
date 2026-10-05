import { test, expect } from "@playwright/test";

test("job API rejects bad input and unauthenticated access", async ({ request }) => {
  const health = await (await request.get("/api/health")).json();
  test.skip(!health.processing, "processing backend not configured");
  expect((await request.post("/api/jobs", { data: { op: "nope", files: [] } })).status()).toBe(400);
  expect((await request.post("/api/jobs", { data: { op: "ocr", files: [{ name: "a.pdf", size: 10 ** 12, type: "application/pdf" }] } })).status()).toBe(413);
  const created = await (await request.post("/api/jobs", { data: { op: "repair", files: [{ name: "a.pdf", size: 100, type: "application/pdf" }] } })).json();
  expect((await request.get(`/api/jobs/${created.jobId}`)).status()).toBe(401);
  expect((await request.get(`/api/jobs/${created.jobId}`, { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  // Starting before uploading fails cleanly.
  expect((await request.post(`/api/jobs/${created.jobId}/start`, { headers: { Authorization: `Bearer ${created.token}` }, data: {} })).status()).toBe(400);
  // A non-PDF uploaded as PDF is rejected by content sniffing.
  const c2 = await (await request.post("/api/jobs", { data: { op: "repair", files: [{ name: "x.pdf", size: 8, type: "application/pdf" }] } })).json();
  await request.put(c2.uploads[0].url, { data: Buffer.from("MZ\x90\x00abcd"), headers: { "Content-Type": "application/pdf" } });
  expect((await request.post(`/api/jobs/${c2.jobId}/start`, { headers: { Authorization: `Bearer ${c2.token}` }, data: {} })).status()).toBe(415);
});

test("cleanup endpoint requires the cron secret", async ({ request }) => {
  expect((await request.post("/api/cleanup")).status()).toBe(401);
});
