import { expect, test } from "bun:test";
import { studentBrowserNotificationsAction, studentBrowserNotificationsUrl } from "../../apps/mobile-native/features/student/browser-handoff";

test("notification handoff uses the session HTTPS origin and respects the browser host and current session", async () => {
  const origin = "https://app.example.test";
  const path = "/settings/notifications/browser";
  const target = origin + path;
  expect(studentBrowserNotificationsUrl(origin + "/ignored?token=opaque#section")).toBe(target);
  for (const invalid of ["not an origin", "http://app.example.test", "https://secret@app.example.test", "app://app.example.test"]) {
    expect(studentBrowserNotificationsUrl(invalid)).toBeNull();
  }

  const calls: string[] = [];
  let current = true;
  let fail = false;
  const options = {
    origin,
    isCurrent: () => current,
    openDefault: async (url: string) => {
      calls.push(url);
      if (fail) throw new Error("Browser unavailable");
    },
    onError: () => calls.push("error"),
  };
  expect(studentBrowserNotificationsAction({ ...options, platform: "android" })).toBeUndefined();
  const defaultBrowser = studentBrowserNotificationsAction({ ...options, platform: "ios" })!;
  defaultBrowser();
  const androidHost = studentBrowserNotificationsAction({ ...options, platform: "android", openExternal: value => calls.push(value) })!;
  androidHost();
  const profileBrowser = studentBrowserNotificationsAction({
    ...options,
    platform: "ios",
    openProfile: () => calls.push("profile"),
    openExternal: () => calls.push("incorrect fallback"),
  })!;
  profileBrowser();
  expect(calls).toEqual([target, path, "profile"]);

  fail = true;
  defaultBrowser();
  await Promise.resolve();
  expect(calls).toEqual([target, path, "profile", target, "error"]);
  current = false;
  androidHost();
  defaultBrowser();
  expect(calls).toEqual([target, path, "profile", target, "error"]);
});
