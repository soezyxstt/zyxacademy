import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import { user } from "../../db/schema";

test("local PostgreSQL fixtures enforce native defaults and constraints and stay isolated", async()=>{
  const first=await createPostgresTestDb();
  try {
    const tables=await first.testDb.execute(sql`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'`);
    // Includes the Admin MCP outbox, AI model settings, and main branch tables.
    expect(tables.rows[0].count).toBe(197);
    await first.testDb.insert(user).values({id:"fixture",name:"Local fixture",email:"fixture@example.invalid"});
    const [row]=await first.testDb.select().from(user);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.emailVerified).toBe(false);
    await expect(first.testDb.insert(user).values({id:"duplicate",name:"Duplicate",email:"fixture@example.invalid"}).execute()).rejects.toThrow();
  } finally {await first.client.close();}
  const second=await createPostgresTestDb();
  try {expect(await second.testDb.select().from(user)).toHaveLength(0);}
  finally {await second.client.close();}
},60000);
