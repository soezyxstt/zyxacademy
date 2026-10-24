// Opt-in test transport for managed environments. Load with node --require.
// REST continues to use NODE_USE_ENV_PROXY; only Steel's CDP socket needs this
// adapter because Playwright's WebSocket client ignores that Node setting.
const https = require("node:https");
const path = require("node:path");
const { HttpsProxyAgent } = require(path.join(path.dirname(require.resolve("playwright-core/package.json")), "lib/utilsBundle.js"));

if (process.env.CODING_BROWSER_PROVIDER !== "steel") throw new Error("CODING_STEEL_PROXY_OPT_IN_REQUIRED");
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (!proxy) throw new Error("CODING_STEEL_PROXY_CONFIGURATION_REQUIRED");
const request = https.request;
https.request = function (options, ...args) {
  if (options?.hostname === "connect.steel.dev" || options?.host === "connect.steel.dev") {
    options = { ...options, agent: new HttpsProxyAgent(proxy), rejectUnauthorized: true };
  }
  return request.call(this, options, ...args);
};
