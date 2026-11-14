import { expect, test } from "bun:test";
import { errors } from "playwright";
import { contractChromiumPath, createContractPdfRenderer } from "../helpers/chromium";

test("PDF contracts prefer pinned browser and can use the CI system Chrome", () => {
  expect(contractChromiumPath("/pinned", "", path => path === "/pinned")).toBe("/pinned");
  expect(contractChromiumPath("/absent", "", path => path === "/usr/bin/google-chrome")).toBe("/usr/bin/google-chrome");
});
test("an explicitly configured browser must exist and is never silently replaced", () => {
  expect(contractChromiumPath("/pinned", "/configured", path => path === "/configured")).toBe("/configured");
  expect(() => contractChromiumPath("/pinned", "/configured", path => path === "/pinned")).toThrow("Configured contract Chromium executable does not exist");
  expect(() => contractChromiumPath("/absent", "", () => false)).toThrow("Chromium is required");
});

test("sequential renders reuse a browser but close each fresh page", async () => {
  let launches = 0, pages = 0, pageCloses = 0, browserCloses = 0;
  const stages: string[] = [];
  const pdf = Buffer.from("%PDF-test");
  const renderer = createContractPdfRenderer({ launch: async () => {
    launches++;
    return { close: async () => { browserCloses++; }, newPage: async () => {
      pages++;
      return { setContent: async () => {}, pdf: async () => pdf, close: async () => { pageCloses++; } };
    } };
  } });
  expect(await renderer.render("first", stage => stages.push(stage))).toEqual(new Uint8Array(pdf));
  expect(await renderer.render("second")).toEqual(new Uint8Array(pdf));
  expect([launches, pages, pageCloses, browserCloses]).toEqual([1, 2, 2, 0]);
  expect(stages).toEqual(["browser launch started (attempt 1)", "browser launch completed", "newPage started", "newPage completed", "setContent started", "setContent completed", "pdf started", "pdf completed", "page close started", "page close completed"]);
  await renderer.close();
  await renderer.close();
  expect(browserCloses).toBe(1);
});

test("stalled PDF rendering closes its browser and retries once with a fresh browser", async () => {
  let launches = 0, browserCloses = 0, pageCloses = 0;
  const pdf = Buffer.from("%PDF-test");
  const renderer = createContractPdfRenderer({ renderTimeoutMs: 5, launch: async () => {
    const attempt = ++launches;
    return { close: async () => { browserCloses++; }, newPage: async () => ({
      setContent: async () => {}, pdf: async () => attempt === 1 ? new Promise<Buffer>(() => {}) : pdf,
      close: async () => { pageCloses++; },
    }) };
  } });
  expect(await renderer.render("<p>Fixture</p>")).toEqual(new Uint8Array(pdf));
  expect([launches, browserCloses, pageCloses]).toEqual([2, 1, 1]);
  await renderer.close();
  expect(browserCloses).toBe(2);
});

test("a timed-out Chromium launch retries once and closes the successful browser", async () => {
  let launches = 0, closes = 0;
  const pdf = Buffer.from("%PDF-test");
  const renderer = createContractPdfRenderer({ launch: async () => {
    if (++launches === 1) throw new errors.TimeoutError("launch timed out");
    return { close: async () => { closes++; }, newPage: async () => ({ setContent: async () => {}, pdf: async () => pdf, close: async () => {} }) };
  } });
  expect(await renderer.render("<p>Fixture</p>")).toEqual(new Uint8Array(pdf));
  await renderer.close();
  expect([launches, closes]).toEqual([2, 1]);
});

test("two launch timeouts fail and other launch errors are never retried", async () => {
  let launches = 0;
  const timedOut = new errors.TimeoutError("launch timed out");
  const renderer = createContractPdfRenderer({ launch: async () => { launches++; throw timedOut; } });
  await expect(renderer.render("")).rejects.toBe(timedOut);
  expect(launches).toBe(2);
  launches = 0;
  const invalid = new Error("BROWSER_CONFIGURATION_INVALID");
  const invalidRenderer = createContractPdfRenderer({ launch: async () => { launches++; throw invalid; } });
  await expect(invalidRenderer.render("")).rejects.toBe(invalid);
  expect(launches).toBe(1);
});

