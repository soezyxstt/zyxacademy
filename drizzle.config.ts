import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables for the Drizzle CLI
dotenv.config({ path: ".env" });

export default defineConfig({
  schema: ["./db/schema.ts", "./db/schedule-extras.ts"],
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});