import { expect, test } from "bun:test";
import { errors } from "playwright";
import { contractChromiumPath, renderContractPdf } from "../helpers/chromium";

test("PDF contracts prefer pinned browser and can use the CI system Chrome", () => {
  expect(contractChromiumPath("/pinned", "", path => path === "/pinned")).toBe("/pinned");
  expect(contractChromiumPath("/absent", "", path => path === "/usr/bin/google-chrome")).toBe("/usr/bin/google-chrome");
});
test("an explicitly configured browser must exist and is never silently replaced", () => {
  expect(contractChromiumPath("/pinned", "/configured", path => path === "/configured")).toBe("/configured");
  expect(() => contractChromiumPath("/pinned", "/configured", path => path === "/pinned")).toThrow("Configured contract Chromium executable does not exist");
  expect(() => contractChromiumPath("/absent", "", () => false)).toThrow("Chromium is required");
});


test("stalled PDF rendering closes its browser and retries once with a fresh browser", async () => {
  let launches = 0, closes = 0;
  const pdf = Buffer.from("%PDF-test");
  const result = await renderContractPdf("<p>Fixture</p>", { renderTimeoutMs: 5, launch: async () => {
    const attempt = ++launches;
    return { close: async () => { closes++; }, newPage: async () => ({
      setContent: async () => {}, pdf: async () => attempt === 1 ? new Promise<Buffer>(() => {}) : pdf,
    }) };
  } });
  expect(result).toEqual(new Uint8Array(pdf));
  expect(launches).toBe(2);
  expect(closes).toBe(2);
});

test("a timed-out Chromium launch retries once and closes the successful browser", async () => {
  let launches = 0, closes = 0;
  const pdf = Buffer.from("%PDF-test");
  const result = await renderContractPdf("<p>Fixture</p>", { launch: async () => {
    if (++launches === 1) throw new errors.TimeoutError("launch timed out");
    return { close: async () => { closes++; }, newPage: async () => ({ setContent: async () => {}, pdf: async () => pdf }) };
  } });
  expect(result).toEqual(new Uint8Array(pdf));
  expect(launches).toBe(2);
  expect(closes).toBe(1);
});

test("two launch timeouts fail and other launch errors are never retried", async () => {
  let launches = 0;
  const timedOut = new errors.TimeoutError("launch timed out");
  await expect(renderContractPdf("", { launch: async () => { launches++; throw timedOut; } })).rejects.toBe(timedOut);
  expect(launches).toBe(2);
  launches = 0;
  const invalid = new Error("BROWSER_CONFIGURATION_INVALID");
  await expect(renderContractPdf("", { launch: async () => { launches++; throw invalid; } })).rejects.toBe(invalid);
  expect(launches).toBe(1);
});

test("PDF rendering fails after two stalls and propagates other errors without retry", async () => {
  let launches = 0, closes = 0;
  const launch = async () => {
    launches++;
    return { close: async () => { closes++; }, newPage: async () => ({
      setContent: async () => {}, pdf: async () => new Promise<Buffer>(() => {}),
    }) };
  };
  await expect(renderContractPdf("", { launch, renderTimeoutMs: 5 })).rejects.toThrow("CONTRACT_PDF_RENDER_TIMEOUT");
  expect(launches).toBe(2);
  expect(closes).toBe(2);
  const failed = new Error("PDF_CONTENT_INVALID");
  launches = 0; closes = 0;
  await expect(renderContractPdf("", { launch: async () => {
    launches++;
    return { close: async () => { closes++; }, newPage: async () => ({
      setContent: async () => {}, pdf: async () => { throw failed; },
    }) };
  } })).rejects.toBe(failed);
  expect(launches).toBe(1);
  expect(closes).toBe(1);
});
