import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { decodeExpoAuthCode } from "@/lib/native/expo-auth-code";
import { EXPO_STAGING_ORIGIN } from "@/lib/native/expo-auth-config";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function invalidGrant() {
  return Response.json({ error: "Invalid login code" }, { status: 400, headers });
}

export async function POST(request: Request) {
  if (new URL(resolveAuthBaseUrl()).origin !== EXPO_STAGING_ORIGIN) {
    return new Response(null, { status: 404, headers });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== EXPO_STAGING_ORIGIN) return new Response(null, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return new Response(null, { status: 415, headers });
  }
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return invalidGrant();
  const { secret } = await auth.$context;
  const token = await decodeExpoAuthCode(input.code, input.verifier, secret);
  if (!token) return invalidGrant();

  // Better Auth consumes the underlying single-use record, checks the session's
  // expiry and issues its signed cookie. Only send the active account cookie.
  let verified: Response;
  try {
    verified = await auth.api.verifyOneTimeToken({ body: { token }, asResponse: true });
  } catch (error) {
    if (isAPIError(error) && [400, 401, 403].includes(error.statusCode)) return invalidGrant();
    throw error;
  }
  if (!verified.ok) {
    return verified.status >= 500 ? new Response(null, { status: 503, headers }) : invalidGrant();
  }
  const { user } = await verified.json();
  const cookie = verified.headers.getSetCookie().find(value => value.startsWith("__Secure-better-auth.session_token="));
  if (!cookie || typeof user?.id !== "string" || !user.id) return invalidGrant();
  return Response.json({ user: { id: user.id } }, { headers: { ...headers, "Set-Cookie": cookie } });
}
