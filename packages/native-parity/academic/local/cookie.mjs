import { createHmac } from "node:crypto";

export function fixtureCookie(role) {
  const token = "fixture-academic-" + role;
  const signature = createHmac("sha256", "academic-local-fixture-secret-for-smoke-only").update(token).digest("base64");
  return "better-auth.session_token=" + encodeURIComponent(token + "." + signature);
}
