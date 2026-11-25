import { afterEach, describe, expect, it } from "bun:test";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";

const ORIGINAL_AUTH_URL = process.env.BETTER_AUTH_URL;
const ORIGINAL_PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (ORIGINAL_AUTH_URL === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = ORIGINAL_AUTH_URL;

  if (ORIGINAL_PUBLIC_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_PUBLIC_URL;
});

describe("isSameOriginAdminRequest", () => {
  it("allows direct same-origin local requests", () => {
    const req = new Request("http://localhost:3000/api/admin/ops-ai", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(isSameOriginAdminRequest(req)).toBe(true);
  });

  it("allows reverse-proxied Cloud Run requests where req.url is internal HTTP", () => {
    const req = new Request("http://0.0.0.0:8080/api/admin/ops-ai", {
      method: "POST",
      headers: {
        origin: "https://staging.zyxacademy.com",
        host: "staging.zyxacademy.com",
        "x-forwarded-proto": "https",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(isSameOriginAdminRequest(req)).toBe(true);
  });

  it("allows requests matching x-forwarded-host and comma-separated forwarded headers", () => {
    const req = new Request("http://127.0.0.1:8080/api/admin/ops-ai/execute", {
      method: "POST",
      headers: {
        origin: "https://zyxacademy.com",
        "x-forwarded-host": "zyxacademy.com, internal.proxy",
        "x-forwarded-proto": "https, http",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(isSameOriginAdminRequest(req)).toBe(true);
  });

  it("allows requests matching configured BETTER_AUTH_URL behind proxy", () => {
    process.env.BETTER_AUTH_URL = "https://zyxacademy.com";
    const req = new Request("http://0.0.0.0:8080/api/admin/ops-ai", {
      method: "POST",
      headers: {
        origin: "https://zyxacademy.com",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(isSameOriginAdminRequest(req)).toBe(true);
  });

  it("rejects cross-origin requests even behind a reverse proxy", () => {
    process.env.BETTER_AUTH_URL = "https://zyxacademy.com";
    const req = new Request("http://0.0.0.0:8080/api/admin/ops-ai", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "zyxacademy.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOriginAdminRequest(req)).toBe(false);
  });

  it("rejects cross-site and same-site Sec-Fetch-Site headers", () => {
    const crossSite = new Request("https://zyxacademy.com/api/admin/ops-ai", {
      method: "POST",
      headers: {
        origin: "https://zyxacademy.com",
        "sec-fetch-site": "cross-site",
      },
    });
    const sameSite = new Request("https://zyxacademy.com/api/admin/ops-ai", {
      method: "POST",
      headers: {
        origin: "https://zyxacademy.com",
        "sec-fetch-site": "same-site",
      },
    });
    expect(isSameOriginAdminRequest(crossSite)).toBe(false);
    expect(isSameOriginAdminRequest(sameSite)).toBe(false);
  });

  it("rejects malformed origin headers", () => {
    const req = new Request("https://zyxacademy.com/api/admin/ops-ai", {
      method: "POST",
      headers: {
        origin: "not-a-url",
      },
    });
    expect(isSameOriginAdminRequest(req)).toBe(false);
  });
});