test("two render stalls report the stage and other errors are not retried", async () => {
  let launches = 0, closes = 0;
  const renderer = createContractPdfRenderer({ renderTimeoutMs: 5, launch: async () => {
    launches++;
    return { close: async () => { closes++; }, newPage: async () => ({
      setContent: async () => {}, pdf: async () => new Promise<Buffer>(() => {}), close: async () => {},
    }) };
  } });
  await expect(renderer.render("")).rejects.toThrow("CONTRACT_PDF_RENDER_TIMEOUT:pdf");
  expect([launches, closes]).toEqual([2, 2]);
  const failed = new Error("PDF_CONTENT_INVALID");
  launches = 0; closes = 0;
  const failedRenderer = createContractPdfRenderer({ launch: async () => {
    launches++;
    return { close: async () => { closes++; }, newPage: async () => ({
      setContent: async () => {}, pdf: async () => { throw failed; }, close: async () => {},
    }) };
  } });
  await expect(failedRenderer.render("")).rejects.toBe(failed);
  expect([launches, closes]).toEqual([1, 1]);
});

test("a stalled page close fails within the cleanup bound and closes its browser", async () => {
  let closes = 0;
  const renderer = createContractPdfRenderer({ cleanupTimeoutMs: 5, launch: async () => ({
    close: async () => { closes++; }, newPage: async () => ({
      setContent: async () => {}, pdf: async () => Buffer.from("%PDF-test"), close: async () => new Promise<void>(() => {}),
    }),
  }) });
  await expect(renderer.render("")).rejects.toThrow("CONTRACT_PDF_PAGE_CLOSE_TIMEOUT");
  expect(closes).toBe(1);
});

test("a stalled browser close preserves the render error and prevents another launch", async () => {
  let launches = 0;
  const renderer = createContractPdfRenderer({ renderTimeoutMs: 5, cleanupTimeoutMs: 5, launch: async () => {
    launches++;
    return { close: async () => new Promise<void>(() => {}), newPage: async () => ({
      setContent: async () => {}, pdf: async () => new Promise<Buffer>(() => {}), close: async () => {},
    }) };
  } });
  try {
    await renderer.render("");
    throw new Error("expected render to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((cause: Error) => cause.message)).toEqual([
      "CONTRACT_PDF_RENDER_TIMEOUT:pdf", "CONTRACT_PDF_BROWSER_CLOSE_TIMEOUT",
    ]);
  }
  await expect(renderer.render("")).rejects.toThrow("CONTRACT_PDF_RENDERER_CLEANUP_FAILED");
  expect(launches).toBe(1);
});

test("suite cleanup surfaces a stalled browser close", async () => {
  const renderer = createContractPdfRenderer({ cleanupTimeoutMs: 5, launch: async () => ({
    close: async () => new Promise<void>(() => {}), newPage: async () => ({
      setContent: async () => {}, pdf: async () => Buffer.from("%PDF-test"), close: async () => {},
    }),
  }) });
  await renderer.render("");
  await expect(renderer.close()).rejects.toThrow("CONTRACT_PDF_BROWSER_CLOSE_TIMEOUT");
});

test("a late page creation after timeout does not start content rendering", async () => {
  let releasePage: ((page: { setContent: () => Promise<void>; pdf: () => Promise<Buffer>; close: () => Promise<void> }) => void) | undefined;
  let launches = 0, contentCalls = 0;
  const renderer = createContractPdfRenderer({ renderTimeoutMs: 5, launch: async () => {
    launches++;
    return { close: async () => {}, newPage: async () => new Promise(resolve => { releasePage = resolve; }) };
  } });
  const result = renderer.render("");
  await expect(result).rejects.toThrow("CONTRACT_PDF_RENDER_TIMEOUT:newPage");
  releasePage!({ setContent: async () => { contentCalls++; }, pdf: async () => Buffer.from("%PDF-test"), close: async () => {} });
  await Promise.resolve();
  expect([launches, contentCalls]).toEqual([2, 0]);
});
