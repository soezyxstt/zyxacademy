import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_ROUTE = "/visual-fixtures/admin-ops-ai";

async function primeState(page: Page, state: string) {
  await page.addInitScript(({ s }) => {
    localStorage.setItem("zyx_ops_ai_panel_open_v2", s === "closed" ? "false" : "true");

    if (s === "min-width") {
      localStorage.setItem("zyx_ops_ai_panel_width_v2", "360");
    } else if (s === "wide-width") {
      localStorage.setItem("zyx_ops_ai_panel_width_v2", "640");
    } else {
      localStorage.setItem("zyx_ops_ai_panel_width_v2", "480");
    }

    if (s === "closed" || s === "empty" || s === "min-width" || s === "wide-width") {
      localStorage.removeItem("zyx_ops_ai_messages_v2");
    } else if (s === "worktrace") {
      localStorage.setItem(
        "zyx_ops_ai_messages_v2",
        JSON.stringify([
          {
            id: "msg-trace-1",
            role: "assistant",
            content: "Saya sedang memeriksa skema dan log operasional sistem.",
            createdAt: Date.now() - 5000,
            workSteps: [
              {
                stepId: "step-1",
                runId: "run-fixture",
                stepIndex: 0,
                stepType: "reasoning",
                status: "completed",
                title: "Analisis konteks permintaan admin",
                detail: "Membaca konteks rute aktif /admin dan parameter yang diberikan.",
                startedAt: Date.now() - 5000,
                finishedAt: Date.now() - 4800,
                durationMs: 200,
              },
              {
                stepId: "step-2",
                runId: "run-fixture",
                stepIndex: 1,
                stepType: "retrieval",
                status: "completed",
                title: "Pencarian pengetahuan admin: 'token aktivasi'",
                detail: "Ditemukan 3 potongan dokumen relevan pada namespace admin_ops_knowledge.",
                startedAt: Date.now() - 4800,
                finishedAt: Date.now() - 4200,
                durationMs: 600,
              },
              {
                stepId: "step-3",
                runId: "run-fixture",
                stepIndex: 2,
                stepType: "tool_call",
                status: "running",
                title: "Eksekusi tool read-only: inspect_schema",
                startedAt: Date.now() - 4200,
              },
            ],
          },
        ])
      );
    } else if (s === "citations") {
      localStorage.setItem(
        "zyx_ops_ai_messages_v2",
        JSON.stringify([
          {
            id: "msg-cite-1",
            role: "assistant",
            content:
              "Berdasarkan dokumentasi resmi Zyx Academy [1], format token aktivasi menggunakan pola `Zyx-XXXXXXXX-{capacity}-{courseIds.length}` [2]. Token ini memiliki masa berlaku default 30 hari.",
            createdAt: Date.now() - 10000,
            citations: [
              {
                id: "cite-1",
                sourceId: "docs/architecture.md",
                source: "semantic-rag",
                availability: "available",
                runId: "run-fixture",
                stepId: "step-1",
                title: "Arsitektur Sistem Token Aktivasi",
                filePath: "docs/ARCHITECTURE.md",
                section: "Token Generation & Verification",
                snippet: "Token aktivasi diterbitkan dengan prefix resmi Zyx dan kapasitas kelompok terikat.",
                timestamp: Date.now(),
              },
              {
                id: "cite-2",
                sourceId: "docs/agents.md",
                source: "semantic-rag",
                availability: "stale",
                runId: "run-fixture",
                stepId: "step-2",
                title: "Daftar Aturan Naming Zyx Academy",
                filePath: "AGENTS.md",
                section: "Naming and writing",
                snippet: "Format token prefixes use Zyx-XXXXXXXX-{capacity}-{courseIds.length}.",
                timestamp: Date.now(),
              },
            ],
          },
        ])
      );
    } else if (s === "proposal") {
      localStorage.setItem(
        "zyx_ops_ai_messages_v2",
        JSON.stringify([
          {
            id: "msg-prop-1",
            role: "assistant",
            content:
              "Saya telah menyiapkan proposal pembuatan token aktivasi untuk mata kuliah Matematika I dan Kalkulus dengan kapasitas 5 siswa. Silakan tinjau dan konfirmasi melalui kartu aksi di bawah.",
            createdAt: Date.now() - 20000,
            proposals: [
              {
                id: "prop-sample-token-123",
                runId: "run-fixture",
                stepId: "step-prop",
                type: "create_token",
                title: "Buat Token Aktivasi Kelompok (5 Kuota)",
                description: "Membuat token baru untuk mata kuliah Matematika I dan Kalkulus.",
                preview: {
                  summary: "Token pendaftaran kelompok 5 kuota dengan paket reguler_15.",
                  fields: [
                    { label: "Mata Kuliah", value: "matematika-1, kalkulus-1" },
                    { label: "Kapasitas", value: "5 orang" },
                    { label: "Paket", value: "reguler_15" },
                    { label: "Masa Berlaku", value: "30 hari" },
                  ],
                },
                status: "pending",
                createdAt: Date.now() - 60000,
                expiresAt: Date.now() + 1800000,
              },
            ],
          },
        ])
      );
    }
  }, { s: state });
}

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      nextjs-portal { display: none !important; }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await stabilize(page);
  const outDir = path.resolve(process.cwd(), "artifacts/visual-ops-ai");
  await mkdir(outDir, { recursive: true });
  const screenshotPath = path.join(outDir, `${name}.png`);

  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: "image/png",
  });

  // Verify horizontal overflow invariant
  const bounds = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(
    bounds.scroll,
    `Horizontal overflow detected: ${bounds.scroll}px in ${bounds.client}px viewport`
  ).toBeLessThanOrEqual(bounds.client);
}

