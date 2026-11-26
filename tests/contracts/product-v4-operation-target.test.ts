import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertV4OperationTarget } from "../../scripts/authoring/v4-operation-target";

const staging = {
  ZYX_ENVIRONMENT: "staging",
  NEXT_PUBLIC_APP_URL: "https://staging.zyxacademy.com",
  DATABASE_URL: "postgresql://synthetic:synthetic@ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full",
  STORAGE_PROVIDER_MODE: "neon",
  AWS_ENDPOINT_URL_S3: "https://br-gentle-scene-azq0gp91.storage.c-3.ap-southeast-1.aws.neon.tech",
  NEON_STORAGE_BUCKET: "zyx-staging",
  AWS_REGION: "ap-southeast-1",
  AWS_ACCESS_KEY_ID: "synthetic-storage-key",
  AWS_SECRET_ACCESS_KEY: "synthetic-storage-secret",
};
const production = {
  ...staging,
  ZYX_ENVIRONMENT: "production",
  NEXT_PUBLIC_APP_URL: "https://www.zyxacademy.com",
  DATABASE_URL: "postgresql://synthetic:synthetic@ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full",
  AWS_ENDPOINT_URL_S3: "https://br-wandering-butterfly-azi11h8r.storage.c-3.ap-southeast-1.aws.neon.tech",
  NEON_STORAGE_BUCKET: "zyx-production",
};

test("operations accept each approved Neon target and return only safe target identity", () => {
  for (const env of [staging, production]) {
    expect(assertV4OperationTarget(env)).toEqual({
      environment: env.ZYX_ENVIRONMENT,
      origin: env.NEXT_PUBLIC_APP_URL,
      databaseHost: new URL(env.DATABASE_URL).hostname,
    });
    const summary = JSON.stringify(assertV4OperationTarget(env));
    for (const secret of [env.DATABASE_URL, env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY]) {
      expect(summary).not.toContain(secret);
    }
  }
});

test("operations require an exact environment and its app origin", () => {
  for (const ZYX_ENVIRONMENT of [undefined, "", "preview", "staging ", "__proto__"]) {
    expect(() => assertV4OperationTarget({ ...staging, ZYX_ENVIRONMENT })).toThrow("V4_OPERATION_ENVIRONMENT_INVALID");
  }
  for (const NEXT_PUBLIC_APP_URL of [undefined, "http://localhost:3000", production.NEXT_PUBLIC_APP_URL, `${staging.NEXT_PUBLIC_APP_URL}/`, `${staging.NEXT_PUBLIC_APP_URL}/other`]) {
    expect(() => assertV4OperationTarget({ ...staging, NEXT_PUBLIC_APP_URL })).toThrow("V4_OPERATION_ENVIRONMENT_INVALID");
  }
});

test("operations reject cross-environment database and storage bindings in both directions", () => {
  for (const [selected, other] of [[staging, production], [production, staging]]) {
    expect(() => assertV4OperationTarget({ ...selected, DATABASE_URL: other.DATABASE_URL })).toThrow("V4_OPERATION_DATABASE_TARGET_MISMATCH");
    for (const patch of [
      { AWS_ENDPOINT_URL_S3: other.AWS_ENDPOINT_URL_S3 },
      { NEON_STORAGE_BUCKET: other.NEON_STORAGE_BUCKET },
      { AWS_ENDPOINT_URL_S3: other.AWS_ENDPOINT_URL_S3, NEON_STORAGE_BUCKET: other.NEON_STORAGE_BUCKET },
    ]) {
      expect(() => assertV4OperationTarget({ ...selected, ...patch })).toThrow("V4_OPERATION_STORAGE_TARGET_MISMATCH");
    }
  }
});

test("operations reject missing, local, legacy and unapproved database targets", () => {
  for (const DATABASE_URL of [undefined, "", "[SENSITIVE]", "invalid", "libsql://old.turso.io", "https://old.turso.io", "postgresql://synthetic@localhost/neondb?sslmode=verify-full", staging.DATABASE_URL.replace("neondb?", "other?"), staging.DATABASE_URL.replace(".tech/", ".tech:5433/"), staging.DATABASE_URL.replace(".tech/", ".tech.example.com/")]) {
    expect(() => assertV4OperationTarget({ ...staging, DATABASE_URL })).toThrow("V4_OPERATION_DATABASE_TARGET_MISMATCH");
  }
});

