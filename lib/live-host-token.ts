import { createHmac } from "node:crypto";

export function makeHostToken(userId: string, name: string, sessionId: string, secret: string) {
  const payload = { userId, name, sessionId, exp: Date.now() + 86_400_000, isHost: true };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}
