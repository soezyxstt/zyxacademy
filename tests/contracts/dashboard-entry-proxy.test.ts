import { NextRequest } from "next/server";
import { describe, expect, test } from "bun:test";
import { proxy } from "@/proxy";
import {
  DASHBOARD_ENTRY_COOKIE_NAME,
  ENTRY_REDIRECT_ROUTE,
} from "@/lib/auth/dashboard-entry";

describe("proxy first-visit role dashboard redirect", () => {
  test("rewrites first visit to / with an active session cookie to the entry redirect handler", () => {
    const request = new NextRequest("http://localhost/", {
      headers: { cookie: "better-auth.session_token=active-token" },
    });
    const response = proxy(request);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `http://localhost${ENTRY_REDIRECT_ROUTE}?returnTo=%2F`,
    );
  });

  test("rewrites localized marketing roots (/en, /id) when session is active and cooldown is absent", () => {
    const enReq = new NextRequest("https://www.zyxacademy.com/en", {
      headers: { cookie: "__Secure-better-auth.session_token=active-token" },
    });
    const enRes = proxy(enReq);
    expect(enRes.headers.get("x-middleware-rewrite")).toBe(
      `https://www.zyxacademy.com${ENTRY_REDIRECT_ROUTE}?returnTo=%2Fen`,
    );

    const idReq = new NextRequest("https://www.zyxacademy.com/id", {
      headers: { cookie: "__Secure-better-auth.session_token=active-token" },
    });
    const idRes = proxy(idReq);
    expect(idRes.headers.get("x-middleware-rewrite")).toBe(
      `https://www.zyxacademy.com${ENTRY_REDIRECT_ROUTE}?returnTo=%2Fid`,
    );
  });

  test("allows visiting the marketing root when the entry cooldown cookie is already set", () => {
    const request = new NextRequest("http://localhost/", {
      headers: {
        cookie: `better-auth.session_token=active-token; ${DASHBOARD_ENTRY_COOKIE_NAME}=1`,
      },
    });
    const response = proxy(request);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  test("does not redirect unauthenticated visitors, non-root marketing pages, or RSC/prefetch requests", () => {
    const anon = proxy(new NextRequest("http://localhost/"));
    expect(anon.headers.get("x-middleware-rewrite")).toBeNull();

    const plans = proxy(
      new NextRequest("http://localhost/plans", {
        headers: { cookie: "better-auth.session_token=active-token" },
      }),
    );
    expect(plans.headers.get("x-middleware-rewrite")).toBeNull();

    const rsc = proxy(
      new NextRequest("http://localhost/", {
        headers: {
          cookie: "better-auth.session_token=active-token",
          rsc: "1",
        },
      }),
    );
    expect(rsc.headers.get("x-middleware-rewrite")).toBeNull();

    const prefetch = proxy(
      new NextRequest("http://localhost/", {
        headers: {
          cookie: "better-auth.session_token=active-token",
          "next-router-prefetch": "1",
        },
      }),
    );
    expect(prefetch.headers.get("x-middleware-rewrite")).toBeNull();
  });

  test("sets the cooldown cookie when an authenticated user visits app dashboard areas", () => {
    for (const path of ["/dashboard", "/admin", "/tutor"]) {
      const response = proxy(
        new NextRequest(`http://localhost${path}`, {
          headers: { cookie: "better-auth.session_token=active-token" },
        }),
      );
      expect(response.cookies.get(DASHBOARD_ENTRY_COOKIE_NAME)?.value).toBe("1");
    }
  });

  test("bypasses marketing pages for native app User-Agent even when cooldown cookie is set", () => {
    const mobileAuthed = proxy(
      new NextRequest("https://www.zyxacademy.com/plans", {
        headers: {
          "user-agent": "Mozilla/5.0 ZyxMobileApp/0.1.0 (Capacitor; nightly; build=abc1234)",
          cookie: `better-auth.session_token=active-token; ${DASHBOARD_ENTRY_COOKIE_NAME}=1`,
        },
      }),
    );
    expect(mobileAuthed.headers.get("x-middleware-rewrite")).toBe(
      `https://www.zyxacademy.com${ENTRY_REDIRECT_ROUTE}?native=1`,
    );

    const mobileAnon = proxy(
      new NextRequest("https://www.zyxacademy.com/", {
        headers: {
          "user-agent": "Mozilla/5.0 ZyxMobileApp/0.1.0 (Capacitor; stable; build=abc1234)",
        },
      }),
    );
    expect(mobileAnon.headers.get("location")).toBe("https://www.zyxacademy.com/sign-in");

    const nativeSignIn = proxy(
      new NextRequest("https://www.zyxacademy.com/sign-in", {
        headers: {
          "user-agent": "Mozilla/5.0 ZyxMobileApp/0.1.0 (Capacitor; stable; build=abc1234)",
        },
      }),
    );
    expect(nativeSignIn.headers.get("location")).toBeNull();
    expect(nativeSignIn.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
