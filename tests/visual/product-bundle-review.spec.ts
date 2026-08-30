import { expect, test, type Page, type TestInfo } from "@playwright/test";

const TARGET_ROUTE = "/admin/materials/review/product/visual-fixture";

const HEX64_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const HEX64_B = "b2c3d4e5f6a10718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const HEX64_C = "c3d4e5f6a1b20718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

const articleBlocks = [
  {
    id: "art-blk-1",
    blockType: "prior_knowledge_activation",
    orderIndex: 0,
    content: JSON.stringify({
      content: "### Aktivasi Pengetahuan: Deret Geometri\nSebelum mempelajari deret geometri tak hingga, ingat kembali definisi barisan geometri di mana perbandingan dua suku berurutan selalu konstan: $r = \\frac{u_n}{u_{n-1}}$.",
      learningPurpose: "Mengingatkan kembali konsep dasar barisan dan rasio konstan.",
      applicability: {
        status: "VALID",
        reason: "Materi prasyarat kalkulus tingkat sarjana.",
      },
      ideaIds: ["idea-geom-intro"],
      sourceRefs: [
        {
          sourceId: "purcell-calc-ch9",
          version: 1,
          checksum: HEX64_A,
          excerptIds: ["exc-ch9-01", "exc-ch9-02"],
        },
      ],
    }),
  },
  {
    id: "art-blk-2",
    blockType: "explanation",
    orderIndex: 1,
    content: JSON.stringify({
      content: "### Penjelasan Konsep Konvergensi\nSuatu deret geometri tak hingga $\\sum_{n=0}^{\\infty} a r^n$ dikatakan **konvergen** jika jumlah parsialnya menuju suatu nilai berhingga tertentu ketika $n \\to \\infty$. Syarat mutlak konvergensi adalah $|r| < 1$.\n\n$$S_\\infty = \\lim_{n \\to \\infty} S_n = \\frac{a}{1 - r}$$",
      learningPurpose: "Memahami batas limit jumlah parsial deret geometri tak hingga.",
      applicability: {
        status: "VALID",
        reason: "Inti capaian pembelajaran Bab 9 Purcell.",
      },
      ideaIds: ["idea-geom-convergence"],
      sourceRefs: [
        {
          sourceId: "purcell-calc-ch9",
          version: 1,
          checksum: HEX64_A,
          excerptIds: ["exc-ch9-03"],
        },
      ],
    }),
  },
  {
    id: "art-blk-3",
    blockType: "mathematical_representation",
    orderIndex: 2,
    content: JSON.stringify({
      content: "### Representasi Matematis & Domain\nHubungan matematis rasio terhadap sifat konvergensi dapat diklasifikasikan:\n\n1. $|r| < 1 \\implies$ Deret konvergen mutlak ke $S_\\infty = \\frac{a}{1-r}$.\n2. $|r| \\ge 1 \\implies$ Deret divergen (tidak memiliki limit berhingga).\n3. $r = 1 \\implies S_n = na \\to \\pm\\infty$.\n4. $r = -1 \\implies$ Jumlah parsial berosilasi.",
      learningPurpose: "Memetakan representasi analitik domain konvergensi deret.",
      applicability: {
        status: "NEEDS_UPDATE",
        reason: "Perlu penegasan kasus rasio bernilai negatif.",
      },
      ideaIds: ["idea-geom-domain"],
      sourceRefs: [
        {
          sourceId: "stewart-calc-ch11",
          version: 1,
          checksum: HEX64_B,
          excerptIds: ["exc-st11-01"],
        },
      ],
    }),
  },
  {
    id: "art-blk-4",
    blockType: "misconception",
    orderIndex: 3,
    content: JSON.stringify({
      content: "### Miskonsepsi Umum\nBanyak mahasiswa keliru menerapkan rumus $\\frac{a}{1-r}$ untuk deret dengan rasio $|r| \\ge 1$ (misalnya $r = 2$ menghasilkan $S = \\frac{1}{1-2} = -1$). Rumus ini **hanya berlaku** jika limit sisa suku ke-n menuju 0, yaitu saat $|r| < 1$.",
      learningPurpose: "Mencegah kesalahan penerapan rumus pada deret divergen.",
      applicability: {
        status: "VALID",
        reason: "Miskonsepsi kritis mahasiswa tahap awal.",
      },
      ideaIds: ["idea-geom-misconception"],
      sourceRefs: [
        {
          sourceId: "purcell-calc-ch9",
          version: 1,
          checksum: HEX64_A,
          excerptIds: ["exc-ch9-04"],
        },
      ],
    }),
  },
];

