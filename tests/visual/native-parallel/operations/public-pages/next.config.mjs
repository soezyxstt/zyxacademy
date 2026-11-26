import { fileURLToPath } from "node:url";

const mock = (name) => fileURLToPath(new URL(`./mocks/${name}.ts`, import.meta.url));
const demo = (name) => fileURLToPath(new URL(`../../../demo-harness/${name}.ts`, import.meta.url));
const replacements = {
  "@/lib/i18n/server": mock("i18n"),
  "@/lib/i18n/actions": mock("locale-actions"),
  "@/lib/env": mock("env"),
  "@/lib/native/published-release": mock("release"),
  "@/lib/email-preferences/token": mock("email-token"),
  "@/lib/demo/summary-repository": mock("demo-summaries"),
  "@/lib/demo/mastery-repository": demo("mastery-repository"),
  "@/app/(marketing)/demo/demo-data": demo("demo-data"),
};

export default {
  devIndicators: false,
  agentRules: false,
  images: { unoptimized: true },
  turbopack: { root: fileURLToPath(new URL("../../../../..", import.meta.url)) },
  async rewrites() {
    return [
      { source: "/:locale(id|en)", destination: "/" },
      { source: "/:locale(id|en)/:path*", destination: "/:path*" },
      { source: "/:group(founders|testimoni|platforms)/:asset", destination: "/fixture-assets/:group/:asset" },
    ];
  },
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/.*/, (resource) => {
      const replacement = replacements[resource.request];
      if (replacement) resource.request = replacement;
      if (resource.context.includes("/app/(marketing)/demo") && /^(\.\/|\.\.\/)demo-data$/.test(resource.request)) {
        resource.request = demo("demo-data");
      }
      if (resource.context.endsWith("/app/(marketing)/unsubscribe") && resource.request === "./actions") {
        resource.request = mock("email-actions");
      }
    }));
    return config;
  },
};
