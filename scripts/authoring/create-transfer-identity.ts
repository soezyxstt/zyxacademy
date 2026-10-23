import { exportJWK, generateKeyPair } from "jose";
import { writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { sha256 } from "@/lib/authoring/transfer/contracts";

// Generate local key material only. This command never uploads keys or changes a remote environment.
async function main() {
  const args = process.argv.slice(2);
  const value = (key: string) => { const index = args.indexOf(`--${key}`); return index < 0 ? undefined : args[index + 1]; };
  const id = value("id"), origin = value("origin"), output = value("output");
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || !origin || !output) throw new Error("Usage: bun scripts/authoring/create-transfer-identity.ts --id <environment-id> --origin <https-origin> --output <.env.transfer-identity>");
  if (new URL(origin).protocol !== "https:" || new URL(origin).origin !== origin) throw new Error("An exact HTTPS origin is required");
  const path = resolve(output);
  if (path !== resolve(process.cwd(), basename(output)) || !basename(path).startsWith(".env.") || path.endsWith(".example")) throw new Error("Output must be an ignored .env file in the current workspace");
  const database = process.env.TURSO_DATABASE_URL || process.env.TURSO_CONNECTION_URL || process.env.DATABASE_URL;
  if (!database || !process.env.R2_ENDPOINT || !process.env.R2_BUCKET) throw new Error("Load the exact environment's database and R2 configuration before generating peer metadata");
  const signing = await generateKeyPair("EdDSA", { extractable: true });
  const encryption = await generateKeyPair("ECDH-ES", { crv: "P-256", extractable: true });
  const keyId = `key-${crypto.randomUUID()}`;
  const identity = { id, origin, keyId, signingKey: await exportJWK(signing.privateKey), encryptionKey: await exportJWK(encryption.privateKey) };
  const peer = { id, origin, keyId, signingKey: await exportJWK(signing.publicKey), encryptionKey: await exportJWK(encryption.publicKey),
    allowSource: false, allowDestination: false, databaseFingerprint: sha256(database.replace(/\/$/, "").replace(/^libsql:/, "https:")),
    storageFingerprint: sha256(`${process.env.R2_ENDPOINT.replace(/\/$/, "")}/${process.env.R2_BUCKET}`) };
  await writeFile(path, `AUTHORING_TRANSFER_IDENTITY='${JSON.stringify(identity)}'\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ identityFile: path, publicPeer: peer }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Transfer identity generation failed"); process.exitCode = 1; });
