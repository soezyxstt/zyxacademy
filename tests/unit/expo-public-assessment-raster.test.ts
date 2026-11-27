import { expect, test } from "bun:test";
import { boundedAssessmentRaster, createAssessmentRasterQueue, fetchPublicAssessmentRaster, publicAssessmentRasterUrl } from "../../apps/mobile-native/device/assessment-raster";

const origin = "https://staging.zyxacademy.com";
const raster = "https://upload.wikimedia.org/plot.png?width=600";
const cdn = "https://images.unsplash.com/plot.jpg?auto=format&fit=crop&w=600";
const signal = new AbortController().signal;

test("accepts ordinary public HTTPS raster targets and refuses local/auth-bearing URLs", () => {
  expect(publicAssessmentRasterUrl(raster, origin)).toBe(raster);
  expect(publicAssessmentRasterUrl(cdn, origin)).toBe(cdn);
  expect(publicAssessmentRasterUrl(origin + "/images/plot.png", origin)).toBe(origin + "/images/plot.png");
  for (const url of [
    "/images/plot.png", "http://example.org/plot.png", "https://localhost/plot.png", "https://intranet/plot.png",
    "https://192.168.1.3/plot.png", "https://2130706433/plot.png", "https://[::1]/plot.png", "https://device.home.arpa/plot.png",
    "https://host.internal/plot.png", "https://username:password@example.org/plot.png", "https://public.example.org:5443/plot.png",
    raster + "&X-Amz-Signature=private", raster + "&foo=private", raster + "&width=900",
    raster + "#secret", origin + "/api/storage/file/materials/private.png",
  ]) expect(publicAssessmentRasterUrl(url, origin)).toBeNull();
});

test("rechecks each redirect and sends neither credentials nor a learner referrer", async () => {
  const visited: string[] = [];
  const result = await fetchPublicAssessmentRaster(raster, origin, async (url, init) => {
    visited.push(url);
    const headers = new Headers(init.headers);
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("origin")).toBe(false);
    expect(headers.has("referer")).toBe(false);
    return visited.length === 1 ? new Response(null, { status: 302, headers: { Location: cdn } }) : new Response("image");
  }, signal);
  expect(result.status).toBe(200);
  expect(visited).toEqual([raster, cdn]);

  let calls = 0;
  await expect(fetchPublicAssessmentRaster(raster, origin, async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/secret" } });
  }, signal)).rejects.toThrow();
  expect(calls).toBe(1);
  await expect(fetchPublicAssessmentRaster(raster, origin, async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { Location: "/plot.png" } });
  }, signal)).rejects.toThrow();
  expect(calls).toBe(4);
});

function png(width: number, height: number) {
  const result = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 0, 0, 0, 0, 0);
  const view = new DataView(result.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return result;
}

test("requires a real raster signature and bounded dimensions before local display", () => {
  expect(boundedAssessmentRaster(png(300, 300), "image/png")).toBe(true);
  expect(boundedAssessmentRaster(png(10001, 80), "image/png")).toBe(false);
  expect(boundedAssessmentRaster(png(4096, 4096), "image/png")).toBe(false);
  expect(boundedAssessmentRaster(png(0, 300), "image/png")).toBe(false);
  expect(boundedAssessmentRaster(new TextEncoder().encode("<svg><script /></svg>"), "image/png")).toBe(false);
  expect(boundedAssessmentRaster(png(300, 300), "image/svg+xml")).toBe(false);
  const gif = Uint8Array.of(71, 73, 70, 56, 57, 97, 16, 0, 16, 0);
  expect(boundedAssessmentRaster(gif, "image/gif")).toBe(true);
  const jpeg = Uint8Array.of(255, 216, 255, 192, 0, 8, 8, 0, 16, 0, 32, 1);
  expect(boundedAssessmentRaster(jpeg, "image/jpeg")).toBe(true);
});

test("bounds concurrent fetches and drops cancelled waiters before network dispatch", async () => {
  const queue = createAssessmentRasterQueue(1, 1);
  const first = await queue.acquire(signal);
  const cancel = new AbortController();
  const pending = queue.acquire(cancel.signal);
  await expect(queue.acquire(signal)).rejects.toThrow("limit");
  cancel.abort();
  await expect(pending).rejects.toThrow("cancelled");
  const next = queue.acquire(signal);
  first();
  (await next)();
  const fresh = await queue.acquire(signal);
  fresh();
});
