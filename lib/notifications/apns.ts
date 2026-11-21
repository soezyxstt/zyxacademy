/**
 * lib/notifications/apns.ts
 *
 * Server-side Apple Push Notification service (APNs) HTTP/2 provider using
 * token-based authentication (ES256 JWT).
 *
 * IMPORTANT: Server-only module. Never import in client components.
 */

import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import * as http2 from "node:http2";
import type { NotificationPayload } from "./types";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKeyPem: string;
  bundleId: string;
  useSandbox: boolean;
}

export interface ApnsRequestInput {
  host: string;
  deviceToken: string;
  jwt: string;
  bundleId: string;
  payloadJson: string;
}

export interface ApnsResponse {
  status: number;
  reason?: string;
}

export type ApnsRequestSender = (input: ApnsRequestInput) => Promise<ApnsResponse>;

export interface ApnsSendResult {
  succeeded: number;
  failedTokens: string[];
  errors: string[];
}

const APNS_PRODUCTION_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const APNS_JWT_TTL_SECONDS = 50 * 60; // Apple allows up to 60 minutes; rotate at 50 minutes.

const INVALID_APNS_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
]);

let cachedJwt: { token: string; issuedAt: number; cacheKey: string } | null = null;

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Normalizes a PEM key provided either directly (with literal \n escapes)
 * or base64-encoded in APNS_PRIVATE_KEY.
 */
export function normalizeApnsPrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY") || trimmed.includes("BEGIN EC PRIVATE KEY")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
  if (decoded.includes("BEGIN PRIVATE KEY") || decoded.includes("BEGIN EC PRIVATE KEY")) {
    return decoded.replace(/\\n/g, "\n");
  }
  return trimmed;
}

export function getApnsConfig(
  envSource: Record<string, string | undefined> = process.env,
): ApnsConfig | null {
  const keyId = envSource.APNS_KEY_ID?.trim();
  const teamId = envSource.APNS_TEAM_ID?.trim();
  const rawPrivateKey = envSource.APNS_PRIVATE_KEY?.trim();
  const bundleId = envSource.APNS_BUNDLE_ID?.trim();

  if (!keyId || !teamId || !rawPrivateKey || !bundleId) {
    return null;
  }

  return {
    keyId,
    teamId,
    privateKeyPem: normalizeApnsPrivateKey(rawPrivateKey),
    bundleId,
    useSandbox: envSource.APNS_USE_SANDBOX === "1",
  };
}

export function isApnsConfigured(
  envSource: Record<string, string | undefined> = process.env,
): boolean {
  return getApnsConfig(envSource) !== null;
}

/**
 * Converts an ASN.1 DER-encoded ECDSA P-256 signature to the 64-byte
 * IEEE P1363 (r || s) format required by JWS ES256.
 */
function derToJoseEs256(der: Buffer): Buffer {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error("Invalid DER ECDSA signature");
  }
  let offset = 2;
  if (der[1] & 0x80) {
    const lenBytes = der[1] & 0x7f;
    offset = 2 + lenBytes;
  }
  if (der[offset] !== 0x02) throw new Error("Invalid DER ECDSA signature (missing r)");
  const rLen = der[offset + 1];
  const rBytes = der.subarray(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;

  if (der[offset] !== 0x02) throw new Error("Invalid DER ECDSA signature (missing s)");
  const sLen = der[offset + 1];
  const sBytes = der.subarray(offset + 2, offset + 2 + sLen);

  const toFixed32 = (bytes: Buffer): Buffer => {
    let slice = bytes;
    while (slice.length > 32 && slice[0] === 0x00) {
      slice = slice.subarray(1);
    }
    if (slice.length > 32) {
      throw new Error("ECDSA integer exceeds 32 bytes");
    }
    const out = Buffer.alloc(32, 0);
    slice.copy(out, 32 - slice.length);
    return out;
  };

  return Buffer.concat([toFixed32(rBytes), toFixed32(sBytes)]);
}

export function createApnsJwt(
  config: ApnsConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64UrlEncode(
    JSON.stringify({
      alg: "ES256",
      kid: config.keyId,
    }),
  );
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: config.teamId,
      iat: nowSeconds,
    }),
  );
  const signingInput = `${header}.${claims}`;

  const privateKey: KeyObject = createPrivateKey({
    key: config.privateKeyPem,
    format: "pem",
  });
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const derSignature = signer.sign(privateKey);
  const joseSignature = derToJoseEs256(derSignature);

  return `${signingInput}.${base64UrlEncode(joseSignature)}`;
}

function getOrCreateApnsJwt(config: ApnsConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const cacheKey = `${config.keyId}:${config.teamId}:${config.bundleId}:${config.useSandbox ? "sandbox" : "prod"}`;
  if (
    cachedJwt &&
    cachedJwt.cacheKey === cacheKey &&
    nowSeconds - cachedJwt.issuedAt < APNS_JWT_TTL_SECONDS
  ) {
    return cachedJwt.token;
  }
  const token = createApnsJwt(config, nowSeconds);
  cachedJwt = { token, issuedAt: nowSeconds, cacheKey };
  return token;
}

export function resetApnsJwtCacheForTests(): void {
  cachedJwt = null;
}

export function buildApnsPayload(payload: NotificationPayload): Record<string, unknown> {
  return {
    ...(payload.metadata ?? {}),
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: "default",
    },
    type: payload.type,
    url: payload.link ?? "/dashboard",
  };
}

const APNS_MAX_CONCURRENCY = 20;
const APNS_REQUEST_TIMEOUT_MS = 10_000;

