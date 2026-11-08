import "server-only";
import { googleAccessToken } from "./admin";
import { PROJECT_ID } from "./firebase-auth";

/**
 * Desktop downloads through /download/<os>, counted in Firestore at
 * stats/desktopDownloads: { mac, windows, byVersion: { v0_1_4: { mac, windows } } }.
 * Increments are atomic, so downloads at the same moment are all counted.
 */
const DOC = "stats/desktopDownloads";
const root = () => `projects/${PROJECT_ID}/databases/(default)/documents`;
const versionKey = (v: string) => `v${v.replace(/[^0-9]+/g, "_")}`;

export async function countDownload(os: "mac" | "windows", version: string) {
  const one = { integerValue: "1" };
  const res = await fetch(`https://firestore.googleapis.com/v1/${root()}:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await googleAccessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [{ transform: { document: `${root()}/${DOC}`, fieldTransforms: [
      { fieldPath: os, increment: one },
      { fieldPath: `byVersion.${versionKey(version)}.${os}`, increment: one },
    ] } }] }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Firestore write failed (${res.status})`);
}

type Num = { integerValue?: string };
type Fields = { mac?: Num; windows?: Num; byVersion?: { mapValue?: { fields?: Record<string, { mapValue?: { fields?: { mac?: Num; windows?: Num } } }> } } };
const n = (v?: Num) => Number(v?.integerValue ?? 0);

export interface CdnDownloads { mac: number; windows: number; byVersion: Record<string, { mac: number; windows: number }> }

/** Counts so far. Versions come back as "0.1.4". */
export async function cdnDownloads(): Promise<CdnDownloads> {
  const res = await fetch(`https://firestore.googleapis.com/v1/${root()}/${DOC}`, { headers: { Authorization: `Bearer ${await googleAccessToken()}` }, cache: "no-store" });
  if (res.status === 404) return { mac: 0, windows: 0, byVersion: {} };
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);
  const f = ((await res.json()) as { fields?: Fields }).fields ?? {};
  const byVersion: CdnDownloads["byVersion"] = {};
  for (const [k, v] of Object.entries(f.byVersion?.mapValue?.fields ?? {})) {
    byVersion[k.replace(/^v/, "").replace(/_/g, ".")] = { mac: n(v.mapValue?.fields?.mac), windows: n(v.mapValue?.fields?.windows) };
  }
  return { mac: n(f.mac), windows: n(f.windows), byVersion };
}
