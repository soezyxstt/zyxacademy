// Accept the existing Google provider URL or its account/gateway root.
export function gatewayEndpoint(base: string | undefined, route: string) {
  const url = new URL(base ?? "");
  const match = /^\/v1\/([\w-]+)\/([\w-]+)(?:\/google-ai-studio)?\/?$/.exec(url.pathname);
  if (url.origin !== "https://gateway.ai.cloudflare.com" || url.username || url.password ||
      url.search || url.hash || !match || !/^(google-ai-studio|deepseek|openai|custom-[a-z0-9-]+)$/.test(route)) {
    throw new Error("Invalid Cloudflare AI Gateway configuration");
  }
  return url.origin + "/v1/" + match[1] + "/" + match[2] + "/" + route;
}
