export function buildOrigin(value, environment = "staging") {
  const origin = URL.parse(value ?? "");
  const allowed = environment === "production"
    ? origin?.origin === "https://www.zyxacademy.com"
    : environment === "staging" && /^https:\/\/(staging\.zyxacademy\.com|zyx-academy-staging-edge\.[a-z0-9-]+\.workers\.dev)$/.test(origin?.origin ?? "");
  if (!origin || origin.protocol !== "https:" || origin.origin !== value || !allowed) {
    throw new Error("Cloud Run build origin does not match its deployment environment");
  }
  return origin;
}
