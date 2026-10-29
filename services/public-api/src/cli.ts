/**
 * Manage API keys.
 *   npm run api:keys -- create "Acme Inc" [--rate 120]
 *   npm run api:keys -- list
 *   npm run api:keys -- revoke <id>
 *   npm run api:keys -- usage <id>
 * Uses the same backend as the service (API_KEYS_BACKEND=firestore for production).
 */
import { keyStore, newKey } from "./keys";

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const store = keyStore();
  switch (cmd) {
    case "create": {
      const name = args.find((a) => !a.startsWith("--"));
      if (!name) throw new Error('Usage: create "Customer name" [--rate 120]');
      const rateArg = args.indexOf("--rate");
      const rate = rateArg >= 0 ? Number(args[rateArg + 1]) : undefined;
      const { key, record } = newKey(name, rate);
      await store.create(record);
      console.log(`Created key ${record.id} for ${name}.\n\n  ${key}\n\nThis is the only time the full key is shown. Send it to the customer securely.`);
      break;
    }
    case "list":
      console.table((await store.list()).map((k) => ({ id: k.id, name: k.name, prefix: `${k.prefix}…`, created: k.createdAt.slice(0, 10), rate: k.ratePerMinute ?? "default", status: k.revokedAt ? `revoked ${k.revokedAt.slice(0, 10)}` : "active" })));
      break;
    case "revoke":
      if (!args[0]) throw new Error("Usage: revoke <id>");
      console.log((await store.revoke(args[0])) ? `Revoked ${args[0]}.` : `No active key with id ${args[0]}.`);
      break;
    case "usage":
      if (!args[0]) throw new Error("Usage: usage <id>");
      console.table((await store.usage(args[0], 30)).map((u) => ({ date: u.date, requests: u.requests, errors: u.errors, MB: (u.bytesIn / 1048576).toFixed(1), endpoints: Object.entries(u.endpoints).map(([e, n]) => `${e}:${n}`).join(" ") })));
      break;
    default:
      console.log('Commands: create "Name" [--rate N] · list · revoke <id> · usage <id>');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
