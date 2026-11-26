import "server-only";
export { assertNativeAdminTransaction, type NativeAdminViewer } from "@/lib/auth/native-admin-session";

export function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error && error.cause !== error ? postgresCode(error.cause) : undefined;
}
