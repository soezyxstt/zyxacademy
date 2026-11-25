import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { GET } from "../app/firebase-config.js/route";

const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
});

test("worker initializes with deployed public config and handles background push", async () => {
  for (const project of ["zyx-academy-staging", "zyx-academy"]) {
    Object.assign(process.env, {
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: project,
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456",
      NEXT_PUBLIC_FIREBASE_APP_ID: "web-app-id",
      FIREBASE_SERVICE_ACCOUNT_JSON: "private-sender-must-not-be-exported",
    });
    const response = GET();
    const configScript = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(configScript).not.toContain("private-sender-must-not-be-exported");
    let initialized: unknown;
    let background: (payload: unknown) => Promise<void>;
    const notifications: unknown[] = [];
    const context = {
      self: {
        __FIREBASE_CONFIG__: undefined,
        addEventListener() {},
        registration: { showNotification: async (...args: unknown[]) => { notifications.push(args); } },
      },
      importScripts(url: string) { if (url === "/firebase-config.js") runInNewContext(configScript, context); },
      firebase: {
        initializeApp(config: unknown) { initialized = config; },
        messaging: () => ({ onBackgroundMessage(handler: typeof background) { background = handler; } }),
      },
    };
    runInNewContext(readFileSync(new URL("../public/firebase-messaging-sw.js", import.meta.url), "utf8"), context);
    expect(initialized).toMatchObject({ projectId: project, appId: "web-app-id" });
    await background!({ notification: { title: "Staging push", body: "Delivery check" }, data: { url: "/calendar" } });
    expect(notifications).toMatchObject([["Staging push", { body: "Delivery check", data: { zyx: true, url: "/calendar" } }]]);
  }
});

test("missing deployed config fails closed", async () => {
  delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const response = GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("FIREBASE_SERVICE_ACCOUNT_JSON");
});
