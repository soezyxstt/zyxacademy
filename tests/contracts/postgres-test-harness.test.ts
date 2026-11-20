import { expect, test } from "bun:test";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "../../db/schema";
import * as extras from "../../db/schedule-extras";

const { user } = schema;

test("local PostgreSQL fixtures enforce native defaults and constraints and stay isolated", async()=>{
  const first=await createPostgresTestDb();
  try {
    const tables=await first.testDb.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    const expectedTables = [...new Set(Object.values({ ...schema, ...extras }).filter(value => is(value, PgTable)).map(table => getTableName(table)))].sort();
    expect(tables.rows.map(row => row.table_name)).toEqual(expectedTables);
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
