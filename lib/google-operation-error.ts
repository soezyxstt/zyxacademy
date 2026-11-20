export function googleOperationError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/Missing GOOGLE_|invalid_client|invalid_grant|unauthorized_client/i.test(message)) return "credentials";
  if (/SERVICE_DISABLED|accessNotConfigured/i.test(message)) return "apiDisabled";
  if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|PERMISSION_DENIED|forbidden/i.test(message)) return "permission";
  return "failed";
}

export function googleErrorKey(value: unknown) {
  switch (value) {
    case "credentials": return "credentials";
    case "apiDisabled": return "apiDisabled";
    case "permission": return "permission";
    default: return "failed";
  }
}
