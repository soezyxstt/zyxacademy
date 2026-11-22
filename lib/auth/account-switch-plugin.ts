import type { GenericEndpointContext } from "@better-auth/core";
import { createHash } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { parseCookies } from "better-auth/cookies";
import { MAX_SAVED_ACCOUNTS } from "./account-switch-contract";

type Options = { isAccountAvailable: (userId: string) => Promise<boolean> };

async function deviceSessions(ctx: GenericEndpointContext) {
  const config = ctx.context.authCookies.sessionToken;
  const cookies = parseCookies(ctx.headers?.get("cookie") ?? "");
  const names = [...cookies.keys()].filter((name) => name === config.name || name.startsWith(`${config.name}_multi-`));
  const tokens = await Promise.all(names.map((name) => ctx.getSignedCookie(name, ctx.context.secret)));
  const verified = [...new Set(tokens.filter((token): token is string => typeof token === "string"))];
  if (verified.length === 0) return [];
  return (await ctx.context.internalAdapter.findSessions(verified, { onlyActiveSessions: true }))
    .filter((item) => item && item.session.expiresAt.getTime() > Date.now());
}

function unavailable() {
  return new APIError("FORBIDDEN", { code: "ACCOUNT_UNAVAILABLE", message: "This account is unavailable." });
}

/** Keeps the stock multi-session endpoints bound to this device and Zyx's account status. */
export function accountSwitchPlugin(options: Options) {
  const availableDeviceSessions = async (ctx: GenericEndpointContext) => {
    const sessions = await deviceSessions(ctx);
    const available = new Map(await Promise.all([...new Set(sessions.map((item) => item.user.id))]
      .map(async (id) => [id, await options.isAccountAvailable(id)] as const)));
    return sessions.filter((item) => available.get(item.user.id));
  };
  const pruneSavedCookies = async (ctx: GenericEndpointContext, validTokens: Set<string>) => {
    const config = ctx.context.authCookies.sessionToken;
    for (const name of parseCookies(ctx.headers?.get("cookie") ?? "").keys()) {
      if (!name.startsWith(`${config.name}_multi-`)) continue;
      const token = await ctx.getSignedCookie(name, ctx.context.secret);
      if (!token || !validTokens.has(token)) ctx.setCookie(name, "", { ...config.attributes, maxAge: 0 });
    }
  };
  const assertAccount = async (userId: string, ctx?: GenericEndpointContext | null) => {
    if (!(await options.isAccountAvailable(userId))) throw unavailable();
    if (!ctx) return;
    const sessions = await availableDeviceSessions(ctx);
    const users = new Set(sessions.map((item) => item.user.id));
    if (!users.has(userId) && users.size >= MAX_SAVED_ACCOUNTS) {
      throw new APIError("FORBIDDEN", { code: "SESSION_LIMIT", message: "Remove a saved account before adding another." });
    }
  };
  return {
    id: "zyx-account-switch",
    init() {
      return { options: { databaseHooks: { session: { create: {
        async before(session, ctx) {
          await assertAccount(session.userId, ctx);
        },
      } } } } };
    },
    endpoints: {
      rememberCurrentAccount: createAuthEndpoint("/account-switch/remember", {
        method: "POST",
        requireHeaders: true,
      }, async (ctx) => {
        const current = await getSessionFromCtx(ctx, { disableCookieCache: true });
        if (!current) return ctx.json({ userId: null });
        // A suspended active identity must still be able to recover through
        // another saved account. Do not remember it or prevent listing others.
        if (!(await options.isAccountAvailable(current.user.id))) return ctx.json({ userId: null });
        const config = ctx.context.authCookies.sessionToken;
        const name = `${config.name}_multi-${current.session.token.toLowerCase()}`;
        if (!(await ctx.getSignedCookie(name, ctx.context.secret))) {
          await ctx.setSignedCookie(name, current.session.token, ctx.context.secret, config.attributes);
        }
        return ctx.json({ userId: current.user.id });
      }),
    },
    hooks: {
      before: [{
        matcher: (ctx) => ctx.path === "/one-time-token/verify",
        handler: createAuthMiddleware(async (ctx) => {
          const token = ctx.body?.token;
          if (typeof token !== "string" || token.length > 256) return;
          // Matches the existing oneTimeToken({ storeToken: "hashed" }) contract.
          // The stock verifier remains responsible for atomic single-use consumption.
          const hash = createHash("sha256").update(token).digest("base64url");
          const verification = await ctx.context.internalAdapter.findVerificationValue(`one-time-token:${hash}`);
          if (!verification || verification.expiresAt.getTime() <= Date.now()) {
            throw new APIError("UNAUTHORIZED", { code: "INVALID_SESSION_TOKEN", message: "This sign-in has expired." });
          }
          const target = await ctx.context.internalAdapter.findSession(verification.value);
          if (!target || target.session.expiresAt.getTime() <= Date.now()) {
            throw new APIError("UNAUTHORIZED", { code: "INVALID_SESSION_TOKEN", message: "This session has expired." });
          }
          await assertAccount(target.user.id, ctx);
        }),
      }, {
        matcher: (ctx) => ctx.path === "/multi-session/set-active" || ctx.path === "/multi-session/revoke",
        handler: createAuthMiddleware(async (ctx) => {
          const requested = ctx.body?.sessionToken;
          if (typeof requested !== "string") return;
          const config = ctx.context.authCookies.sessionToken;
          const token = await ctx.getSignedCookie(`${config.name}_multi-${requested.toLowerCase()}`, ctx.context.secret);
          // The stock endpoint rejects forged and expired device cookies.
          if (!token) return;
          const target = await ctx.context.internalAdapter.findSession(token);
          if (!target || target.session.expiresAt.getTime() <= Date.now()) return;
          if (ctx.path === "/multi-session/set-active" && !(await options.isAccountAvailable(target.user.id))) throw unavailable();
          if (ctx.path === "/multi-session/revoke") {
            const active = await ctx.getSignedCookie(config.name, ctx.context.secret);
            if (active === token) {
              throw new APIError("BAD_REQUEST", { code: "ACTIVE_ACCOUNT", message: "Switch accounts before removing the active account." });
            }
          }
        }),
      }],
      after: [{
        matcher: (ctx) => Boolean(ctx.context.newSession),
        handler: createAuthMiddleware(async (ctx) => {
          const next = ctx.context.newSession;
          if (!next) return;
          const config = ctx.context.authCookies.sessionToken;
          const active = await availableDeviceSessions(ctx);
          const validTokens = new Set(active.map((item) => item.session.token));
          await pruneSavedCookies(ctx, validTokens);
          // The stock plugin counts stale cookie names toward its limit. These
          // sessions already passed the live-session cap; retain the new account.
          await ctx.setSignedCookie(`${config.name}_multi-${next.session.token.toLowerCase()}`,
            next.session.token, ctx.context.secret, config.attributes);
        }),
      }, {
        matcher: (ctx) => ctx.path === "/multi-session/list-device-sessions",
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned;
          const response: unknown = returned instanceof Response
            ? (returned.ok ? await returned.clone().json() : null) : returned;
          if (!Array.isArray(response)) return;
          const available = await Promise.all(response.map(async (item: { user: { id: string } }) =>
            await options.isAccountAvailable(item.user.id)));
          const saved = response.filter((_item, index) => available[index]);
          await pruneSavedCookies(ctx, new Set(saved.map((item: { session: { token: string } }) => item.session.token)));
          return ctx.json(saved);
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
}
