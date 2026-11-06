import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(90_000);

const cases = {
  flags: {
    url: "**/api/admin/feature-flags",
    data: {
      checkedAt: "2026-10-25T00:00:00Z",
      posthogConfigured: false,
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
      coveragePercent: 0,
      flags: [],
    },
    ready: "Lapisan penyedia",
  },
  analytics: {
    url: "**/api/admin/ai-analytics",
    data: {
      totalRequests: 1,
      successfulRequests: 1,
      failedRequests: 0,
      gatewayRequests: 0,
      directRequests: 1,
      averageLatencyMs: 200,
      gatewaySuccessRate: 0,
      directSuccessRate: 100,
      recentLogs: [],
    },
    ready: "Direct API",
  },
  media: {
    url: "**/api/admin/media?folder=*",
    data: {
      path: "",
      folders: [{ name: "Dokumen kuliah", path: "dokumen" }],
      files: [],
      tree: [],
    },
    ready: "Dokumen kuliah",
  },
  storage: {
    url: "**/api/admin/media/storage?folder=*",
    data: {
      path: "",
      folders: [{ name: "Dokumen kuliah", path: "dokumen" }],
      files: [],
      tree: [],
    },
    ready: "Dokumen kuliah",
  },
  links: {
    url: "**/api/admin/links",
    data: {
      success: true,
      links: [
        {
          id: "visual",
          title: "Panduan kuliah",
          url: "https://example.com",
          description: null,
          icon: null,
          category: null,
          color: null,
          sortOrder: 0,
          isActive: true,
          createdById: null,
          createdAt: "2026-10-25T00:00:00Z",
          updatedAt: "2026-10-25T00:00:00Z",
        },
      ],
    },
    ready: "Panduan kuliah",
  },
  document: {
    url: "**/visual-document.txt",
    data: "Isi dokumen kuliah untuk pengujian.",
    ready: "Isi dokumen kuliah untuk pengujian.",
  },
  forms: {
    url: "**/api/admin/custom-forms",
    data: {
      success: true,
      forms: [
        {
          id: "visual",
          slug: "visual",
          title: "Pendaftaran tutorial",
          category: "registration",
          totalResponses: 2,
          createdAt: "2026-10-25T00:00:00Z",
        },
      ],
    },
    ready: "Pendaftaran tutorial",
  },
  "form-detail": {
    url: "**/api/admin/custom-forms/visual",
    data: {
      success: true,
      form: {
        id: "visual",
        slug: "visual",
        title: "Pendaftaran tutorial",
        category: "registration",
        questions: [],
        createdAt: "2026-10-25T00:00:00Z",
      },
      responses: [],
    },
    ready: "Pendaftaran tutorial",
  },
  "meet-detail": {
    url: "**/api/admin/meet/records/visual",
    data: {
      success: true,
      analytics: {
        startTime: "2026-10-25T08:00:00Z",
        endTime: "2026-10-25T09:00:00Z",
        totalDurationSeconds: 3600,
        peakConcurrentParticipants: 0,
        participantCount: 0,
        recordings: [],
        transcripts: [],
        participants: [],
      },
    },
    ready: "Peserta",
  },
  catalog: {
    url: "**/api/admin/products?*",
    data: {
      items: [
        {
          id: "visual-product",
          productType: "artikel",
          status: "published",
          title: "Materi kalkulus",
          courseId: "visual",
          courseTitle: "Matematika",
          createdAt: "2026-10-25T00:00:00Z",
        },
      ],
    },
    ready: "Materi kalkulus",
  },
  ops: {
    url: "**/api/admin/zyra/ops",
    data: {
      ledger: {
        committedProviderTurns: 2,
        activeReservations: 0,
        cacheSavedTurns: 1,
      },
      image: { failed: 0 },
      projectSlotCount: 1,
      traces: { validationViolations: 0 },
      capacity: { modelPools: [] },
      alerts: [],
    },
    ready: "Zyra operations",
  },
  usage: {
    url: "**/api/admin/ai-analytics/usage?*",
    data: { success: true, data: { users: [], daily: [] } },
    ready: "Tren Penggunaan Harian",
  },
} as const;

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

for (const [state, fixture] of Object.entries(cases)) {
  test(`${state} transitions from loading to data`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(fixture.url, async (route) => {
      await gate;
      await route.fulfill(
        typeof fixture.data === "string"
          ? { body: fixture.data, contentType: "text/plain" }
          : { json: fixture.data },
      );
    });
    if (state === "analytics")
      await page.route("**/api/admin/ai-analytics/usage?*", (route) =>
        route.fulfill({
          json: { success: true, data: { users: [], daily: [] } },
        }),
      );
    await page.route("**/api/admin/form-presets", (route) =>
      route.fulfill({ json: { success: true, presets: [] } }),
    );
    const request = page.waitForRequest(fixture.url);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(
      `/visual-fixtures/admin-loading-flows?state=${state}${state === "forms" ? "&tab=forms" : ""}`,
      { waitUntil: "domcontentloaded" },
    );
    await request;
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });
    await expect(page.getByRole("status").first()).toBeVisible();
    await capture(page, info, `${state}-loading`);
    release();
    await expect(
      page.getByText(fixture.ready, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    await capture(page, info, `${state}-ready`);
    expect(errors).toEqual([]);
  });
}

test("media list remains usable while refreshing", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const data = {
    path: "",
    folders: [{ name: "Dokumen kuliah", path: "dokumen" }],
    files: [],
    tree: [],
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/admin/media?folder=*", async (route) => {
    requests += 1;
    if (requests > 1) await gate;
    await route.fulfill({ json: data });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/visual-fixtures/admin-loading-flows?state=media", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("Dokumen kuliah").first()).toBeVisible();
  await page.getByRole("button", { name: "Tampilan daftar" }).click();
  const table = page.locator("table");
  await expect(table).toBeVisible();
  if (info.project.name === "mobile-380") {
    const scroller = table.locator("..");
    expect(
      await scroller.evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);
    await scroller.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    expect(await scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(
      0,
    );
    await scroller.evaluate((node) => {
      node.scrollLeft = 0;
    });
  }
  await capture(page, info, "media-list-ready");
  const request = page.waitForRequest("**/api/admin/media?folder=*");
  await page.getByRole("button", { name: "Muat ulang" }).click();
  await request;
  await expect(page.getByRole("status").first()).toBeVisible();
  await capture(page, info, "media-list-loading");
  release();
  await expect(table).toBeVisible();
  expect(errors).toEqual([]);
});
