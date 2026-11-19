const originHeader = "x-zyx-origin-token";
const clientIpHeader = "x-zyx-client-ip";
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const hopHeaders = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
];

function failure(status) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

function getOrigins(env) {
  try {
    const edge = new URL(env.PUBLIC_ORIGIN);
    const origin = new URL(env.CLOUD_RUN_ORIGIN);
    const isStagingEdge = edge.hostname === "staging.zyxacademy.com" ||
      /^zyx-academy-staging-edge\.[a-z0-9-]+\.workers\.dev$/.test(edge.hostname);
    const isStagingCloudRun = /^(?:[a-z0-9-]+---)?zyx-academy-staging-web-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(origin.hostname) ||
      /^zyx-academy-staging-web-[a-z0-9-]+\.run\.app$/.test(origin.hostname);
    if (isStagingEdge && isStagingCloudRun &&
        [edge, origin].every(url => url.protocol === "https:" && !url.port && url.href === url.origin + "/") &&
        /^[A-Za-z0-9_-]{43,}$/.test(env.CLOUD_RUN_ORIGIN_TOKEN ?? "")) {
      return { edge, origin };
    }
  } catch {
    // Missing or malformed settings leave the Worker closed.
  }
  return null;
}

function cacheableRequest(request, url) {
  // Strict build-asset paths keep encoded, ambiguous and user-managed paths out of this cache.
  const hasBuildQuery = /^\?dpl=[a-f0-9]{40}-[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(url.search);
  return request.method === "GET" && (!url.search || hasBuildQuery) &&
    /^\/_next\/static\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:js|css|woff2?|ttf|otf|eot|svg|png|jpe?g|webp|avif|ico|wasm)$/.test(url.pathname) &&
    !["authorization", "cookie", "range", "rsc", "next-action", "cache-control", "pragma",
      "if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range"]
      .some(name => request.headers.has(name));
}

function cacheableResponse(response) {
  const directives = new Set((response.headers.get("Cache-Control") ?? "")
    .toLowerCase().split(",").map(value => value.trim()));
  const vary = (response.headers.get("Vary") ?? "").toLowerCase().trim();
  const contentType = response.headers.get("Content-Type") ?? "";
  return response.status === 200 && !response.headers.has("Set-Cookie") &&
    (!vary || vary === "accept-encoding") && !/^text\/html\b/i.test(contentType) &&
    directives.has("public") && directives.has("immutable") && directives.has("max-age=31536000") &&
    !["private", "no-cache", "no-store"].some(directive =>
      [...directives].some(value => value.split("=")[0].trim() === directive));
}

function proxyHeaders(request, env, staticAsset) {
  // Share only an invariant representation of a public build file.
  const headers = new Headers(staticAsset ? undefined : request.headers);
  for (const name of (headers.get("connection") ?? "").toLowerCase().split(",")) {
    const field = name.trim();
    if (/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(field)) headers.delete(field);
  }
  for (const name of hopHeaders) headers.delete(name);
  for (const name of [...headers.keys()]) {
    if (["host", "forwarded", "x-real-ip", "x-serverless-authorization"].includes(name) ||
        name.startsWith("x-forwarded-") || name.startsWith("x-zyx-") || name.startsWith("cf-") ||
        name.startsWith("x-middleware-")) headers.delete(name);
  }
  headers.set(originHeader, env.CLOUD_RUN_ORIGIN_TOKEN);
  const ip = request.headers.get("CF-Connecting-IP");
  if (!staticAsset && ip) headers.set(clientIpHeader, ip);
  return headers;
}

function responseForClient(response, cacheStatus, requestedOrigin, cloudOrigin) {
  const result = new Response(response.body, response);
  // The manual static cache is managed below. Disable implicit Cloudflare cache policy
  // for dynamic, authenticated, or otherwise unverified responses.
  if (cacheStatus === "BYPASS") {
    result.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
    result.headers.set("CDN-Cache-Control", "no-store");
  }
  const location = result.headers.get("Location");
  if (location) {
    try {
      if (/^(?:[a-z]+:)?\/\//i.test(location)) {
        const redirect = new URL(location, cloudOrigin);
        if (redirect.origin === cloudOrigin.origin && !redirect.username && !redirect.password) {
          redirect.protocol = requestedOrigin.protocol;
          redirect.host = requestedOrigin.host;
          result.headers.set("Location", redirect.href);
        }
      }
    } catch {
      // Preserve application-defined redirects outside the origin rewrite.
    }
  }
  result.headers.set("X-Zyx-Edge-Cache", cacheStatus);
  return result;
}

export default {
  async fetch(request, env, ctx) {
    const origins = getOrigins(env);
    if (!origins) return failure(503);

    const incoming = new URL(request.url);
    if (incoming.host !== origins.edge.host) return failure(421);
    if (incoming.protocol !== "https:") {
      incoming.protocol = "https:";
      return Response.redirect(incoming, 308);
    }
    if (!methods.has(request.method)) return failure(405);
    if (request.headers.has("Upgrade")) return failure(426);

    const staticAsset = cacheableRequest(request, incoming);
    const cacheKey = staticAsset ? new Request(incoming.href) : null;
    if (cacheKey) {
      const cached = await caches.default.match(cacheKey).catch(() => undefined);
      if (cached) return responseForClient(cached, "HIT", origins.edge, origins.origin);
    }

    const target = new URL(origins.origin);
    target.pathname = incoming.pathname;
    target.search = incoming.search;

    let upstream;
    try {
      upstream = await fetch(target.href, {
        method: request.method,
        headers: proxyHeaders(request, env, staticAsset),
        body: request.body,
        redirect: "manual",
        signal: request.signal,
        cache: "no-store",
      });
    } catch {
      return failure(502);
    }

    if (cacheKey && cacheableResponse(upstream)) {
      ctx.waitUntil(caches.default.put(cacheKey, upstream.clone()).catch(() => {
        console.warn(JSON.stringify({ event: "staging_static_cache_write_failed" }));
      }));
      return responseForClient(upstream, "MISS", origins.edge, origins.origin);
    }
    return responseForClient(upstream, "BYPASS", origins.edge, origins.origin);
  },
};
