import { expect, test } from "bun:test";

import { NATIVE_BROWSER_REDIRECT } from "../../apps/mobile-native/auth/browser-intent";
import { readAuthReturnTo } from "../../apps/mobile-native/auth/login-intent";
import { createNativeIntentRedirect } from "../../apps/mobile-native/routing/consent-intent";

test("the host router preserves both exact Academic aliases and their encoded parameters", async () => {
  const redirect = createNativeIntentRedirect(async () => {
    throw new Error("Academic links do not request consent entropy");
  });
  const path = "/admin/users?search=Adi%20%26%20Dewi&status=active";
  const query = new URLSearchParams({ path, role: "admin", evidence: "7", evidenceNonce: "a+&" });
  for (const name of ["academic", "internal/academic"]) {
    for (const input of [name, "/" + name, name + "/"]) {
      const route = await redirect({ path: `zyx-native-parity://${input}?${query}`, initial: input === name });
      expect(route).toBe(`/${name}?${query}`);
      expect(new URL(route, "https://fixture.invalid").searchParams.get("path")).toBe(path);
    }
  }
});

test("Expo's native intent entry delegates Academic aliases to the host router", async () => {
  const { redirectSystemPath } = await import("../../apps/mobile-native/app/+native-intent");
  const query = new URLSearchParams({ path: "/admin/users?search=Adi%20%26%20Dewi", role: "admin" });
  for (const alias of ["academic", "internal/academic"]) {
    expect(await redirectSystemPath({ path: `zyx-native-parity://${alias}?${query}`, initial: true }))
      .toBe(`/${alias}?${query}`);
  }
});

test("Academic aliases share dispatch with existing consent and auth across unrecognized paths", async () => {
  let allocated = 0;
  const redirect = createNativeIntentRedirect(async () => `academic-intent-test-${++allocated}`);
  for (const path of [
    "https://example.org/academic?path=%2Ftutor",
    "zyx-native-parity://academic-mirror?path=%2Ftutor",
    "zyx-native-parity://internal/other/../academic?path=%2Ftutor",
    "zyx-native-parity://academic?path=%E0%A4",
    "zyx-native-parity://internal/academic?path=/tutor#fragment",
  ]) {
    expect(await redirect({ path, initial: true })).toBe(path);
  }
  expect(await redirect({ path: NATIVE_BROWSER_REDIRECT, initial: false })).toBe("/auth/native-finish");
  const next = "/tutor/schedule?slot=a%26b";
  const signIn = await redirect({ path: `/sign-in?${new URLSearchParams({ next })}`, initial: true });
  expect(readAuthReturnTo(new URL(signIn, "https://fixture.invalid").searchParams.get("returnTo"))).toBe(next);
  expect(allocated).toBe(0);
  expect(await redirect({ path: "/mcp/authorize?client_id=fixture&state=a%2Bb", initial: true }))
    .toBe("/mcp/authorize?handoff=academic-intent-test-1");
});
