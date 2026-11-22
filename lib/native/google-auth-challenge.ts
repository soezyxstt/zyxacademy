import { createHash, randomBytes } from "node:crypto";
import { and, eq, like, lt } from "drizzle-orm";
import { db } from "@/db";
import { verification } from "@/db/schema";

export const NATIVE_GOOGLE_CHALLENGE_COOKIE = "zyx_native_google_challenge";
export const NATIVE_GOOGLE_CHALLENGE_TTL_SECONDS = 300;
const PREFIX = "native-google:";
const PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function challengeKey(proof: string): string | null {
  if (!PROOF_PATTERN.test(proof)) return null;
  return `${PREFIX}${createHash("sha256").update(proof).digest("hex")}`;
}

/** The browser proof stays HttpOnly; Google receives only the independent nonce. */
export async function issueNativeGoogleChallenge(origin: string, previousProof?: string) {
  const proof = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const key = challengeKey(proof)!;
  const now = new Date();
  const previousKey = previousProof ? challengeKey(previousProof) : null;

  await db.transaction(async (tx) => {
    if (previousKey) await tx.delete(verification).where(eq(verification.id, previousKey));
    await tx.delete(verification).where(and(
      like(verification.id, `${PREFIX}%`),
      lt(verification.expiresAt, now),
    ));
    await tx.insert(verification).values({
      id: key,
      identifier: key,
      value: JSON.stringify({ nonce, origin }),
      expiresAt: new Date(now.getTime() + NATIVE_GOOGLE_CHALLENGE_TTL_SECONDS * 1000),
      createdAt: now,
      updatedAt: now,
    });
  });

  return { proof, nonce };
}

/** DELETE RETURNING makes concurrent attempts consume a challenge at most once. */
export async function consumeNativeGoogleChallenge(proof: string, origin: string): Promise<string | null> {
  const key = challengeKey(proof);
  if (!key) return null;
  const [record] = await db.delete(verification).where(eq(verification.id, key))
    .returning({ value: verification.value, expiresAt: verification.expiresAt });
  if (!record || record.expiresAt.getTime() <= Date.now()) return null;
  try {
    const value: unknown = JSON.parse(record.value);
    if (!value || typeof value !== "object" || !("nonce" in value) || !("origin" in value)) return null;
    return value.origin === origin && typeof value.nonce === "string" && PROOF_PATTERN.test(value.nonce)
      ? value.nonce
      : null;
  } catch {
    return null;
  }
}
