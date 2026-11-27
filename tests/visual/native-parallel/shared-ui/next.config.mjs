import { fileURLToPath } from "node:url";

const config = {
  devIndicators: false,
  reactStrictMode: false,
  agentRules: false,
  turbopack: { root: fileURLToPath(new URL("../../../..", import.meta.url)) },
};

export default config;
