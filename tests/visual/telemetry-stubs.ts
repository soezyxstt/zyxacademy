import type { Page } from "@playwright/test";

/** Stubs only analytics scripts/events; product APIs and source assets stay real. */
export async function stubVisualTelemetry(page: Page) {
  await page.route("**/www.googletagmanager.com/gtag/js**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );

  await page.route("**/_vercel/**", (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.resourceType() === "script" || /\.(?:js|mjs)$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    }
    return route.fulfill({ status: 204, headers: { "cache-control": "no-store" } });
  });
}
