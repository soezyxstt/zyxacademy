import { expect, test, type Page, type TestInfo } from "@playwright/test";

const pages = [
  { name: "home", path: "/", variant: "responsive" },
  { name: "links", path: "/tautan", variant: "symbol" },
  {
    name: "mcp",
    path: "/mcp/authorize?client_id=brand-qa-invalid&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&response_type=code&code_challenge=brand-qa&code_challenge_method=S256",
    variant: "horizontal",
  },
] as const;

const schemes = ["light", "dark"] as const;

function watchFailures(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`http: ${response.status()} ${response.url()}`);
  });
  return failures;
}

async function prepare(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      nextjs-portal { display: none !important; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => document.fonts.ready);
}

async function capture(page: Page, info: TestInfo, name: string, fullPage = true) {
  const overflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll, `Horizontal overflow: ${overflow.scroll}px in ${overflow.client}px`).toBeLessThanOrEqual(
    overflow.client,
  );

  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, animations: "disabled", caret: "hide", fullPage });
  await info.attach(name, { contentType: "image/png", path });
}

for (const pageCase of pages) {
  for (const scheme of schemes) {
    test(`${pageCase.name} brand assets in ${scheme} mode`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const failures = watchFailures(page);
      await page.route(
        "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css",
        (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }),
      );
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      const response = await page.goto(pageCase.path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${pageCase.path} must return below HTTP 400`).toBeLessThan(400);
      expect(new URL(page.url()).pathname).toBe(pageCase.path.split("?")[0]);
      await prepare(page);
      if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
      else await expect(page.locator("html")).not.toHaveClass(/dark/);

      const logo = page.locator('img[alt="Zyx Academy"]:visible').first();
      await expect(logo).toBeVisible();
      const expectedVariant = pageCase.variant === "responsive"
        ? info.project.name === "mobile-380" ? "symbol" : "horizontal"
        : pageCase.variant;
      const source = await logo.getAttribute("src");
      expect(source).toContain(`/brand/zyx-logo-${expectedVariant}-${scheme === "dark" ? "reversed" : "color"}.svg`);
      await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

      if (pageCase.name === "home") {
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.locator('nav[aria-label="Primary"]')).toBeInViewport();
        await expect(page.locator('#landing-hero-heading')).toBeInViewport();
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      }
      await capture(page, info, `${info.project.name}-${pageCase.name}-${scheme}`, pageCase.name !== "home");
      if (pageCase.name === "home") {
        await expect(
          page.locator('header nav[aria-label="Primary"] > div > a[href="/"] img[alt="Zyx Academy"]:visible'),
        ).toHaveCount(1);
        const footer = page.getByRole("contentinfo");
        const footerLogoLink = footer.getByRole("link", { name: "Beranda Zyx Academy" });
        await expect(footerLogoLink.locator('img[alt="Zyx Academy"]:visible')).toHaveCount(1);
        const footerLogo = footerLogoLink.locator('img[alt="Zyx Academy"]:visible');
        await footer.scrollIntoViewIfNeeded();
        await expect.poll(() => footerLogo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        const footerPath = info.outputPath(`screenshots/${info.project.name}-footer-${scheme}.png`);
        await footer.screenshot({ path: footerPath, animations: "disabled", caret: "hide" });
        await info.attach(`${info.project.name}-footer-${scheme}`, { contentType: "image/png", path: footerPath });
      }
      expect(failures, "The page must have no HTTP 400+ responses, console errors, or runtime errors").toEqual([]);
    });
  }
}

for (const scheme of schemes) {
  test(`mobile navigation logo in ${scheme} mode`, async ({ page }, info) => {
    test.setTimeout(120_000);
    test.skip(info.project.name !== "mobile-380", "The navigation drawer is a mobile state");
    const failures = watchFailures(page);
    await page.route(
      "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css",
      (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }),
    );
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await prepare(page);
    const openMenu = page.getByRole("button", { name: "Buka menu" });
    await openMenu.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const logo = dialog.locator('img[alt="Zyx Academy"]:visible').first();
    await expect(dialog.locator('img[alt="Zyx Academy"]:visible')).toHaveCount(1);
    await expect(logo).toBeVisible();
    expect(await logo.getAttribute("src")).toContain(
      `/brand/zyx-logo-horizontal-${scheme === "dark" ? "reversed" : "color"}.svg`,
    );
    await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await capture(page, info, `${info.project.name}-mobile-menu-${scheme}`, false);
    expect(failures, "The open navigation state must have no HTTP 400+ responses, console errors, or runtime errors").toEqual([]);
  });
}
