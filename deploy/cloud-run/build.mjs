import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const publicNames = new Set([
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BRAND_EMAIL",
  "NEXT_PUBLIC_BRAND_INSTAGRAM",
  "NEXT_PUBLIC_BRAND_TIKTOK",
  "NEXT_PUBLIC_DESMOS_API_KEY",
  "NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_REALTIME_URL",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_STAGING_MEDIA_ORIGIN",
  "NEXT_PUBLIC_WHATSAPP_NUMBER",
  "AUTHORING_VERIFICATION_BROWSER_PROVIDER",
  "AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
]);

const settings = JSON.parse(readFileSync("/run/secrets/public_config", "utf8"));
if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
  throw new Error("Cloud Run public configuration must be a JSON object");
}

const buildEnv = {
  ...process.env,
  DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
  BETTER_AUTH_SECRET: "cloud-run-build-placeholder-never-used-at-runtime",
  GOOGLE_CLIENT_ID: "disabled-build",
  GOOGLE_CLIENT_SECRET: "disabled-build",
  RESEND_API_KEY: "disabled-build",
  GEMINI_API_KEY: "disabled-build",
  INNGEST_EVENT_KEY: "disabled-build",
};
for (const [name, value] of Object.entries(settings)) {
  if (!publicNames.has(name) || typeof value !== "string") {
    throw new Error("Unexpected Cloud Run public configuration entry");
  }
  if (value) buildEnv[name] = value;
}

const origin = URL.parse(buildEnv.NEXT_PUBLIC_APP_URL ?? "");
if (!origin || origin.protocol !== "https:" || origin.origin !== buildEnv.NEXT_PUBLIC_APP_URL ||
    ["zyxacademy.com", "www.zyxacademy.com", "zyx.id", "www.zyx.id", "zyx.academy"].includes(origin.hostname)) {
  throw new Error("NEXT_PUBLIC_APP_URL must be a canonical staging HTTPS origin");
}
if (buildEnv.AUTHORING_VERIFICATION_BROWSER_PROVIDER === "local_playwright") {
  throw new Error("Cloud Run requires a remote authoring browser provider");
}
buildEnv.BETTER_AUTH_URL = origin.origin;

const sentryTokenPath = "/run/secrets/sentry_auth_token";
if (existsSync(sentryTokenPath)) {
  const token = readFileSync(sentryTokenPath, "utf8").trim();
  if (token) buildEnv.SENTRY_AUTH_TOKEN = token;
}

const result = spawnSync("bun", ["run", "build"], { env: buildEnv, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// The exact Next.js launcher serializes a resolved config. Keep standalone
// trustHostHeader at its default (false) so resolve-routes and next-server
// derive the same internal initURL for proxy.ts redirects and locale rewrites,
// while origin-gateway supplies canonical Host and X-Forwarded-* headers.
const launcher = ".next/standalone/server.js";
const source = readFileSync(launcher, "utf8");
const marker = "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)";
if (source.split(marker).length !== 2) {
  throw new Error("Next.js standalone launcher changed. Review the Cloud Run Host boundary.");
}
writeFileSync(launcher, source.replace(marker, [
  "nextConfig.images.maximumDiskCacheSize = 64 * 1024 * 1024",
  marker,
].join("\n")));
