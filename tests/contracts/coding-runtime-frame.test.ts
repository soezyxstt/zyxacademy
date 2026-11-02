import { afterEach, describe, expect, it } from "bun:test";
import { GET } from "@/app/coding/runtime-frame/route";

const originalUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe("Python runtime frame CSP", () => {
  it("uses the configured public origin instead of a proxy's internal host", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.zyxacademy.com";
    const response = await GET(new Request("http://localhost:8080/coding/runtime-frame", { headers: { host: "staging.zyxacademy.com:8080" } }));
    expect(response.headers.get("document-isolation-policy")).toBe("isolate-and-require-corp");
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("connect-src https://staging.zyxacademy.com/api/coding/runtime/ https://staging.zyxacademy.com/coding/worker.js");
    expect(csp).not.toContain(":8080");
    expect(csp).toContain("worker-src data:");
  });

  it("uses the request origin locally when no public URL is configured", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "development";
    const response = await GET(new Request("http://localhost:3100/coding/runtime-frame"));
    expect(response.headers.get("content-security-policy")).toContain("connect-src http://localhost:3100/api/coding/runtime/");
  });

  it("fails closed when production has no public URL", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "production";
    await expect(GET(new Request("https://example.com/coding/runtime-frame"))).rejects.toThrow("NEXT_PUBLIC_APP_URL is required");
  });
});