const diktatMarkdown = `# Diktat Ringkas: Konvergensi Deret Geometri

## 1. Definisi dan Formulasi
Deret geometri tak hingga didefinisikan sebagai:
$$S = \\sum_{n=0}^{\\infty} a r^n = a + ar + ar^2 + \\dots + ar^n + \\dots$$

Jumlah parsial deret hingga suku ke-$n$ adalah:
$$S_n = \\frac{a(1 - r^n)}{1 - r}, \\quad r \\neq 1$$

Ketika $|r| < 1$, limit suku sisa $\\lim_{n \\to \\infty} r^n = 0$, menghasilkan:
$$S_\\infty = \\frac{a}{1 - r}$$

## 2. Tabel Kondisi dan Simbol Matematika

| Simbol / Kondisi | Domain Nilai | Keterangan & Notasi Sintaks |
| :--- | :--- | :--- |
| Konvergen Mutlak | $|x| < 1$ | Jumlah deret berhingga dengan limit $S_\\infty$ |
| Pilihan Logika | $a \\| b$ | Operator alternatif rasio terdisjungsi |
| Filter Perintah | \`cat data \\| grep pattern\` | Inline pipe \`|\` dalam pemrosesan data |
| Divergen Ekstrem | $|x| \\ge 1$ | Deret divergen ke $\\pm\\infty$ atau berosilasi |

## 3. Contoh Ringkas
Tentukan jumlah dari deret:
$$3 + 1 + \\frac{1}{3} + \\frac{1}{9} + \\dots$$
Di sini $a = 3$ dan rasio $r = \\frac{1}{3}$. Karena $|r| = \\left|\\frac{1}{3}\\right| < 1$, maka:
$$S_\\infty = \\frac{3}{1 - \\frac{1}{3}} = \\frac{3}{\\frac{2}{3}} = \\frac{9}{2} = 4.5$$`;

const initialBlockReviews = [
  {
    id: "rev-art-blk-1",
    productId: "prod-art-1",
    blockId: "art-blk-1",
    status: "pending" as const,
    notes: null,
  },
  {
    id: "rev-art-blk-2",
    productId: "prod-art-1",
    blockId: "art-blk-2",
    status: "approved" as const,
    notes: "Penjelasan konsep sangat jelas dan terstruktur.",
    reviewedAt: "2026-08-30T09:00:00.000Z",
  },
  {
    id: "rev-art-blk-3",
    productId: "prod-art-1",
    blockId: "art-blk-3",
    status: "changes_requested" as const,
    notes: "Perlu ditambahkan catatan mengenai domain nilai rasio r.",
    reviewedAt: "2026-08-30T09:15:00.000Z",
  },
  {
    id: "rev-art-blk-4",
    productId: "prod-art-1",
    blockId: "art-blk-4",
    status: "pending" as const,
    notes: null,
  },
];

