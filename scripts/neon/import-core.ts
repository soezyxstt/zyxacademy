import { createHmac } from "node:crypto";

export type Conversion = "text" | "integer" | "real" | "boolean" | "timestamp-seconds" | "timestamp-milliseconds" | "timestamp-mixed" | "json" | "blob";
export type Value = string | number | boolean | null | Uint8Array;

// These tables contain login credentials or transient authentication material.
export const AUTH_TABLES = new Set(["account", "session", "verification", "user_push_tokens"]);
export const SECRET_COLUMN = /(?:token|secret|password|private|api[_-]?key|access[_-]?key|authorization|cookie)/i;

export function assertTarget(url: string, expectedHostname: string, expectedDatabase: string): void {
  const target = new URL(url);
  if (!expectedHostname || !expectedDatabase || target.protocol !== "postgresql:" ||
      target.hostname !== expectedHostname.toLowerCase() || !target.hostname.endsWith(".neon.tech") ||
      decodeURIComponent(target.pathname.slice(1)) !== expectedDatabase || target.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("TARGET_IDENTITY_MISMATCH");
  }
}

export function convert(value: unknown, type: Conversion): Value {
  if (value === null) return null;
  if (type === "text" && typeof value === "string") return value;
  if (type === "blob" && value instanceof Uint8Array) return value;
  if (type === "integer" && typeof value === "bigint") return value.toString();
  if (type === "integer" && typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (type === "real" && typeof value === "number" && Number.isFinite(value)) return value;
  if (type === "boolean" && (value === 0 || value === 1 || value === 0n || value === 1n)) return value === 1 || value === 1n;
  if (type === "timestamp-mixed") {
    const numeric = typeof value === "bigint" ? Number(value) : value;
    if (typeof numeric !== "number" || !Number.isSafeInteger(numeric)) throw new Error("AMBIGUOUS_TIMESTAMP");
    // shortcut: dates outside 2000 to 2100 require an explicit column-specific migration plan.
    const min = Date.UTC(2000, 0, 1), max = Date.UTC(2100, 0, 1);
    const seconds = numeric * 1000;
    if (seconds >= min && seconds < max) return new Date(seconds).toISOString();
    if (numeric >= min && numeric < max) return new Date(numeric).toISOString();
    throw new Error("AMBIGUOUS_TIMESTAMP");
  }
  if ((type === "timestamp-seconds" || type === "timestamp-milliseconds") && typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) value = Number(value);
  if ((type === "timestamp-seconds" || type === "timestamp-milliseconds") && typeof value === "number" && Number.isSafeInteger(value)) {
    const date = new Date(value * (type === "timestamp-seconds" ? 1000 : 1));
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  if (type === "json" && typeof value === "string") {
    // Passing original JSON text to Postgres preserves integer precision.
    JSON.parse(value);
    return value;
  }
  throw new Error(`UNSUPPORTED_VALUE:${type}`);
}

export function insertionOrder(tables: string[], dependencies: Array<[string, string]>): string[] {
  const remaining = new Set(tables);
  if (remaining.size !== tables.length) throw new Error("DUPLICATE_TABLE");
  for (const [child, parent] of dependencies) {
    if (!remaining.has(child) || !remaining.has(parent)) throw new Error("MISSING_DEPENDENCY");
  }
  const result: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((name) => !dependencies.some(([child, parent]) => child === name && remaining.has(parent))).sort();
    if (!ready.length) throw new Error("CYCLIC_DEPENDENCY_REQUIRES_MANUAL_PLAN");
    for (const name of ready) { remaining.delete(name); result.push(name); }
  }
  return result;
}

// A keyed multiset digest does not publish hashes of individual sensitive rows.
export function contentDigest(rows: string[], key: string): string {
  if (key.length < 32) throw new Error("MANIFEST_KEY_TOO_SHORT");
  const hashes = rows.map((row) => createHmac("sha256", key).update(row).digest("hex")).sort();
  return createHmac("sha256", key).update(JSON.stringify(hashes)).digest("hex");
}
