import { createHash } from "node:crypto";

export const PERAN_CODES = ["admin", "tutor", "murid"] as const;
export type PeranCode = (typeof PERAN_CODES)[number];

export const PERAN_IDS: Record<PeranCode, string> = {
 admin: "peran-admin",
 tutor: "peran-tutor",
 murid: "peran-murid",
};

export const PERAN_SEEDS: ReadonlyArray<{ id: string; code: PeranCode }> = PERAN_CODES.map((code) => ({
 id: PERAN_IDS[code],
 code,
}));

export type LegacyRole = "admin" | "teacher" | "student";

export function mapLegacyRole(value: unknown): PeranCode | null {
 if (value === "admin" || value === "teacher" || value === "student") {
  return value === "teacher" ? "tutor" : value === "student" ? "murid" : "admin";
 }
 return null;
}

export function isLegacyRole(value: unknown): value is LegacyRole {
 return mapLegacyRole(value) !== null;
}

export function peranIdFor(code: PeranCode): string {
 return PERAN_IDS[code];
}

export function membershipIdFor(penggunaId: string, code: PeranCode): string {
 const digest = createHash("sha256").update(`${penggunaId}\0${code}`, "utf8").digest("hex").slice(0, 40);
 return `pengguna-peran-${digest}`;
}

export function normalizePeranCodes(values: readonly string[]): PeranCode[] {
 return PERAN_CODES.filter((code) => values.includes(code));
}
