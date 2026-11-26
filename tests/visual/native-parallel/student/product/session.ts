import { makeSignature } from "better-auth/crypto";
import { Client } from "pg";

export async function localStudentCookie(scenario: "enrolled" | "unenrolled" | "revoked") {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || !["127.0.0.1", "localhost"].includes(database.hostname) ||
      database.pathname !== "/student_evidence") throw new Error("Expected the local Student evidence fixture");
  const client = new Client({ connectionString: database.href });
  await client.connect();
  try {
    const result = await client.query<{ token: string }>(
      "select token from session where id = $1 and expires_at > now()", ["student-evidence-" + scenario]);
    if (result.rowCount !== 1) throw new Error("Missing synthetic Student session");
    const token = result.rows[0].token;
    return { name: "better-auth.session_token", value: encodeURIComponent(token + "." + await makeSignature(token, secret)) };
  } finally { await client.end(); }
}