test("the postgres alias preserves the original setting and every database target check", () => {
  for (const env of [staging, production]) {
    const original = { ...env, DATABASE_URL: env.DATABASE_URL.replace("postgresql:", "postgres:") };
    const before = { ...original };
    expect(assertV4OperationTarget(original)).toEqual(assertV4OperationTarget(env));
    expect(original).toEqual(before);
  }
  for (const database of [production.DATABASE_URL, staging.DATABASE_URL.replace("verify-full", "require"), `${staging.DATABASE_URL}&host=localhost`, `${staging.DATABASE_URL}&sslmode=disable`]) {
    expect(() => assertV4OperationTarget({ ...staging, DATABASE_URL: database.replace("postgresql:", "postgres:") })).toThrow("V4_OPERATION_DATABASE_TARGET_MISMATCH");
  }
});

test("database TLS and query guards prevent target overrides", () => {
  for (const DATABASE_URL of [
    staging.DATABASE_URL.replace("?sslmode=verify-full", ""),
    staging.DATABASE_URL.replace("verify-full", "require"),
    `${staging.DATABASE_URL}&sslmode=disable`,
    `${staging.DATABASE_URL}&host=localhost`,
    `${staging.DATABASE_URL}&dbname=other`,
    `${staging.DATABASE_URL}&options=-c%20search_path%3Dother`,
    `${staging.DATABASE_URL}#fragment`,
  ]) {
    expect(() => assertV4OperationTarget({ ...staging, DATABASE_URL })).toThrow("V4_OPERATION_DATABASE_TARGET_MISMATCH");
  }
  expect(() => assertV4OperationTarget({ ...staging, DATABASE_URL: `${staging.DATABASE_URL.replace(".tech/", ".tech:5432/")}&channel_binding=require&application_name=v4-operations&connect_timeout=15` })).not.toThrow();
});

test("legacy Turso variables cannot supply or override the application database", () => {
  const legacy = { TURSO_CONNECTION_URL: "libsql://old.turso.io", TURSO_AUTH_TOKEN: "synthetic-old-token" };
  expect(assertV4OperationTarget({ ...staging, ...legacy })).toEqual(assertV4OperationTarget(staging));
  expect(() => assertV4OperationTarget({ ...staging, ...legacy, DATABASE_URL: undefined })).toThrow("V4_OPERATION_DATABASE_TARGET_MISMATCH");
  expect(() => assertV4OperationTarget({ ...staging, ...legacy, DATABASE_URL: production.DATABASE_URL })).toThrow("V4_OPERATION_DATABASE_TARGET_MISMATCH");
});

test("storage requires the private Neon endpoint without URL overrides", () => {
  for (const AWS_ENDPOINT_URL_S3 of [undefined, "invalid", "http://localhost:9000", staging.AWS_ENDPOINT_URL_S3.replace("https:", "http:"), staging.AWS_ENDPOINT_URL_S3.replace("https://", "https://synthetic:synthetic@"), `${staging.AWS_ENDPOINT_URL_S3}:8443`, `${staging.AWS_ENDPOINT_URL_S3}/other`, `${staging.AWS_ENDPOINT_URL_S3}?bucket=other`, `${staging.AWS_ENDPOINT_URL_S3}#fragment`, `${staging.AWS_ENDPOINT_URL_S3}.example.com`]) {
    expect(() => assertV4OperationTarget({ ...staging, AWS_ENDPOINT_URL_S3 })).toThrow("V4_OPERATION_STORAGE_TARGET_MISMATCH");
  }
  for (const patch of [{ STORAGE_PROVIDER_MODE: undefined }, { STORAGE_PROVIDER_MODE: "r2" }, { AWS_REGION: "us-east-1" }, { NEON_STORAGE_BUCKET: "public" }]) {
    expect(() => assertV4OperationTarget({ ...staging, ...patch })).toThrow("V4_OPERATION_STORAGE_TARGET_MISMATCH");
  }
  expect(() => assertV4OperationTarget({ ...staging, AWS_ENDPOINT_URL_S3: `${staging.AWS_ENDPOINT_URL_S3}/` })).not.toThrow();
});

