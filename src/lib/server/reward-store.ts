import "server-only";
import { googleAccessToken } from "./admin";
import { PROJECT_ID } from "./firebase-auth";

/**
 * Firestore, used over its REST API like the rest of the admin code. Only the server
 * can reach this data, because the service account bypasses the database's rules.
 */
const base = () => `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = async () => ({ Authorization: `Bearer ${await googleAccessToken()}`, "Content-Type": "application/json" });
const stringFields = (fields: Record<string, string>) => ({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])) });

export async function ipHasClaimed(ipHash: string): Promise<boolean> {
  const res = await fetch(`${base()}/rewardIps/${ipHash}`, { headers: await headers(), cache: "no-store" });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);
  return true;
}

/** Claim an IP. Creating the record fails if it exists, so two claims at once can't both win. */
export async function claimIp(ipHash: string): Promise<boolean> {
  const res = await fetch(`${base()}/rewardIps?documentId=${ipHash}`, { method: "POST", headers: await headers(), body: JSON.stringify(stringFields({ at: new Date().toISOString() })), cache: "no-store" });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`Firestore write failed (${res.status})`);
  return true;
}

export async function releaseIp(ipHash: string) {
  await fetch(`${base()}/rewardIps/${ipHash}`, { method: "DELETE", headers: await headers(), cache: "no-store" });
}

/** The answer is kept apart from the account, so it's only ever counted. */
export async function recordSource(source: string) {
  const res = await fetch(`${base()}/rewardSources`, { method: "POST", headers: await headers(), body: JSON.stringify(stringFields({ source, at: new Date().toISOString() })), cache: "no-store" });
  if (!res.ok) throw new Error(`Firestore write failed (${res.status})`);
}

/** How many people gave each answer. */
export async function sourceCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let pageToken = "";
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${base()}/rewardSources?pageSize=300&mask.fieldPaths=source${pageToken ? `&pageToken=${pageToken}` : ""}`, { headers: await headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);
    const body = await res.json() as { documents?: { fields?: { source?: { stringValue?: string } } }[]; nextPageToken?: string };
    for (const d of body.documents ?? []) {
      const s = d.fields?.source?.stringValue;
      if (s) counts[s] = (counts[s] ?? 0) + 1;
    }
    if (!body.nextPageToken) break;
    pageToken = encodeURIComponent(body.nextPageToken);
  }
  return counts;
}
