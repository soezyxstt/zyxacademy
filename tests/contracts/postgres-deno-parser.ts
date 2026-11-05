import { sql } from "drizzle-orm";
import { user } from "@/db/schema";

// This module is executed by Deno; declare only the API used by this probe.
declare const Deno: { env: { set(name: string, value: string): void } };

Deno.env.set("DATABASE_URL", "postgresql://user:password@127.0.0.1:5432/test");
const { db } = await import("@/lib/db");
const query = db.select({ count: sql<number>`count(*)` }).from(user).prepare("parser_test");
for (const name of ["queryConfig", "rawQueryConfig"]) {
  const parser = Reflect.get(query, name).types.getTypeParser;
  if (parser(20, "text")("2") !== 2 || parser(1700, "text")("1.5") !== 1.5) {
    throw new Error(`Incorrect PostgreSQL numeric parser in ${name}`);
  }
}
await db.$client.end();
console.log("Deno Drizzle numeric parsers passed");
