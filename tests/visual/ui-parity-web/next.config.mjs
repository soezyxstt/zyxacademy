import { fileURLToPath } from "node:url";

export default {
  devIndicators: false,
  ...(process.env.PARITY_WEBVIEW_EXPORT === "1" ? { output: "export" } : {}),
  turbopack: {
    root: fileURLToPath(new URL("../../..", import.meta.url)),
  },
};
