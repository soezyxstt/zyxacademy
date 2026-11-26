import { fileURLToPath } from "node:url";
const mock = (name) => fileURLToPath(new URL(`./mocks/${name}.ts`, import.meta.url));
const blogShell = process.env.BLOG_SHELL_FIXTURE === "1";
const replacements = {
  "@/lib/blog/marketing-repository": mock("blog"),
  "@/lib/auth": mock("auth"),
  "@/lib/auth/request-cache": mock("auth"),
  "@/lib/i18n/server": mock("i18n"),
  "@/lib/storage": mock("storage"),
  "@/app/actions/tutor": mock("tutor"),
  "@/components/command-menu": mock("command-menu"),
  ...(blogShell ? {
    "@/lib/auth-client": mock("blog-guest"),
    "@/lib/i18n/actions": fileURLToPath(new URL("./public-pages/mocks/locale-actions.ts", import.meta.url)),
  } : {}),
};
export default {
  ...(blogShell ? { distDir: ".next-blog-shell", images: { unoptimized: true } } : {}),
  devIndicators: false,
  agentRules: false,
  turbopack: { root: fileURLToPath(new URL("../../../..", import.meta.url)) },
  async rewrites() {
    return [
      { source: "/id/blog/:path*", destination: "/blog/:path*" },
      ...(blogShell ? [{ source: "/en/blog/:path*", destination: "/blog/:path*" }] : []),
    ];
  },
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^(?:@\/lib\/(?:blog\/marketing-repository|auth|auth-client|auth\/request-cache|i18n\/(?:server|actions)|storage)|@\/app\/actions\/tutor|@\/components\/command-menu)$/, (resource) => {
      if (replacements[resource.request]) resource.request = replacements[resource.request];
    }));
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^\.\/actions$/, (resource) => {
      if (resource.context.endsWith("/admin/ops/models")) resource.request = mock("model-actions");
    }));
    return config;
  },
};
