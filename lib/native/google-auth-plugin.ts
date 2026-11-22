import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { parseCookies } from "better-auth/cookies";
import { consumeNativeGoogleChallenge, NATIVE_GOOGLE_CHALLENGE_COOKIE } from "./google-auth-challenge";

/** Applies the native nonce check to the standard endpoint too, so it cannot be bypassed. */
export function nativeGoogleSignInGuard() {
  return {
    id: "zyx-native-google",
    hooks: {
      before: [{
        matcher: (ctx) => ctx.path === "/sign-in/social" && ctx.body?.provider === "google" && Boolean(ctx.body?.idToken),
        handler: createAuthMiddleware(async (ctx) => {
          const origin = new URL(ctx.context.baseURL).origin;
          if (ctx.headers?.get("origin") !== origin) {
            throw new APIError("FORBIDDEN", { code: "INVALID_REQUEST", message: "Invalid sign-in origin." });
          }
          const proof = parseCookies(ctx.headers?.get("cookie") ?? "").get(NATIVE_GOOGLE_CHALLENGE_COOKIE);
          const nonce = proof ? await consumeNativeGoogleChallenge(proof, origin) : null;
          if (!nonce) {
            throw new APIError("UNAUTHORIZED", { code: "CHALLENGE_EXPIRED", message: "Start Google sign-in again." });
          }
          // Never trust a nonce supplied alongside the ID token by a caller.
          return { context: { body: { ...ctx.body, idToken: { ...ctx.body.idToken, nonce } } } };
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
}
