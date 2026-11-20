import { readFileSync } from "node:fs";

// Read the registration list without importing jobs or requiring runtime secrets.
export function readComputeFunctionCount(source) {
  const body = source.match(/export\s+const\s+computeFunctions\s*=\s*\[([^\]]*)\]\s*;/)?.[1];
  if (!body) throw new Error("COMPUTE_FUNCTION_REGISTRY_MISSING");
  const names = body.split(",").map(name => name.trim()).filter(Boolean);
  if (!names.length || names.some(name => !/^[A-Za-z_$][\w$]*$/.test(name)) || new Set(names).size !== names.length) {
    throw new Error("COMPUTE_FUNCTION_REGISTRY_INVALID");
  }
  return names.length;
}

export const expectedComputeFunctionCount = readComputeFunctionCount(
  readFileSync(new URL("../../jobs/compute.ts", import.meta.url), "utf8"),
);