const mockDraftProducts = [
  {
    id: "prod-art-1",
    productType: "article" as const,
    courseId: "kalkulus-1",
    chapterId: "ch-09",
    version: 1,
    status: "draft" as const,
    slug: "deret-geometri-tak-hingga",
    title: "Deret Geometri Tak Hingga dan Konvergensi",
    blocks: articleBlocks,
    ideaLinks: [
      {
        id: "idea-geom-intro",
        version: 1,
        semanticHash: HEX64_A,
        weight: 0.5,
        role: "primary" as const,
      },
      {
        id: "idea-geom-convergence",
        version: 1,
        semanticHash: HEX64_B,
        weight: 0.5,
        role: "supporting" as const,
      },
    ],
    sourceRefs: [
      {
        sourceId: "purcell-calc-ch9",
        version: 1,
        checksum: HEX64_A,
        excerptIds: ["exc-ch9-01", "exc-ch9-02"],
      },
    ],
    schemaVersion: "product-bundle.v2",
    sourceHash: HEX64_A,
    generationHash: HEX64_B,
    creatorId: "user-author-1",
  },
  {
    id: "prod-dik-1",
    productType: "diktat" as const,
    courseId: "kalkulus-1",
    chapterId: "ch-09",
    version: 1,
    status: "draft" as const,
    title: "Diktat Ringkas: Konvergensi Deret Geometri",
    contentMarkdown: diktatMarkdown,
    sourceArticleId: "prod-art-1",
    sourceArticleVersion: 1,
    sourceArticleHash: HEX64_B,
    ideaLinks: [
      {
        id: "idea-geom-convergence",
        version: 1,
        semanticHash: HEX64_B,
        weight: 1.0,
        role: "primary" as const,
      },
    ],
    sourceRefs: [
      {
        sourceId: "purcell-calc-ch9",
        version: 1,
        checksum: HEX64_A,
        excerptIds: ["exc-ch9-01"],
      },
    ],
    schemaVersion: "product-bundle.v2",
    sourceHash: HEX64_A,
    generationHash: HEX64_C,
    creatorId: "user-author-1",
  },
];

const mockPreviews = [
  {
    id: "prod-art-1",
    productType: "article" as const,
    version: 1,
    status: "draft",
    title: "Deret Geometri Tak Hingga dan Konvergensi",
    traceability: {
      ideaIds: ["idea-geom-intro", "idea-geom-convergence"],
      sourceIds: ["purcell-calc-ch9"],
    },
    sections: [
      { label: "prior_knowledge_activation", content: "Aktivasi Pengetahuan: Deret Geometri" },
      { label: "explanation", content: "Penjelasan Konsep Konvergensi" },
      { label: "mathematical_representation", content: "Representasi Matematis & Domain" },
      { label: "misconception", content: "Miskonsepsi Umum" },
    ],
  },
  {
    id: "prod-dik-1",
    productType: "diktat" as const,
    version: 1,
    status: "draft",
    title: "Diktat Ringkas: Konvergensi Deret Geometri",
    traceability: {
      ideaIds: ["idea-geom-convergence"],
      sourceIds: ["purcell-calc-ch9"],
    },
    sections: [
      { label: "content", content: diktatMarkdown },
    ],
  },
];

const mockDependencies = [
  {
    id: "dep-art-idea-1",
    upstreamEntityType: "idea" as const,
    upstreamEntityId: "idea-geom-intro",
    upstreamVersion: 1,
    upstreamHash: HEX64_A,
    downstreamEntityType: "article" as const,
    downstreamEntityId: "prod-art-1",
    downstreamVersion: 1,
    downstreamHash: HEX64_B,
    freshness: "UP_TO_DATE" as const,
  },
  {
    id: "dep-dik-art-1",
    upstreamEntityType: "product" as const,
    upstreamEntityId: "prod-art-1",
    upstreamVersion: 1,
    upstreamHash: HEX64_B,
    downstreamEntityType: "diktat" as const,
    downstreamEntityId: "prod-dik-1",
    downstreamVersion: 1,
    downstreamHash: HEX64_C,
    freshness: "NEEDS_REVIEW" as const,
  },
];

