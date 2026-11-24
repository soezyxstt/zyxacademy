import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oneTimeToken } from "better-auth/plugins/one-time-token";
import { multiSession } from "better-auth/plugins/multi-session";
import { eq } from "drizzle-orm";
import { db } from "@/db"; // Assuming you export your Drizzle db instance from here
import * as schema from "@/db/schema";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { provisionPenggunaForNewUser } from "@/lib/auth/authorization";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/shared";
import { inheritUserLocalePreference } from "@/lib/i18n/preferences";
import { normalizeLocale } from "@/lib/i18n/locale";
import { accountSwitchPlugin } from "@/lib/auth/account-switch-plugin";
import { MAX_SAVED_ACCOUNTS } from "@/lib/auth/account-switch-contract";
import { nativeGoogleSignInGuard } from "@/lib/native/google-auth-plugin";

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
 plugins: [
   multiSession({ maximumSessions: MAX_SAVED_ACCOUNTS }),
   nativeGoogleSignInGuard(),
   accountSwitchPlugin({
     isAccountAvailable: async (userId) => {
       const [identity] = await db.select({ status: schema.pengguna.status })
         .from(schema.pengguna).where(eq(schema.pengguna.id, userId)).limit(1);
       // Legacy identities still use the existing provisioning flow.
       return identity?.status !== "suspended";
     },
   }),
   oneTimeToken({
     expiresIn: 2,
     storeToken: "hashed",
     disableClientRequest: true,
   }),
 ],
 database: drizzleAdapter(db, {
 provider: "pg",
 schema: schema,
 }),
 account: {
 // Preserve incremental OAuth scopes (e.g. Google Calendar) and refresh/access tokens
 // across ordinary Google sign-ins. Explicit linkSocialAccount and token refresh still update the row.
 updateAccountOnSignIn: false,
 },
 socialProviders: {
 google: {
 prompt: "select_account",
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
  input: false,
  defaultValue: "student",
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
    after: async (createdUser, context) => {
     await provisionPenggunaForNewUser({
      id: createdUser.id,
      role: createdUser.role,
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt,
     });
     const cookieHeader = context?.request?.headers.get("cookie");
     const localeCookie = cookieHeader?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`))
      ?.slice(LOCALE_COOKIE_NAME.length + 1);
     const locale = normalizeLocale(localeCookie);
     if (locale) await inheritUserLocalePreference(createdUser.id, locale);
    },
   },
  },
 },
});
