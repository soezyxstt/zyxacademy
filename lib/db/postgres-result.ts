export function parsePostgresNumber(value: string): number {
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) throw new Error("Invalid PostgreSQL number");
  const number = Number(value);
  const [whole, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  const integer = BigInt(whole);
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(number) || integer > limit || (integer === limit && /[1-9]/.test(fraction))) {
    throw new Error("PostgreSQL number exceeds safe JavaScript range");
  }
  return number;
}
