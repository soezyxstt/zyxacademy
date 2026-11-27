import { fileURLToPath } from "node:url";

const fixture = (name) => fileURLToPath(new URL(`../mocks/evaluation-${name}.ts`, import.meta.url));
const doubles = {
  "@/lib/auth/admin-guards-server": fixture("guards"),
  "@/lib/admin/course-identity": fixture("identity"),
};

export default {
  agentRules: false,
  devIndicators: false,
  turbopack: { root: fileURLToPath(new URL("../../../../..", import.meta.url)) },
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^@\/lib\/(?:auth\/admin-guards-server|admin\/course-identity)$/,
      (resource) => { resource.request = doubles[resource.request]; },
    ));
    return config;
  },
};
