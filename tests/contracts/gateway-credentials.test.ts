import { expect, test } from "bun:test";
import { isGatewayCredentialsRequiredBody, isGatewayCredentialsRequiredError } from "@/lib/ai/provider/gateway";

test("recognizes missing BYOK aliases without treating unrelated gateway failures as missing credentials", () => {
  const missing = { internalCode: 2040, message: "Provider 'openai' has no BYOK credential named 'openai_2'." };
  expect(isGatewayCredentialsRequiredBody(missing)).toBe(true);
  expect(isGatewayCredentialsRequiredBody({ error: [{ code: 2040, message: missing.message }] })).toBe(true);
  expect(isGatewayCredentialsRequiredError(Object.assign(new Error(JSON.stringify(missing)), { status: 400 }))).toBe(true);
  expect(isGatewayCredentialsRequiredError(Object.assign(new Error(missing.message), { status: 402 }))).toBe(false);
  expect(isGatewayCredentialsRequiredBody({ internalCode: 2040, message: "Invalid gateway configuration" })).toBe(false);
  expect(isGatewayCredentialsRequiredError(Object.assign(new Error("2040: Invalid gateway configuration"), { status: 400 }))).toBe(false);
});
