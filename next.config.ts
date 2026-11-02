import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { existsSync, readFileSync } from "node:fs";

const webRuntimePath = `${process.cwd()}/artifacts/authoring-verification/web-runtime.json`;

const nextConfig: NextConfig = {
  // Container packaging only. Vercel builds keep their existing output mode.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  skipProxyUrlNormalize: true,
  env: { NEXT_PUBLIC_V4_WEB_RUNTIME: existsSync(webRuntimePath) ? readFileSync(webRuntimePath, "utf8") : "" },
  serverExternalPackages: ["pyodide", "puppeteer", "@napi-rs/canvas", "pdfjs-dist", "pdf-parse", "pg", "drizzle-orm"],
  outputFileTracingIncludes: {
    "/coding/runtime-frame": ["./lib/coding/frame.html"],
    "/api/coding/**": ["./public/coding/worker.js", "./node_modules/pyodide/**"],
    "/api/**": [
      "./node_modules/pyodide/{pyodide.js,pyodide.mjs,pyodide.asm.mjs,pyodide.asm.wasm,python_stdlib.zip,pyodide-lock.json,package.json}",
      "./node_modules/@codemirror/*/package.json",
      "./node_modules/katex/dist/**",
      "./node_modules/katex/package.json",
      "./node_modules/pdfjs-dist/{package.json,standard_fonts/**}", "./node_modules/@napi-rs/canvas*/**",
      "./lib/{authoring,materials,math,bundle,compute,articles,zyra,ide,sumber}/**/*.ts",
      "./lib/question-authoring-contract.ts", "./lib/authoring/playbooks/**/*",
      "./next.config.ts", "./scripts/authoring/prepare-web-verification.ts",
      "./deno.json", "./workers/deno-background/deno.json",
      "./components/coding/**/*", "./lib/coding/**/*", "./public/coding/worker.js",
      "./components/course/**/*.tsx", "./components/ui/{slider,scientific-input}.tsx",
      "./app/globals.css", "./app/layout.tsx", "./app/authoring-verification/page.tsx",
      "./components/providers/{telemetry-boundary,posthog-provider}.tsx", "./lib/env.ts",
      "./app/api/courses/**/source-figures/**/route.ts", "./jobs/product-verification.ts", "./scripts/authoring/{verification-renderer,build-local-verification-renderer}.ts",
      "./node_modules/{react,react-dom,next,jsxgraph,zod,mathjs,tailwindcss,playwright-core}/package.json",
      "./node_modules/playwright-core/browsers.json", "./node_modules/@tailwindcss/postcss/package.json", "./node_modules/@playwright/test/package.json",
      "./node_modules/jsxgraph/distrib/**",
    ],
    "/api/mcp/authoring": ["./lib/authoring/playbooks/**/*", "./dist/skills/**/*"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  allowedDevOrigins: ["http://localhost:3000", "http://127.0.0.1:3000", "127.0.0.1"],
  async headers() {
    return [{ source: "/coding/worker.js", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cross-Origin-Resource-Policy", value: "cross-origin" }] }];
  },
  async redirects() {
    // Legacy Tutorial PKA microsite URLs; the campaign now lives at
    // /courses/tutorial-pka inside the regular student course shell.
    // Order matters: the most specific patterns must come first.
    return [
      {
        source: "/pka",
        destination: "/courses/tutorial-pka",
        permanent: true,
      },
      {
        source: "/pka/report",
        destination: "/courses/tutorial-pka/laporan",
        permanent: true,
      },
      {
        source: "/pka/:subject/stage/:stage",
        destination: "/courses/tutorial-pka/simulasi/:subject/:stage",
        permanent: true,
      },
      {
        source: "/pka/:subject",
        destination: "/courses/tutorial-pka/simulasi",
        permanent: true,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";
const enableSentryInDev = process.env.ENABLE_SENTRY_DEV === "true";
const shouldEnableSentry = (isProduction || enableSentryInDev) && Boolean(process.env.SENTRY_AUTH_TOKEN);

export default async function config(): Promise<NextConfig> {
  let configWithMonitoring = nextConfig;
  if (shouldEnableSentry) {
    const { withSentryConfig } = await import("@sentry/nextjs");
    configWithMonitoring = withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG || "zyx-academy",
      project: process.env.SENTRY_PROJECT || "zyx-academy",
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // Only print logs for uploading source maps in CI
      silent: !process.env.CI,

      // Upload a larger set of source maps for prettier stack traces (increases build time)
      widenClientFileUpload: true,

      // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      tunnelRoute: "/monitoring",

      // Tree shake Sentry logger statements to reduce bundle size
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
      },
    }) as NextConfig;
  }
  return withNextIntl(configWithMonitoring);
}
