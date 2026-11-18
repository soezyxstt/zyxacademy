import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "../../db/schema";
import * as extras from "../../db/schedule-extras";
import { parsePostgresNumber } from "../../lib/db/postgres-result";

let template: Promise<Blob> | undefined;

function migrationFiles() {
  const directory = new URL("../../drizzle-postgres/", import.meta.url);
  return {
    directory,
    files: readdirSync(directory).filter(file => file.endsWith(".sql")).sort(),
  };
}

function templateCachePath() {
  const { directory, files } = migrationFiles();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(new URL(file, directory)));
    hash.update("\0");
  }
  return resolve(process.cwd(), ".cache", "pglite", `template-${hash.digest("hex").slice(0, 16)}.tar`);
}

function readDiskTemplate(cachePath: string): Blob | undefined {
  try {
    if (!existsSync(cachePath)) return undefined;
    return new Blob([readFileSync(cachePath)]);
  } catch {
    return undefined;
  }
}

async function writeDiskTemplate(cachePath: string, blob: Blob) {
  try {
    mkdirSync(resolve(cachePath, ".."), { recursive: true });
    const temp = `${cachePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    writeFileSync(temp, Buffer.from(await blob.arrayBuffer()));
    renameSync(temp, cachePath);
  } catch {
    // Non-writable cache directories and concurrent writers fall back safely.
  }
}

async function migrateFixture(client: PGlite) {
  const { directory, files } = migrationFiles();
  for (const file of files) {
    await client.exec(readFileSync(new URL(file, directory), "utf8"));
  }
}

async function templateData() {
  const cachePath = templateCachePath();
  const cached = readDiskTemplate(cachePath);
  if (cached) return cached;
  const client = await PGlite.create();
  try {
    await migrateFixture(client);
    const blob = await client.dumpDataDir("none");
    await writeDiskTemplate(cachePath, blob);
    return blob;
  } finally { await client.close(); }
}

/** Each fixture gets real PostgreSQL constraints without application credentials. */
export async function preparePostgresTestDb() {
  template ??= templateData();
  await template;
}

export async function createPostgresTestDb() {
  if (!template) {
    const cachePath = templateCachePath();
    const cached = readDiskTemplate(cachePath);
    if (cached) {
      template = Promise.resolve(cached);
    } else {
      // The first fixture owns the migrated instance. Avoid creating a second WASM
      // database just to reload the template we have already initialized.
      const first = PGlite.create({ parsers: { 20: parsePostgresNumber, 1700: parsePostgresNumber } });
      template = first.then(async client => {
        await migrateFixture(client);
        const blob = await client.dumpDataDir("none");
        await writeDiskTemplate(cachePath, blob);
        return blob;
      });
      try {
        await template;
        const client = await first;
        return { client, testDb: drizzle(client, { schema: { ...schema, ...extras } }) };
      } catch (error) {
        await first.then(client => client.close()).catch(() => undefined);
        template = undefined;
        throw error;
      }
    }
  }
  await preparePostgresTestDb();
  const client = await PGlite.create({ loadDataDir: await template, parsers: { 20: parsePostgresNumber, 1700: parsePostgresNumber } });
  return { client, testDb: drizzle(client, { schema: { ...schema, ...extras } }) };
}
