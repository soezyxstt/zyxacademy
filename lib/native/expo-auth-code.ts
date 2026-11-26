import { createHash, createHmac } from "node:crypto";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { EXPO_STAGING_ORIGIN } from "./expo-auth-config";

export function isExpoCodeChallenge(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

// The challenge is public. A separate server secret keeps the underlying
// Better Auth one-time token out of both the callback and the client.
function exchangeKey(challenge: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`zyx-expo-login-v1\n${EXPO_STAGING_ORIGIN}\n${challenge}`).digest("hex");
}

export function encodeExpoAuthCode(token: string, challenge: string, secret: string) {
  if (!isExpoCodeChallenge(challenge)) throw new TypeError("Invalid login challenge");
  return symmetricEncrypt({ key: exchangeKey(challenge, secret), data: token });
}

export async function decodeExpoAuthCode(code: unknown, verifier: unknown, secret: string) {
  if (typeof code !== "string" || !code.length || code.length > 1024 ||
    typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return null;
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  try {
    return await symmetricDecrypt({ key: exchangeKey(challenge, secret), data: code });
  } catch {
    return null;
  }
}
