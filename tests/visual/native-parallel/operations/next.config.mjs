import { fileURLToPath } from "node:url";
const mock = (name) => fileURLToPath(new URL(`./mocks/${name}.ts`, import.meta.url));
const replacements = {
  "@/lib/blog/marketing-repository": mock("blog"),
  "@/lib/auth": mock("auth"),
  "@/lib/auth/request-cache": mock("auth"),
  "@/lib/i18n/server": mock("i18n"),
  "@/lib/storage": mock("storage"),
  "@/app/actions/tutor": mock("tutor"),
};
export default {
  devIndicators: false,
  agentRules: false,
  turbopack: { root: fileURLToPath(new URL("../../../..", import.meta.url)) },
  async rewrites() { return [{ source: "/id/blog/:path*", destination: "/blog/:path*" }]; },
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^(?:@\/lib\/(?:blog\/marketing-repository|auth|auth\/request-cache|i18n\/server|storage)|@\/app\/actions\/tutor)$/, (resource) => {
      resource.request = replacements[resource.request];
    }));
    return config;
  },
};