async function prepareForScreenshot(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition: none !important;
      }
      nextjs-portal { display: none !important; }
    `,
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function captureNamedScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  await prepareForScreenshot(page);
  const screenshotPath = testInfo.outputPath(`screenshots/${name}.png`);
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    path: screenshotPath,
    scale: "css",
  });
  await testInfo.attach(name, {
    contentType: "image/png",
    path: screenshotPath,
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    overflow.scrollWidth,
    `Horizontal overflow detected: ${overflow.scrollWidth}px content in ${overflow.clientWidth}px viewport`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

test.describe("Product Bundle Review Visual Interaction Suite", () => {
  test("deterministic visual review fixture with stateful block reviews and dialog validations", async ({
    page,
  }, testInfo) => {
    const runtimeErrors: string[] = [];
    const pageErrors: string[] = [];
    const badResponses: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeErrors.push(`console error: ${message.text()}`);
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(`page error: ${error.message}`);
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        badResponses.push(
          `${response.request().method()} ${response.url()} -> HTTP ${response.status()}`,
        );
      }
    });

    let currentBlockReviews = JSON.parse(JSON.stringify(initialBlockReviews));

    function computeSummary(reviews: typeof initialBlockReviews) {
      const total = articleBlocks.length;
      const approved = reviews.filter((r) => r.status === "approved").length;
      const changesRequested = reviews.filter((r) => r.status === "changes_requested").length;
      const pending = Math.max(0, total - approved - changesRequested);
      return { total, pending, approved, changesRequested };
    }

    await page.route("**/api/admin/bundles/product/visual-fixture*", async (route) => {
      const payload = {
        bundle: {
          id: "visual-fixture",
          bundleId: "bundle-product-visual-fixture",
          courseId: "kalkulus-1",
          status: "draft",
          createdAt: "2026-08-30T08:00:00.000Z",
          currentReview: null,
          reviews: [],
        },
        previews: mockPreviews,
        draft: { products: mockDraftProducts },
        publicationBlocked: true,
        dependencies: mockDependencies,
        blockReviews: currentBlockReviews,
        blockReviewSummary: computeSummary(currentBlockReviews),
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });

    await page.route("**/api/admin/bundles/product/*/block-reviews", async (route) => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON() as {
          productId: string;
          blockId: string;
          status: "pending" | "approved" | "changes_requested";
          notes?: string;
        };

        const targetIndex = currentBlockReviews.findIndex(
          (r: (typeof initialBlockReviews)[number]) =>
            r.productId === body.productId && r.blockId === body.blockId,
        );

        const updatedReview = {
          id: `rev-${body.blockId}`,
          productId: body.productId,
          blockId: body.blockId,
          status: body.status,
          notes: body.notes ?? null,
          reviewedAt: new Date().toISOString(),
        };

        if (targetIndex >= 0) {
          currentBlockReviews[targetIndex] = updatedReview;
        } else {
          currentBlockReviews.push(updatedReview);
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: updatedReview }),
        });
        return;
      }

      await route.fallback();
    });

    await page.route("**/api/admin/bundles/product/*/review", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route("**/api/admin/bundles/product/*/publish", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route("**/api/admin/bundles/product/*/withdraw", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route("**/api/admin/bundles/product/*", async (route) => {
      const method = route.request().method();
      if (method === "DELETE" || method === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
        return;
      }
      await route.fallback();
    });

    const response = await page.goto(TARGET_ROUTE, {
      waitUntil: "domcontentloaded",
    });

    expect(response, "Page response must not be null").not.toBeNull();
    expect(response?.status(), "Initial page status must be successful (<400)").toBeLessThan(400);

    await expect(page.getByRole("heading", { name: "Review Product" })).toBeVisible();
    await expect(page.getByText("Deret Geometri Tak Hingga dan Konvergensi").first()).toBeVisible();

    // 1. Capture student article screenshot
    await expect(page.getByRole("button", { name: "Tampilan Siswa" })).toBeVisible();
    await captureNamedScreenshot(page, testInfo, "01-student-article");
    await assertNoHorizontalOverflow(page);

    // 2. Switch to Block Review mode and capture screenshot with pending, approved, and changes requested
    const blockModeButton = page.getByRole("button", { name: /Mode Blok/i });
    await expect(blockModeButton).toBeVisible();
    await blockModeButton.click();

    await expect(page.locator("button").filter({ hasText: "Aktivasi Pengetahuan Awal" }).first()).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Penjelasan Konsep" }).first()).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Representasi Matematis" }).first()).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Miskonsepsi Umum" }).first()).toBeVisible();

    await captureNamedScreenshot(page, testInfo, "02-block-review");
    await assertNoHorizontalOverflow(page);

    // 3. Open and capture mobile inspector Sheet when visible on mobile viewport
    const mobileInspectorButton = page.getByRole("button", { name: "Buka inspector" });
    if (await mobileInspectorButton.isVisible()) {
      await mobileInspectorButton.click();
      const inspectorSheet = page.getByRole("dialog");
      await expect(inspectorSheet).toBeVisible();
      await expect(page.getByRole("heading", { name: "Inspector blok materi" })).toBeVisible();

      await captureNamedScreenshot(page, testInfo, "03-mobile-inspector-sheet");

      await page.keyboard.press("Escape");
      await expect(inspectorSheet).toBeHidden();
    }

    // 4. Switch to Diktat tab and capture Diktat formula & table with special pipe characters
    const diktatTab = page.getByRole("tab", { name: /Diktat/i });
    await expect(diktatTab).toBeVisible();
    await diktatTab.click();

    await expect(page.getByText("Diktat PDF Ringkas")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tabel Kondisi dan Simbol Matematika/i })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    const convergenceRow = page.getByRole("row").filter({ hasText: "Konvergen Mutlak" });
    await expect(convergenceRow).toBeVisible();
    await expect(convergenceRow.locator(".katex").first()).toBeVisible();

    await captureNamedScreenshot(page, testInfo, "04-diktat-formula-table");
    await assertNoHorizontalOverflow(page);

    // 5. Open approval warning dialog (triggered because blocks have pending & changesRequested)
    const approveButton = page
      .locator("section.sticky")
      .getByRole("button", { name: "Setujui", exact: true });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    const approvalDialog = page.getByRole("dialog");
    await expect(approvalDialog).toBeVisible();
    await expect(page.getByRole("heading", { name: "Setujui dengan catatan blok" })).toBeVisible();
    await expect(page.getByText(/Terdapat 2 blok belum direview dan 1 blok meminta perbaikan/i)).toBeVisible();

    // Capture approval warning dialog stopping before mutation
    await captureNamedScreenshot(page, testInfo, "05-approval-warning-dialog");

    const cancelApprovalButton = approvalDialog.getByRole("button", { name: "Batal" });
    await cancelApprovalButton.click();
    await expect(approvalDialog).toBeHidden();

    // 6. Open discard confirmation dialog via More Actions menu
    const moreActionsButton = page
      .locator("section.sticky")
      .getByRole("button", { name: "Aksi lainnya" });
    await expect(moreActionsButton).toBeVisible();
    await moreActionsButton.click();

    const discardMenuItem = page.getByRole("menuitem", { name: "Hapus draft" });
    await expect(discardMenuItem).toBeVisible();
    await discardMenuItem.click();

    const discardDialog = page.getByRole("dialog");
    await expect(discardDialog).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hapus draft Product" })).toBeVisible();
    await expect(page.getByText(/Draft dan ZIP staging akan dihapus permanen/i)).toBeVisible();

    // Capture discard confirmation dialog stopping before mutation
    await captureNamedScreenshot(page, testInfo, "06-discard-confirmation-dialog");

    const cancelDiscardButton = discardDialog.getByRole("button", { name: "Batal" });
    await cancelDiscardButton.click();
    await expect(discardDialog).toBeHidden();

    // Direct assertions
    const finalUrl = new URL(page.url());
    expect(
      finalUrl.pathname,
      "The page must not redirect away to an unexpected route",
    ).toBe(TARGET_ROUTE);

    await assertNoHorizontalOverflow(page);

    expect(
      runtimeErrors,
      `The page must not emit console errors: ${runtimeErrors.join(", ")}`,
    ).toEqual([]);

    expect(
      pageErrors,
      `The page must not emit unhandled page errors: ${pageErrors.join(", ")}`,
    ).toEqual([]);

    expect(
      badResponses,
      `No HTTP requests should fail with status >= 400: ${badResponses.join(", ")}`,
    ).toEqual([]);
  });
});