function sendApnsOnSession(
  client: http2.ClientHttp2Session,
  input: ApnsRequestInput,
): Promise<ApnsResponse> {
  if (client.closed || client.destroyed) {
    return Promise.reject(new Error("APNs HTTP/2 session is closed"));
  }

  return new Promise<ApnsResponse>((resolve, reject) => {
    let settled = false;
    let req: http2.ClientHttp2Stream | null = null;

    const cleanup = () => {
      client.off("error", onSessionError);
      client.off("goaway", onSessionGoaway);
      client.off("close", onSessionClose);
    };

    const finish = (err: unknown, res?: ApnsResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(res ?? { status: 500, reason: "UnknownError" });
    };

    const onSessionError = (err: unknown) => {
      client.destroy();
      finish(err instanceof Error ? err : new Error(String(err)));
    };
    const onSessionGoaway = () => {
      client.destroy();
      finish(new Error("APNs HTTP/2 session received GOAWAY"));
    };
    const onSessionClose = () => {
      finish(new Error("APNs HTTP/2 session closed unexpectedly"));
    };

    client.once("error", onSessionError);
    client.once("goaway", onSessionGoaway);
    client.once("close", onSessionClose);

    try {
      req = client.request({
        ":method": "POST",
        ":path": `/3/device/${encodeURIComponent(input.deviceToken)}`,
        authorization: `bearer ${input.jwt}`,
        "apns-topic": input.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
    } catch (err) {
      client.destroy();
      finish(err);
      return;
    }

    let status = 500;
    const chunks: Buffer[] = [];

    req.setTimeout(APNS_REQUEST_TIMEOUT_MS, () => {
      req?.close(http2.constants.NGHTTP2_CANCEL);
      client.destroy();
      finish(new Error("APNs request timed out"));
    });

    req.on("response", (headers) => {
      const rawStatus = headers[":status"];
      status = typeof rawStatus === "number" ? rawStatus : Number(rawStatus ?? 500);
    });

    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });

    req.on("aborted", () => {
      finish(new Error("APNs request aborted"));
    });

    req.on("error", (err) => {
      client.destroy();
      finish(err);
    });

    req.on("end", () => {
      let reason: string | undefined;
      if (chunks.length > 0) {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { reason?: string };
          reason = parsed.reason;
        } catch {
          // Ignore malformed error body
        }
      }
      finish(null, { status, reason });
    });

    req.on("close", () => {
      if (!settled) {
        finish(new Error("APNs stream closed before response completed"));
      }
    });

    req.end(input.payloadJson);
  });
}

function createApnsHttp2BatchSession(host: string) {
  let client: http2.ClientHttp2Session | null = null;
  let hadSessionError = false;

  const ensureClient = (): http2.ClientHttp2Session => {
    if (!client || client.closed || client.destroyed) {
      client = http2.connect(host);
      client.setMaxListeners(APNS_MAX_CONCURRENCY + 16);
      client.on("error", () => {
        hadSessionError = true;
        client?.destroy();
      });
      client.on("goaway", () => {
        hadSessionError = true;
        client?.destroy();
      });
    }
    return client;
  };

  return {
    send: async (input: ApnsRequestInput): Promise<ApnsResponse> => {
      const activeClient = ensureClient();
      try {
        return await sendApnsOnSession(activeClient, input);
      } catch (err) {
        hadSessionError = true;
        throw err;
      }
    },
    close: () => {
      if (!client) return;
      if (hadSessionError) {
        client.destroy();
      } else if (!client.closed && !client.destroyed) {
        client.close();
      }
      client = null;
    },
  };
}

export async function sendApnsNotifications(
  tokens: string[],
  payload: NotificationPayload,
  deps?: {
    config?: ApnsConfig | null;
    sendRequest?: ApnsRequestSender;
    nowSeconds?: number;
    concurrency?: number;
  },
): Promise<ApnsSendResult> {
  if (tokens.length === 0) {
    return { succeeded: 0, failedTokens: [], errors: [] };
  }

  const config = deps?.config !== undefined ? deps.config : getApnsConfig();
  if (!config) {
    return {
      succeeded: 0,
      failedTokens: [],
      errors: ["APNs transport is not configured"],
    };
  }

  let jwt: string;
  try {
    jwt = deps?.nowSeconds !== undefined
      ? createApnsJwt(config, deps.nowSeconds)
      : getOrCreateApnsJwt(config);
  } catch (err) {
    return {
      succeeded: 0,
      failedTokens: [],
      errors: [`APNs JWT signing failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const host = config.useSandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;
  const payloadJson = JSON.stringify(buildApnsPayload(payload));
  const batchSession = deps?.sendRequest ? null : createApnsHttp2BatchSession(host);
  const sendRequest: ApnsRequestSender = deps?.sendRequest ?? ((input) => batchSession!.send(input));
  const maxConcurrency = Math.max(1, Math.min(deps?.concurrency ?? APNS_MAX_CONCURRENCY, tokens.length));

  let succeeded = 0;
  const failedTokens: string[] = [];
  const errors: string[] = [];
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < tokens.length) {
      const currentIndex = nextIndex++;
      const deviceToken = tokens[currentIndex];
      try {
        const res = await sendRequest({
          host,
          deviceToken,
          jwt,
          bundleId: config.bundleId,
          payloadJson,
        });
        if (res.status >= 200 && res.status < 300) {
          succeeded += 1;
          continue;
        }
        if (res.status === 410 || (res.status === 400 && res.reason && INVALID_APNS_REASONS.has(res.reason))) {
          failedTokens.push(deviceToken);
          continue;
        }
        errors.push(`APNs token ${deviceToken.slice(0, 12)}: HTTP ${res.status}${res.reason ? ` (${res.reason})` : ""}`);
      } catch (err) {
        errors.push(`APNs token ${deviceToken.slice(0, 12)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: maxConcurrency }, () => runWorker()));
  } finally {
    batchSession?.close();
  }

  return { succeeded, failedTokens, errors };
}
