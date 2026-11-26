import { expect, test } from "bun:test";
import { assertProductV4ExecutionTarget, productV4ExecutionCapability } from "@/lib/compute/product-v4-execution";

const staging = { ZYX_ENVIRONMENT: "staging", ZYX_MCP_ENVIRONMENT: "staging", NEXT_PUBLIC_APP_URL: "https://staging.zyxacademy.com", BETTER_AUTH_URL: "https://staging.zyxacademy.com" };
test("execution discovery describes the selected provider without claiming worker health", () => {
  for (const provider of ["cloudflare", "steel"]) expect(productV4ExecutionCapability({ ...staging, AUTHORING_VERIFICATION_BROWSER_PROVIDER: provider })).toMatchObject({ provider, environment: "staging", mode: "server_job", available: true, health: "not_checked", nextAction: { kind: "request_verification" } });
  expect(productV4ExecutionCapability(staging).provider).toBe("cloudflare");
  expect(productV4ExecutionCapability(staging)).not.toHaveProperty("command");
});
test("unsupported local staging and mixed targets fail before an attempt can be created", () => {
  const local = { ...staging, AUTHORING_VERIFICATION_BROWSER_PROVIDER: "local_playwright" };
  expect(productV4ExecutionCapability(local)).toMatchObject({ mode: "local_operator", available: false, supportedEnvironments: ["production"], nextAction: { kind: "inspect_runtime" } });
  expect(() => assertProductV4ExecutionTarget(local)).toThrow("EXECUTOR_UNAVAILABLE");
  for (const changed of [{ ZYX_ENVIRONMENT: "production" }, { BETTER_AUTH_URL: "https://www.zyxacademy.com" }, { NEXT_PUBLIC_APP_URL: "https://other.test" }]) expect(() => assertProductV4ExecutionTarget({ ...staging, ...changed })).toThrow("EXECUTOR_UNAVAILABLE");
  const production = { ...local, ZYX_ENVIRONMENT: "production", ZYX_MCP_ENVIRONMENT: "production", NEXT_PUBLIC_APP_URL: "https://www.zyxacademy.com", BETTER_AUTH_URL: "https://www.zyxacademy.com" };
  expect(assertProductV4ExecutionTarget(production)).toMatchObject({ mode: "local_operator", available: true, nextAction: { kind: "run_local_operator" } });
});
