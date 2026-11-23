export const MAX_SAVED_ACCOUNTS = 5;

export type AccountSwitchErrorCode =
  | "CANCELLED"
  | "BUSY"
  | "PENDING_CHANGES"
  | "OFFLINE"
  | "SESSION_EXPIRED"
  | "ACCOUNT_UNAVAILABLE"
  | "SESSION_LIMIT"
  | "ACTIVE_ACCOUNT"
  | "SWITCH_FAILED";

export class AccountSwitchError extends Error {
  constructor(public readonly code: AccountSwitchErrorCode) {
    super(code);
    this.name = "AccountSwitchError";
  }
}

export interface SavedAccount {
  user: { id: string; name: string; email: string; image: string | null };
  /** The token stays in memory and is sent only to the same-origin Better Auth endpoint. */
  session: { token: string; expiresAt: string };
}

export function accountSwitchError(error: unknown): AccountSwitchError {
  if (error instanceof AccountSwitchError) return error;
  const code = typeof error === "object" && error !== null && "code" in error
    ? error.code : undefined;
  if (code === "INVALID_SESSION_TOKEN" || code === "UNAUTHORIZED") return new AccountSwitchError("SESSION_EXPIRED");
  if (code === "ACCOUNT_UNAVAILABLE" || code === "SESSION_LIMIT" || code === "ACTIVE_ACCOUNT") {
    return new AccountSwitchError(code);
  }
  return new AccountSwitchError("SWITCH_FAILED");
}