test("storage credentials must be present and cannot be redacted placeholders", () => {
  for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
    for (const value of [undefined, "", "  ", "[SENSITIVE]", " [SENSITIVE] "]) {
      expect(() => assertV4OperationTarget({ ...staging, [key]: value })).toThrow("V4_OPERATION_STORAGE_CREDENTIALS_REQUIRED");
    }
  }
});

test("the real server entrypoint validates targets before clients and loads server imports without I/O", () => {
  const directory = mkdtempSync(join(tmpdir(), "v4-operation-imports-"));
  const preload = join(directory, "preload.ts");
  try {
    writeFileSync(preload, [
      'import { mock } from "bun:test";',
      'import { Socket } from "node:net";',
      'globalThis.fetch = () => { throw new Error("TEST_NETWORK_FORBIDDEN"); };',
      'Socket.prototype.connect = () => { throw new Error("TEST_NETWORK_FORBIDDEN"); };',
      `mock.module(${JSON.stringify(resolve("db/index.ts"))}, () => ({ db: { select() { throw new Error("V4_OPERATION_TEST_IMPORTS_READY"); } } }));`,
    ].join("\n"));
    for (const valid of [false, true]) {
      const result = spawnSync(process.execPath, ["--conditions=react-server", "--preload", preload, "scripts/authoring/operate-v4-verification.ts"], {
        cwd: process.cwd(),
        env: { ...staging, NODE_ENV: "production", DATABASE_URL: valid ? staging.DATABASE_URL : undefined, TURSO_CONNECTION_URL: "libsql://old.turso.io", V4_OPERATION: "inspect", SKIP_ENV_VALIDATION: "1" },
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe(valid ? "V4_OPERATION_TEST_IMPORTS_READY" : "V4_OPERATION_DATABASE_TARGET_MISMATCH");
      if (valid) expect(JSON.parse(result.stdout)).toEqual({ ...assertV4OperationTarget(staging), action: "inspect", purpose: "logic" });
      else expect(result.stdout).toBe("");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the manual verify job keeps branch isolation and uses the deployed Bun runtime", () => {
  const workflow = Bun.YAML.parse(readFileSync(".github/workflows/v4-verification.yml", "utf8")) as {
    on: { workflow_dispatch: { inputs: { purpose: { type: string; options: string[]; default: string; required: boolean } } } };
    permissions: Record<string, string>;
    jobs: { verify: { if: string; environment: string; steps: Array<{ uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> }> } };
  };
  const verify = workflow.jobs.verify;
  const runtimeVersion = readFileSync("Dockerfile.cloud-run", "utf8").match(/^FROM oven\/bun:([\d.]+)-/m)?.[1];
  expect(runtimeVersion).toBe("1.3.14");
  expect(verify.steps.find(step => step.uses === "oven-sh/setup-bun@v2")?.with?.["bun-version"]).toBe(runtimeVersion);
  const operation = verify.steps.find(step => step.run?.includes("operate-v4-verification.ts"));
  expect(operation?.run).toBe([
    'if [ "$ZYX_ENVIRONMENT" = staging ] && [ "$V4_PURPOSE" = pdf ]; then',
    "  python3 .github/scripts/staging_authoring_browser.py bun --conditions=react-server scripts/authoring/operate-v4-verification.ts",
    "else",
    "  bun --conditions=react-server scripts/authoring/operate-v4-verification.ts",
    "fi", "",
  ].join("\n"));
  expect(operation?.env?.V4_PURPOSE).toBe("${{ inputs.purpose }}");
  expect(workflow.on.workflow_dispatch.inputs.purpose).toMatchObject({ type: "choice", options: ["logic", "pdf"], default: "logic", required: true });
  expect(verify.environment).toBe("${{ inputs.environment }}");
  expect(verify.if).toBe("(inputs.environment == 'production' && github.ref == 'refs/heads/main') || (inputs.environment == 'staging' && github.ref == 'refs/heads/staging')");
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(verify.steps.find(step => step.uses === "actions/checkout@v4")?.with?.["persist-credentials"]).toBe(false);
  expect(verify.steps.find(step => step.uses === "actions/upload-artifact@v4")?.with?.["retention-days"]).toBe(3);
});
