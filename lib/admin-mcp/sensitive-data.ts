/** Legacy group labels can contain the activation credential. Keep it behind its explicit scope. */
export function redactActivationTokens(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/Zyx-[A-Za-z0-9]{8}-\d+-\d+/g, "Token aktivasi");
  if (value instanceof Date || value == null) return value;
  if (Array.isArray(value)) return value.map(redactActivationTokens);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactActivationTokens(item)]));
  return value;
}
