import { describe, expect, test } from "bun:test";
import { prefersExpoAndroidReturnPage } from "@/lib/native/expo-auth-config";

const android = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile Safari/604.1";
const headers = (agent: string, accept: string) => new Headers({ "user-agent": agent, accept });

describe("Expo Android browser return negotiation", () => {
  test("delivers the return page to Android navigation requesting HTML", () => {
    expect(prefersExpoAndroidReturnPage(headers(android, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"))).toBe(true);
    expect(prefersExpoAndroidReturnPage(headers(android, "TEXT/HTML; Q=0.5"))).toBe(true);
  });

  test("keeps redirects for other clients and HTML refusals", () => {
    expect(prefersExpoAndroidReturnPage(headers(iphone, "text/html"))).toBe(false);
    expect(prefersExpoAndroidReturnPage(headers(android, "application/json, */*"))).toBe(false);
    expect(prefersExpoAndroidReturnPage(headers(android, "text/html; q=0, */*"))).toBe(false);
    expect(prefersExpoAndroidReturnPage(new Headers())).toBe(false);
  });
});
