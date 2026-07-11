import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db"; // Assuming you export your Drizzle db instance from here
import * as schema from "@/db/schema";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";

function requiredEnv(name: string): string {
 const v = process.env[name];
 if (v == null || v === "") {
 throw new Error(`Missing required environment variable: ${name}`);
 }
 return v;
}

export const auth = betterAuth({
 // Explicit baseURL avoids "Base URL could not be determined" at runtime.
 // Do not import `@/lib/env` here ; that runs full env validation on every API route load.
 baseURL: resolveAuthBaseUrl(),
 secret: resolveAuthSecret(),
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
 // Dev-only: password sign-in so local testing works without the Google
 // OAuth secret (see db/seed.ts and /api/dev-login). Never active in
 // production; Google stays the only production sign-in method.
 emailAndPassword: {
 enabled: process.env.NODE_ENV !== "production",
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
 }
 }
 }
});