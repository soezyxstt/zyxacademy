import { createHmac, timingSafeEqual } from "node:crypto";

type Scope = { accountId: string; sessionId: string; courseId: string };
export const intakeLeaseSeconds = 15 * 60;

function mac(secret: string, scope: Scope, purpose: string, revision: string, expires: number) {
  return createHmac("sha256", secret).update(JSON.stringify([
    "native-admin-intake.v1", scope.accountId, scope.sessionId, scope.courseId, purpose, revision, expires,
  ])).digest();
}

export function issueIntakeProof(secret: string, scope: Scope, purpose: string, revision: string, now = Date.now()) {
  const expires = now + intakeLeaseSeconds * 1000;
  return expires + "." + mac(secret, scope, purpose, revision, expires).toString("base64url");
}

export function verifyIntakeProof(secret: string, scope: Scope, purpose: string, revision: string, proof: string, now = Date.now()) {
  if (!/^\d{1,16}\.[\w-]{43}$/.test(proof)) return false;
  const [timestamp, signature] = proof.split(".");
  const expires = Number(timestamp);
  const decoded = Buffer.from(signature, "base64url");
  return Number.isSafeInteger(expires) && expires > now && decoded.length === 32 &&
    timingSafeEqual(decoded, mac(secret, scope, purpose, revision, expires));
}
