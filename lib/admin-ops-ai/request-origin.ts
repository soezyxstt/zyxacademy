function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function firstHeaderValue(headers: Headers | undefined, name: string): string | null {
  const raw = headers?.get(name);
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

function buildForwardedOrigin(headers: Headers | undefined, fallbackProto: string): string | null {
  const host = firstHeaderValue(headers, "x-forwarded-host") ?? firstHeaderValue(headers, "host");
  if (!host || /[\s/@\\]/.test(host)) return null;
  const forwardedProto = firstHeaderValue(headers, "x-forwarded-proto")?.toLowerCase();
  const proto = forwardedProto === "https" || forwardedProto === "http" ? `${forwardedProto}:` : fallbackProto;
  return normalizeOrigin(`${proto}//${host}`);
}

/**
 * Verifies that an admin Ops AI browser request originates from the same site,
 * accounting for reverse proxies (such as Cloud Run) where `req.url` reflects
 * an internal container host/protocol while the browser sends the public origin.
 */
export function isSameOriginAdminRequest(req: Request, requestHeaders?: Headers): boolean {
  const fetchSite =
    firstHeaderValue(req.headers, "sec-fetch-site") ??
    firstHeaderValue(requestHeaders, "sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return false;
  }

  const rawOrigin =
    firstHeaderValue(req.headers, "origin") ??
    firstHeaderValue(requestHeaders, "origin");
  if (!rawOrigin) {
    return true;
  }

  const requestOrigin = normalizeOrigin(rawOrigin);
  if (!requestOrigin) {
    return false;
  }

  const allowedOrigins = new Set<string>();
  let fallbackProto = "https:";

  try {
    const parsedReqUrl = new URL(req.url);
    allowedOrigins.add(parsedReqUrl.origin);
    fallbackProto = parsedReqUrl.protocol;
  } catch {
    // Ignore malformed request URL; rely on forwarded and configured origins.
  }

  const reqForwarded = buildForwardedOrigin(req.headers, fallbackProto);
  if (reqForwarded) allowedOrigins.add(reqForwarded);

  const nextForwarded = buildForwardedOrigin(requestHeaders, fallbackProto);
  if (nextForwarded) allowedOrigins.add(nextForwarded);

  const authOrigin = normalizeOrigin(process.env.BETTER_AUTH_URL);
  if (authOrigin) allowedOrigins.add(authOrigin);

  const publicOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (publicOrigin) allowedOrigins.add(publicOrigin);

  return allowedOrigins.has(requestOrigin);
}
