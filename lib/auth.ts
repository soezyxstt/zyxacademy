import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db"; // Assuming you export your Drizzle db instance from here
import * as schema from "@/db/schema";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { provisionPenggunaForNewUser } from "@/lib/auth/authorization";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === "") {
    if (process.env.SKIP_ENV_VALIDATION || process.env.npm_lifecycle_event === "build") {
      return "placeholder-build-value";
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const auth = betterAuth({
 // Explicit baseURL avoids "Base URL could not be determined" at runtime.
 // Do not import `@/lib/env` here ; that runs full env validation on every API route load.
 baseURL: resolveAuthBaseUrl(),
 secret: resolveAuthSecret(),
 trustedOrigins: [
   "http://localhost:3000",
   "http://127.0.0.1:3000",
   "https://staging.zyxacademy.com",
   "https://zyx.academy",
   "https://zyxacademy.com",
   "https://www.zyxacademy.com",
 ],
 database: drizzleAdapter(db, {
 provider: "sqlite", // Using SQLite/libSQL
 schema: schema,
 }),
 socialProviders: {
 google: {
 clientId: requiredEnv("GOOGLE_CLIENT_ID"),
 clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
 },
 },
 // We map the database user fields to better-auth
  user: {
  additionalFields: {
  role: {
  type: "string",
  required: false,
  defaultValue: "student", // Defaults to student as per your schema
  },
  lastActivityAt: {
  type: "date",
  required: false,
  },
  faculty: {
  type: "string",
  required: false,
  input: false,
  },
  major: {
  type: "string",
  required: false,
  input: false,
  },
  entryYear: {
  type: "number",
  required: false,
  input: false,
  },
    }
  },
 databaseHooks: {
  user: {
   create: {
    after: async (createdUser) => {
     await provisionPenggunaForNewUser({
      id: createdUser.id,
      role: createdUser.role,
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt,
     });
    },
   },
  },
 },
});
