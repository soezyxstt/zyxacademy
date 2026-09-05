import * as Sentry from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";
const enableSentryInDev = process.env.ENABLE_SENTRY_DEV === "true";

if (isProduction || enableSentryInDev) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: isProduction ? 0.2 : 0,
    debug: false,
  });
}
