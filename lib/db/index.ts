import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/db/schema";
import { parsePostgresNumber } from "./postgres-result";

const url = process.env.DATABASE_URL ||
  (process.env.ZYX_POSTGRES_BUILD_PLACEHOLDER === "1"
    ? "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder"
    : undefined);

if (!url) throw new Error("DATABASE_URL is required");

try {
  const parsed = new URL(url);
  if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || !parsed.hostname) throw new Error();
} catch {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
}

const { Pool, types } = pg;
types.setTypeParser(20, "text", parsePostgresNumber);
types.setTypeParser(1700, "text", parsePostgresNumber);

export const db = drizzle(new Pool({ connectionString: url }), { schema });
