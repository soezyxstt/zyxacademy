import { createClient } from "@libsql/client";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { auth } from "@/lib/auth";
import { getPeranCodes } from "@/lib/auth/authorization";
import { resolveAuthSecret } from "@/lib/auth-secret";
import {
 assertStagingEnvironment,
 parseEnvFile,
 resolveDatabaseConnection,
 safeGuardError,
} from "@/lib/staging/staging-guard";
import {
 currentSourceCommit,
 parseCliArgs,
 requiredCliArg,
 writeArtifact,
} from "@/lib/staging/migration-ledger";

type Row = Record<string, unknown>;
type SmokeCase = {
 name: string;
 status: "passed" | "blocked";
 roleCount: number;
 sessionRefreshPassed: boolean;
};

function rows(result: { rows: unknown[] }): Row[] {
 return result.rows as Row[];
}

function activeExpiryArgs(): [number, number] {
 const nowMs = Date.now();
 return [nowMs, Math.floor(nowMs / 1000)];
}

function signedSessionCookie(token: string): string {
 const signature = createHmac("sha256", resolveAuthSecret()).update(token, "utf8").digest("base64");
 return encodeURIComponent(`${token}.${signature}`);
}

function sessionCookieName(): string {
 return process.env.BETTER_AUTH_URL?.trim().toLowerCase().startsWith("https://")
  ? "__Secure-better-auth.session_token"
  : "better-auth.session_token";
}

async function sessionForPeran(
 client: ReturnType<typeof createClient>,
 role: string,
): Promise<{ userId: string; token: string } | null> {
 const result = await client.execute({
  sql: `SELECT p.id AS user_id, s.token
   FROM pengguna p
   INNER JOIN pengguna_peran pp ON pp.pengguna_id = p.id
   INNER JOIN peran r ON r.id = pp.peran_id
   INNER JOIN session s ON s.user_id = p.id
   WHERE p.status = 'active' AND r.code = ? AND (s.expires_at > ? OR s.expires_at > ?)
   ORDER BY s.updated_at DESC, s.expires_at DESC, p.id
   LIMIT 1`,
  args: [role, ...activeExpiryArgs()],
 });
 const row = rows(result)[0];
 if (!row?.user_id || !row.token) return null;
 return { userId: String(row.user_id), token: String(row.token) };
}

async function multiRoleSession(client: ReturnType<typeof createClient>): Promise<{ userId: string; token: string } | null> {
 const configuredUserId = process.env.STAGING_SMOKE_MULTI_USER_ID?.trim();
 const result = configuredUserId
  ? await client.execute({
   sql: `SELECT p.id AS user_id, s.token
    FROM pengguna p
    INNER JOIN pengguna_peran pp ON pp.pengguna_id = p.id
    INNER JOIN peran r ON r.id = pp.peran_id
    INNER JOIN session s ON s.user_id = p.id
    WHERE p.id = ? AND p.status = 'active' AND (s.expires_at > ? OR s.expires_at > ?)
    GROUP BY p.id, s.token
    HAVING COUNT(DISTINCT r.code) >= 2
    ORDER BY s.expires_at DESC
    LIMIT 1`,
   args: [configuredUserId, ...activeExpiryArgs()],
  })
  : await client.execute({
   sql: `SELECT p.id AS user_id, s.token
    FROM pengguna p
    INNER JOIN pengguna_peran pp ON pp.pengguna_id = p.id
    INNER JOIN peran r ON r.id = pp.peran_id
    INNER JOIN session s ON s.user_id = p.id
    WHERE p.status = 'active' AND (s.expires_at > ? OR s.expires_at > ?)
    GROUP BY p.id, s.token
    HAVING COUNT(DISTINCT r.code) >= 2
    ORDER BY p.id, s.expires_at DESC
    LIMIT 1`,
   args: activeExpiryArgs(),
  });
 const row = rows(result)[0];
 if (!row?.user_id || !row.token) return null;
 return { userId: String(row.user_id), token: String(row.token) };
}

async function validateSession(userId: string, token: string, expectedRoles: string[]): Promise<SmokeCase> {
 const codes = await getPeranCodes(userId);
 const roleSet = new Set(codes);
 const hasExpectedRoles = expectedRoles.every((role) => roleSet.has(role as typeof codes[number]));
 const headers = new Headers({ cookie: `${sessionCookieName()}=${signedSessionCookie(token)}` });
 const first = await auth.api.getSession({ headers });
 const second = await auth.api.getSession({ headers });
 const sessionRefreshPassed = first?.user?.id === userId && second?.user?.id === userId;
 return {
  name: expectedRoles.join("+") || "unknown",
  status: hasExpectedRoles && sessionRefreshPassed ? "passed" : "blocked",
  roleCount: codes.length,
  sessionRefreshPassed,
 };
}

async function main(): Promise<void> {
 const args = parseCliArgs();
 const runId = requiredCliArg(args, "run-id");
 const requestedRoles = typeof args.roles === "string"
  ? args.roles.split(",").map((role) => role.trim()).filter(Boolean)
  : ["admin", "tutor", "murid", "multi"];

 try {
  if (process.env.FEATURE_PERAN_V2 !== "1") throw new Error("FEATURE_PERAN_V2 must be 1 for auth smoke");
  assertStagingEnvironment({
   productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
   requiredResources: ["database", "authUrl"],
  });
  const client = createClient(resolveDatabaseConnection(process.env));
  try {
   const cases: SmokeCase[] = [];
   for (const requestedRole of requestedRoles) {
    if (requestedRole === "multi") {
     const session = await multiRoleSession(client);
     if (!session) {
      cases.push({ name: "admin+tutor multi-role", status: "blocked", roleCount: 0, sessionRefreshPassed: false });
      continue;
     }
     cases.push(await validateSession(session.userId, session.token, ["admin", "tutor"]));
     continue;
    }
    const session = await sessionForPeran(client, requestedRole);
    if (!session) {
     cases.push({ name: requestedRole, status: "blocked", roleCount: 0, sessionRefreshPassed: false });
     continue;
    }
    cases.push(await validateSession(session.userId, session.token, [requestedRole]));
   }
   const report = {
    status: cases.every((item) => item.status === "passed") ? "passed" : "blocked",
    runId,
    sourceCommit: currentSourceCommit(),
    featurePeranV2: process.env.FEATURE_PERAN_V2 === "1",
    cases,
   };
   await writeArtifact(runId, "smoke-auth.json", report);
   console.log(JSON.stringify(report));
   if (report.status !== "passed") process.exitCode = 1;
  } finally {
   client.close();
  }
 } catch (error) {
  const safe = safeGuardError(error);
  console.error(JSON.stringify({ status: "blocked", ...safe }));
  process.exitCode = 1;
 }
}

void main();
