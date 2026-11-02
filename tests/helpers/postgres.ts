import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import * as schema from "../../db/schema";
import * as extras from "../../db/schedule-extras";
import { parsePostgresNumber } from "../../lib/db/postgres-result";

let template: Promise<Blob> | undefined;

async function templateData() {
  const client = await PGlite.create();
  try {
    const directory = new URL("../../drizzle-postgres/", import.meta.url);
    for (const file of readdirSync(directory).filter(file => file.endsWith(".sql")).sort()) {
      await client.exec(readFileSync(new URL(file, directory), "utf8"));
    }
    return await client.dumpDataDir("none");
  } finally { await client.close(); }
}

/** Each fixture gets real PostgreSQL constraints without application credentials. */
export async function preparePostgresTestDb() {
  template ??= templateData();
  await template;
}

export async function createPostgresTestDb() {
  await preparePostgresTestDb();
  const client = await PGlite.create({ loadDataDir: await template, parsers: { 20: parsePostgresNumber, 1700: parsePostgresNumber } });
  return { client, testDb: drizzle(client, { schema: { ...schema, ...extras } }) };
}
