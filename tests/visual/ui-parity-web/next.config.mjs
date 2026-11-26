import { fileURLToPath } from "node:url";

export default {
  devIndicators: false,
  turbopack: {
    root: fileURLToPath(new URL("../../..", import.meta.url)),
  },
};