function observeFailures(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !text.includes("get-session") &&
      !text.includes("CORS") &&
      !text.includes("ERR_FAILED")
    ) {
      errors.push(`console: ${text}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`page: ${error.message}`);
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      !response.url().includes("favicon") &&
      !response.url().includes("get-session")
    ) {
      errors.push(`http: ${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

test.describe("Admin Ops AI Panel - Visual Quality Benchmarks", () => {
  test("1. Closed State - Trigger Buttons and Layout Hierarchy", async ({ page }, testInfo) => {
    const errors = observeFailures(page);
    await primeState(page, "closed");
    const resp = await page.goto(`${BASE_ROUTE}?state=closed`, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);

    const trigger = page.locator('aside[aria-label="Akses Cepat Zyx Ops AI"]');
    await expect(trigger).toBeVisible();

    const panel = page.locator("#ops-ai-panel");
    await expect(panel).toHaveCount(0);

    await capture(page, testInfo, `${testInfo.project.name}-closed`);
    expect(errors).toEqual([]);
  });

  test("2. Open Empty State - Default Suggestions & Scaffolding", async ({ page }, testInfo) => {
    const errors = observeFailures(page);
    await primeState(page, "empty");
    const resp = await page.goto(`${BASE_ROUTE}?state=empty`, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);

    const panel = page.locator("#ops-ai-panel");
    await expect(panel).toBeVisible();

    // Verify Sticky Header & Composer
    await expect(panel.locator("header")).toBeVisible();
    await expect(panel.locator("footer")).toBeVisible();
    await expect(panel.locator("textarea")).toBeVisible();

    // Verify Conversation Area as scroll container
    const conversationRegion = panel.locator('div[role="region"][aria-label="Riwayat percakapan"]');
    await expect(conversationRegion).toBeVisible();

    await capture(page, testInfo, `${testInfo.project.name}-open-empty`);
    expect(errors).toEqual([]);
  });

  test("3. Work Trace Audit View - Multi-Step Lifecycle States", async ({ page }, testInfo) => {
    const errors = observeFailures(page);
    await primeState(page, "worktrace");
    const resp = await page.goto(`${BASE_ROUTE}?state=worktrace`, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);

    const panel = page.locator("#ops-ai-panel");
    await expect(panel).toBeVisible();

    // Verify Work Trace Audit card
    const workTraceHeader = panel.locator('button[aria-label="Buka atau tutup jejak kerja audit"]');
    await expect(workTraceHeader).toBeVisible();

    await capture(page, testInfo, `${testInfo.project.name}-worktrace`);
    expect(errors).toEqual([]);
  });

  test("4. Official Citations View - Verified Knowledge Grounding", async ({ page }, testInfo) => {
    const errors = observeFailures(page);
    await primeState(page, "citations");
    const resp = await page.goto(`${BASE_ROUTE}?state=citations`, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);

    const panel = page.locator("#ops-ai-panel");
    await expect(panel).toBeVisible();

    // Verify Official Citation label
    const citationTrigger = panel.locator('button[aria-label*="daftar sumber referensi"]');
    await expect(citationTrigger).toBeVisible();

    // Click to expand citations
    await citationTrigger.click();
    await page.waitForTimeout(100);

    await capture(page, testInfo, `${testInfo.project.name}-citations-expanded`);
    expect(errors).toEqual([]);
  });

  test("5. Action Proposal Card - Pending & Confirmation Interaction", async ({ page }, testInfo) => {
    const errors = observeFailures(page);
    await primeState(page, "proposal");
    const resp = await page.goto(`${BASE_ROUTE}?state=proposal`, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);

    const panel = page.locator("#ops-ai-panel");
    await expect(panel).toBeVisible();

    // Verify Proposal card & confirm button
    const confirmButton = panel.locator('button[aria-label="Konfirmasi dan eksekusi aksi"]');
    await expect(confirmButton).toBeVisible();

    await capture(page, testInfo, `${testInfo.project.name}-action-proposal`);
    expect(errors).toEqual([]);
  });

  test("6. Resized Panel State (Min 360px & Wide 640px on Desktop)", async ({ page }, testInfo) => {
    if (testInfo.project.name.includes("mobile")) {
      test.skip();
    }

    const errors = observeFailures(page);
    await primeState(page, "min-width");
    const resp = await page.goto(`${BASE_ROUTE}?state=min-width`, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);

    const panel = page.locator("#ops-ai-panel");
    await expect(panel).toBeVisible();

    const box = await panel.boundingBox();
    expect(box?.width).toBeCloseTo(360, -1);

    await capture(page, testInfo, `${testInfo.project.name}-min-width-360`);

    // Now test wide width
    await primeState(page, "wide-width");
    await page.goto(`${BASE_ROUTE}?state=wide-width`, { waitUntil: "domcontentloaded" });
    const wideBox = await panel.boundingBox();
    expect(wideBox?.width).toBeCloseTo(640, -1);

    await capture(page, testInfo, `${testInfo.project.name}-wide-width-640`);
    expect(errors).toEqual([]);
  });
});
