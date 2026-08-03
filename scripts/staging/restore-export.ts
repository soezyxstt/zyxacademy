import { createDecipheriv, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import {
  assertStagingEnvironment,
  normalizeResource,
  parseEnvFile,
  resourceValue,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import {
  artifactDirectory,
  parseCliArgs,
  requiredCliArg,
  requireManifestKey,
  sha256Text,
  stableStringify,
  writeArtifact,
} from "@/lib/staging/migration-ledger";

type Row = Record<string, unknown>;
type SchemaEntry = { kind: "schema"; type: string; name: string; tableName: string; sql: string };
type DataEntry = { kind: "row"; table: string; data: Row };
type SqlValue = string | number | boolean | null | Uint8Array;

function safeSqlErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "unknown");
    return code.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 40);
  }
  return "unknown";
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function rows(result: { rows: unknown[] }): Row[] {
  return result.rows as Row[];
}

function encryptionKey(secret: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(secret)) return Buffer.from(secret, "hex");
  return createHash("sha256").update(secret, "utf8").digest();
}

function sqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return value;
  return stableStringify(value);
}

function disposableDatabaseUrl(): string | undefined {
  return process.env.STAGING_DISPOSABLE_DATABASE_URL?.trim() || process.env.DISPOSABLE_DATABASE_URL?.trim();
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const target = requiredCliArg(args, "target");
  if (target !== "disposable") throw new Error("Only --target disposable is allowed");

  try {
    const staging = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const targetUrl = disposableDatabaseUrl();
    if (!targetUrl) throw new Error("STAGING_DISPOSABLE_DATABASE_URL is required");
    const productionDatabase = resourceValue(parseEnvFile(join(process.cwd(), ".env.prod")), "database");
    if (normalizeResource(targetUrl) === normalizeResource(staging.databaseUrl)) {
      throw new Error("Disposable target matches staging");
    }
    if (productionDatabase && normalizeResource(targetUrl) === normalizeResource(productionDatabase)) {
      throw new Error("Disposable target matches production");
    }

    const archivePath = join(artifactDirectory(runId), "backup", "staging-export.enc.json");
    const cipherManifestPath = join(artifactDirectory(runId), "backup", "cipher-manifest.json");
    const encryptedArchive = await readFile(archivePath, "utf8");
    const cipherManifest = JSON.parse(await readFile(cipherManifestPath, "utf8")) as { cipherSha256?: string };
    if (!cipherManifest.cipherSha256 || sha256Text(encryptedArchive.trim()) !== cipherManifest.cipherSha256) {
      throw new Error("Encrypted export manifest does not match the archive");
    }
    const archive = JSON.parse(await readFile(archivePath, "utf8")) as {
      version: number;
      algorithm: string;
      iv: string;
      authTag: string;
      ciphertext: string;
    };
    if (archive.version !== 1 || archive.algorithm !== "aes-256-gcm") throw new Error("Unsupported export archive");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(requireManifestKey()),
      Buffer.from(archive.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(archive.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(archive.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const entries = plaintext
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SchemaEntry | DataEntry);
    const schemaEntries = entries.filter((entry): entry is SchemaEntry => entry.kind === "schema");
    const dataEntries = entries.filter((entry): entry is DataEntry => entry.kind === "row");

    const client = createClient({ url: targetUrl, authToken: process.env.STAGING_DISPOSABLE_TURSO_AUTH_TOKEN?.trim() || undefined });
    try {
      const existing = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      );
      if (existing.rows.length > 0) throw new Error("Disposable target is not empty");

      await client.execute("PRAGMA foreign_keys = OFF");
      for (const entry of schemaEntries.filter((item) => item.type === "table")) {
        try {
          await client.execute(entry.sql);
        } catch (error) {
          throw new Error(`RESTORE_SCHEMA_FAILED:${entry.type}:${entry.name}:${safeSqlErrorCode(error)}`);
        }
      }
      const grouped = new Map<string, DataEntry[]>();
      for (const entry of dataEntries) {
        const list = grouped.get(entry.table) ?? [];
        list.push(entry);
        grouped.set(entry.table, list);
      }
      for (const [tableName, tableRows] of grouped) {
        for (const entry of tableRows) {
          const columns = Object.keys(entry.data).sort();
          if (columns.length === 0) {
            await client.execute(`INSERT INTO ${quoteIdentifier(tableName)} DEFAULT VALUES`);
            continue;
          }
          const placeholders = columns.map(() => "?").join(", ");
          try {
            await client.execute({
              sql: `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`,
              args: columns.map((column) => sqlValue(entry.data[column])),
            });
          } catch {
            throw new Error(`RESTORE_ROW_FAILED:${tableName}`);
          }
        }
      }
      for (const entry of schemaEntries.filter((item) => item.type !== "table")) {
        const existingObject = await client.execute({
          sql: "SELECT name FROM sqlite_master WHERE name = ? LIMIT 1",
          args: [entry.name],
        });
        if (existingObject.rows.length > 0) continue;
        try {
          await client.execute(entry.sql);
        } catch (error) {
          const errorText = error instanceof Error ? error.message : String(error);
          if (/already exists/i.test(errorText)) continue;
          throw new Error(`RESTORE_SCHEMA_FAILED:${entry.type}:${entry.name}:${safeSqlErrorCode(error)}`);
        }
      }
      try {
        await client.execute("PRAGMA foreign_keys = ON");
      } catch (error) {
        throw new Error(`RESTORE_FOREIGN_KEYS_FAILED:${safeSqlErrorCode(error)}`);
      }
      const foreignKeys = await client.execute("PRAGMA foreign_key_check");
      if (foreignKeys.rows.length > 0) throw new Error("RESTORE_FOREIGN_KEY_VIOLATIONS");

      const schemaResult = await client.execute(
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      );
      const tableCounts: Record<string, number> = {};
      for (const row of rows(await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))) {
        const name = String(row.name);
        const countResult = await client.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`);
        tableCounts[name] = Number(rows(countResult)[0]?.count ?? 0);
      }
      const restore = {
        status: "passed",
        runId,
        target: "disposable",
        tableCount: Object.keys(tableCounts).length,
        tableCounts,
        schemaHash: sha256Text(stableStringify(rows(schemaResult))),
        foreignKeyViolations: foreignKeys.rows.length,
      };
      await writeArtifact(runId, "restore.json", restore);
      console.log(JSON.stringify({
        status: "ok",
        runId,
        target: "disposable",
        tableCount: restore.tableCount,
        schemaHash: restore.schemaHash,
      }));
    } finally {
      client.close();
    }
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

void main();
