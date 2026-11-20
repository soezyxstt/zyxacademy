import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import * as schema from "@/db/schema";
import * as extras from "@/db/schedule-extras";
import { parsePostgresNumber } from "@/lib/db/postgres-result";

export async function createDiscussionTestDb() {
 const client = await PGlite.create({ parsers: { 20: parsePostgresNumber, 1700: parsePostgresNumber } });
 const directory = new URL("../../drizzle-postgres/", import.meta.url);
 for (const file of readdirSync(directory).filter(file => file.endsWith(".sql")).sort()) await client.exec(readFileSync(new URL(file, directory), "utf8"));
 return { client, testDb: drizzle(client, { schema: { ...schema, ...extras } }) };
}
