import { NextRequest, NextResponse } from "next/server";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { resolveNativeRequestOrigin } from "@/lib/native/auth-handoff";
import {
  consumeNativeGoogleChallenge,
  issueNativeGoogleChallenge,
  NATIVE_GOOGLE_CHALLENGE_COOKIE,
  NATIVE_GOOGLE_CHALLENGE_TTL_SECONDS,
} from "@/lib/native/google-auth-challenge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const { origin, isHttps } = resolveNativeRequestOrigin(request);
  // The Zyx-origin WebView or isolated Expo HTTPS transport supplies the challenge proof.
  // Session cookies are accepted by Expo only after independent identity verification.
  if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return reply({ code: "INVALID_REQUEST" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) return reply({ code: "INVALID_REQUEST" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply({ code: "INVALID_REQUEST" }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return reply({ code: "INVALID_REQUEST" }, 400);
  }

  const proof = request.cookies.get(NATIVE_GOOGLE_CHALLENGE_COOKIE)?.value;
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isHttps,
    path: "/api/auth/native/google",
  };
  const expireChallenge = (response: NextResponse) => {
    response.cookies.set(NATIVE_GOOGLE_CHALLENGE_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  };

  if (body.action === "challenge") {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId?.endsWith(".apps.googleusercontent.com")) {
      return reply({ code: "GOOGLE_NOT_CONFIGURED" }, 503);
    }
    try {
      const challenge = await issueNativeGoogleChallenge(origin, proof);
      const response = reply({ clientId, nonce: challenge.nonce });
      response.cookies.set(NATIVE_GOOGLE_CHALLENGE_COOKIE, challenge.proof, {
        ...cookieOptions,
        maxAge: NATIVE_GOOGLE_CHALLENGE_TTL_SECONDS,
      });
      return response;
    } catch {
      return reply({ code: "SIGN_IN_UNAVAILABLE" }, 503);
    }
  }

  if (body.action !== "verify" && body.action !== "cancel") return reply({ code: "INVALID_REQUEST" }, 400);
  if (body.action === "verify" && (typeof body.idToken !== "string" || !body.idToken || body.idToken.length > 12_000)) {
    return reply({ code: "INVALID_REQUEST" }, 400);
  }

  try {
    if (body.action === "cancel") {
      if (proof) await consumeNativeGoogleChallenge(proof, origin);
      return expireChallenge(reply({ cancelled: true }));
    }

    // Better Auth verifies Google's signature, issuer, Web-client audience and this
    // server-issued nonce before creating a session. The guard consumes the proof
    // for Google ID-token sign-in, including the standard sign-in/social endpoint.
    const signedIn = await auth.api.signInSocial({
      body: { provider: "google", idToken: { token: body.idToken as string } },
      headers: request.headers,
      asResponse: true,
    });
    if (!signedIn.ok) {
      const failure: unknown = await signedIn.json().catch(() => null);
      const failureCode = failure && typeof failure === "object" && "code" in failure ? failure.code : null;
      const code = failureCode === "CHALLENGE_EXPIRED" || failureCode === "SESSION_LIMIT" || failureCode === "ACCOUNT_UNAVAILABLE"
        ? failureCode : "SIGN_IN_FAILED";
      return expireChallenge(reply({ code }, signedIn.status >= 500 ? 503 : 401));
    }
    const result: unknown = await signedIn.json();
    const userId = result && typeof result === "object" && "user" in result
      && result.user && typeof result.user === "object" && "id" in result.user
      && typeof result.user.id === "string" ? result.user.id : null;
    if (!userId) return expireChallenge(reply({ code: "SIGN_IN_FAILED" }, 502));

    const response = expireChallenge(reply({ userId }));
    for (const cookie of signedIn.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    // Better Auth's before hooks throw even with asResponse enabled.
    const code = isAPIError(error) ? error.body?.code : null;
    if (code === "CHALLENGE_EXPIRED" || code === "SESSION_LIMIT" || code === "ACCOUNT_UNAVAILABLE") {
      return expireChallenge(reply({ code }, code === "CHALLENGE_EXPIRED" ? 401 : 403));
    }
    return expireChallenge(reply({ code: "SIGN_IN_FAILED" }, 503));
  }
}
