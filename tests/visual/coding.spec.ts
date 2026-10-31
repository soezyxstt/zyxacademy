import { test, expect } from "@playwright/test";
const problem = { problemId: "sum-even", version: 1, courseId: "coding-course", language: "python", title: "Jumlah bilangan genap", prompt: "Baca n dan tampilkan jumlah bilangan genap dari 1 hingga n, termasuk n.", learningObjectives: ["Memahami batas perulangan"], starterCode: "n = int(input())\ntotal = 0\nfor angka in range(0, n, 2):\n    total += angka\nprint(total)", publicTests: [{ id: "public-6", stdin: "6", expectedStdout: "12\n" }], limits: { timeoutMs: 1000, maxOutputChars: 8000 } };

async function setup(page: import("@playwright/test").Page) {
  let revision = 0, ordinal = 0;
  const attempts: Array<Record<string, unknown>> = [];
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: { user: { id: "coding-student", name: "Mahasiswa", email: "coding@example.test", emailVerified: true }, session: { id: "coding-session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", (route) => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: ++revision } }));
  await page.route("**/api/quiz/templates**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/live/sessions**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/coding/problems?**", (route) => route.fulfill({ json: { problems: [problem] } }));
  await page.route("**/api/coding/problems/**", (route) => route.fulfill({ json: { problem } }));
  await page.route("**/api/coding/submissions**", async (route) => {
    if (route.request().method() === "GET") { const surface = new URL(route.request().url()).searchParams.get("surface"); return route.fulfill({ json: { attempts: attempts.filter((attempt) => !surface || JSON.stringify(attempt.surface) === surface) } }); }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    ordinal++;
    const code = route.request().postDataJSON().submission.code;
    const correct = ordinal > 1;
    const feedback = { problem: { problemId: problem.problemId, version: 1 }, authority: "trusted_server", verdict: correct ? "correct" : "partial", passed: correct ? 2 : 1, total: 2, publicCases: [{ testId: "public-6", passed: correct, execution: { status: "completed", stdout: correct ? "12\n" : "6\n", stderr: "", truncated: false } }] };
    attempts.unshift({ id: `attempt-${ordinal}`, ordinal, code, feedback, surface: route.request().postDataJSON().surface });
    return route.fulfill({ json: { attemptId: `attempt-${ordinal}`, ordinal, feedback } });
  });
  await page.route("**/api/zyra/chat", (route) => route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text-delta","textDelta":"Flowchart ini menggambarkan rencana solusi.\\n\\n:::flowchart title=\\"Jumlah genap\\"\\n\\"Mulai\\" --> \\"Baca n\\"\\n\\"Baca n\\" --> \\"Jumlahkan bilangan genap\\"\\n\\"Jumlahkan bilangan genap\\" --> \\"Tampilkan total\\"\\n:::"}\n\ndata: [DONE]\n\n' }));
}
async function capture(page: import("@playwright/test").Page, info: import("@playwright/test").TestInfo, state: string) {
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`screenshots/${state}.png`), fullPage: true, animations: "disabled" });
}

test("Playground runs Python, handles errors, Stop, timeout, empty output and reset", async ({ page }, info) => {
  test.setTimeout(180000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await setup(page);
  expect((await page.goto("/visual-fixtures/coding"))?.status()).toBe(200);
  const editor = page.getByRole("textbox", { name: "Kode Python", exact: true });
  await expect(editor).toBeVisible();
  await capture(page, info, "playground-idle");
  await page.getByLabel("Input program").fill("Ayu");
  await page.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(page.getByText("Menyiapkan Python...", { exact: true })).toBeVisible();
  await capture(page, info, "playground-loading");
  await expect(page.getByText("Eksekusi selesai", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("Halo, Ayu", { exact: false })).toBeVisible();
  await capture(page, info, "playground-success");
  await page.getByLabel("Input program").fill("Budi");
  await expect(page.getByText("Hasil ini berasal dari kode atau input sebelum perubahan terakhir.")).toBeVisible();
  await capture(page, info, "playground-input-changed");
  await editor.fill("print(1 / 0)");
  await page.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(page.getByText("Terjadi error saat menjalankan kode", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/ZeroDivisionError/)).toBeVisible();
  await capture(page, info, "playground-error");
  await editor.fill("for :");
  await page.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(page.getByText("Periksa penulisan kode", { exact: true })).toBeVisible({ timeout: 60000 });
  await capture(page, info, "playground-syntax");
  await editor.fill("while True: pass");
  await page.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(page.getByText("Menjalankan kode...", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByText("Eksekusi dihentikan", { exact: true })).toBeVisible();
  await capture(page, info, "playground-stopped");
  await page.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(page.getByText("Eksekusi melewati batas waktu", { exact: true })).toBeVisible({ timeout: 60000 });
  await capture(page, info, "playground-timeout");
  await editor.fill("value = 1");
  await page.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(page.getByText("Tidak ada output. Gunakan print() untuk menampilkan hasil.")).toBeVisible({ timeout: 60000 });
  await capture(page, info, "playground-no-output");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(editor).toContainText('nama = input("Nama: ")');
  expect(failures).toEqual([]);
});

test("article examples, repeated submissions, contextual flowchart, history and live closure", async ({ page }, info) => {
  test.setTimeout(120000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await setup(page);
  await page.goto("/visual-fixtures/coding?tab=article");
  await expect(page.getByRole("heading", { name: problem.title, exact: true })).toBeVisible();
  await capture(page, info, "article-ready");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Memeriksa...", exact: true })).toBeDisabled();
  await capture(page, info, "article-checking");
  await expect(page.getByText("Sebagian kasus uji belum lolos", { exact: true }).first()).toBeVisible();
  await capture(page, info, "article-partial");
  const editor = page.getByRole("textbox", { name: "Kode Python", exact: true }).last();
  await editor.fill("n = int(input())\nprint(sum(range(0, n + 1, 2)))");
  await expect(page.getByText("Pemeriksaan ini merujuk pada kode sebelum perubahan terakhir.")).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Semua kasus uji lolos", { exact: true }).first()).toBeVisible();
  await capture(page, info, "article-correct");
  await page.getByRole("button", { name: "Flowchart", exact: true }).click();
  await expect(page.getByText("Flowchart ini menggambarkan rencana solusi.")).toBeVisible();
  await expect(page.locator(".react-flow")).toBeVisible();
  await capture(page, info, "article-flowchart");
  await page.getByText("Riwayat percobaan", { exact: true }).click();
  await capture(page, info, "article-history");
  await page.getByRole("tab", { name: "Live Quiz", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
  await capture(page, info, "live-open");
  await page.getByRole("button", { name: "Tutup soal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tanya Zyra", exact: true })).toHaveCount(0);
  await capture(page, info, "live-closed");
  expect(failures).toEqual([]);
});


test("tutor can choose a Python problem without an unrelated quiz template", async ({ page }, info) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await setup(page);
  await page.goto("/visual-fixtures/coding?tab=host");
  const codingSelect = page.getByRole("combobox").last();
  await expect(codingSelect).toBeVisible();
  await capture(page, info, "host-setup");
  await codingSelect.click();
  await capture(page, info, "host-options");
  await page.getByRole("option", { name: "Jumlah bilangan genap, versi 1" }).click();
  await expect(page.getByRole("button", { name: "Mulai sesi langsung", exact: true })).toBeEnabled();
  await capture(page, info, "host-coding-selected");
  expect(failures).toEqual([]);
});

test("cross-device draft conflicts keep local code until an explicit replacement", async ({ page }, info) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("zyx-python:coding-student:coding-course:playground", JSON.stringify({ code: "print('my local edits')", stdin: "", revision: 1 })));
  await page.route("**/api/coding/drafts**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { draft: { code: "print('stored elsewhere')", stdin: "", revision: 2 } } });
    expect(route.request().postDataJSON().revision).toBe(2);
    return route.fulfill({ json: { revision: 3 } });
  });
  await page.goto("/visual-fixtures/coding");
  const editor = page.getByRole("textbox", { name: "Kode Python", exact: true });
  await expect(editor).toContainText("my local edits");
  await expect(page.getByText("Kode di browser berbeda dari kode tersimpan. Simpan kode ini untuk mengganti kode tersimpan.")).toBeVisible();
  await capture(page, info, "draft-conflict");
  await page.getByRole("button", { name: "Simpan kode ini", exact: true }).click();
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  await expect(editor).toContainText("my local edits");
  await capture(page, info, "draft-resolved");
  expect(failures).toEqual([]);
});

test("coding consultation renders the structured canvas channel and reuses its chat session", async ({ page }, info) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await setup(page);
  const messages: Record<string, unknown>[] = [];
  const canvas = { version: "zyra-learning-canvas-v1", type: "flowchart", title: "Rencana solusi", purpose: "Pecah masalah menjadi langkah kecil.", variables: [], controls: [], claimRefs: [], altText: "Alur penjumlahan dari n hingga 1 dengan percabangan dan perulangan.", direction: "down", nodes: [{ id: "start", label: "Mulai", kind: "start" }, { id: "input", label: "Baca n", kind: "input" }, { id: "process", label: "total = 0", kind: "process" }, { id: "decision", label: "n > 0?", kind: "decision" }, { id: "sum", label: "total = total + n", kind: "process" }, { id: "decrement", label: "n = n - 1", kind: "process" }, { id: "output", label: "Tampilkan total", kind: "output" }, { id: "end", label: "Selesai", kind: "end" }], edges: [{ source: "start", target: "input" }, { source: "input", target: "process" }, { source: "process", target: "decision" }, { source: "decision", target: "sum", label: "Ya" }, { source: "sum", target: "decrement" }, { source: "decrement", target: "decision" }, { source: "decision", target: "output", label: "Tidak" }, { source: "output", target: "end" }], fallback: { summary: "Baca input kemudian tampilkan hasil.", columns: [{ id: "step", label: "Langkah" }], rows: [["Baca input"], ["Tampilkan hasil"]] } };
  await page.route("**/api/zyra/chat", async (route) => {
    messages.push(route.request().postDataJSON());
    const events = [{ type: "data-session", sessionId: "coding-chat" }, { type: "text-delta", textDelta: "Flowchart ini menggambarkan rencana solusi." }, { type: "data-canvas", canvasSpec: canvas }];
    return route.fulfill({ contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n" });
  });
  await page.goto("/visual-fixtures/coding");
  await expect(page.getByRole("textbox", { name: "Kode Python", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Flowchart", exact: true }).click();
  await expect.poll(() => messages.length).toBe(1);
  await expect(page.getByRole("heading", { name: "Rencana solusi", exact: true })).toBeVisible();
  const graph = page.getByRole("group", { name: canvas.altText, exact: true });
  for (const kind of ["start", "end", "input", "output", "process", "decision"]) {
    await expect(graph.locator(`[data-flowchart-kind="${kind}"]`).first()).toBeVisible();
  }
  await expect(graph.getByText("Ya", { exact: true })).toBeVisible();
  await expect(graph.getByText("Tidak", { exact: true })).toBeVisible();
  await expect(graph.locator("[data-flowchart-kind=decision] polygon")).toHaveCount(1);
  await expect(graph.locator("[data-flowchart-kind=input] polygon")).toHaveCount(1);
  await expect(graph.locator("[data-flowchart-kind=start] ellipse")).toHaveCount(1);
  await expect(graph.locator("[data-flowchart-kind=process] rect")).toHaveCount(3);
  const expectFitted = async () => {
    await expect(graph).toHaveAttribute("aria-busy", "false");
    await expect.poll(async () => {
      const first = await graph.locator('[data-flowchart-kind="start"]').boundingBox();
      const last = await graph.locator('[data-flowchart-kind="end"]').boundingBox();
      const bounds = await graph.boundingBox();
      return first && last && bounds ? (last.y + last.height - first.y) / bounds.height : 0;
    }).toBeGreaterThan(0.8);
  };
  await expectFitted();
  const connections = await graph.evaluate(element => {
    const node = element.querySelector<HTMLElement>('.react-flow__node[data-id="decision"]')!;
    const position = new DOMMatrixReadOnly(node.style.transform);
    const points = (id: string) => [...element.querySelector(`path[id="${id}"]`)!.getAttribute("d")!.matchAll(/[ML]\s*([-\d.]+)\s+([-\d.]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
    return {
      yes: points("e-3")[0], no: points("e-6")[0], loop: points("e-5").at(-1),
      east: { x: position.m41 + node.offsetWidth, y: position.m42 + node.offsetHeight / 2 },
      south: { x: position.m41 + node.offsetWidth / 2, y: position.m42 + node.offsetHeight },
      north: { x: position.m41 + node.offsetWidth / 2, y: position.m42 },
    };
  });
  expect(connections.yes).toEqual(connections.east);
  expect(connections.no).toEqual(connections.south);
  expect(connections.loop).toEqual(connections.north);
  await capture(page, info, "typed-flowchart");
  await graph.screenshot({ path: info.outputPath("screenshots/flowchart-symbols.png"), animations: "disabled" });
  await page.getByLabel("Pertanyaan", { exact: true }).fill("Bagaimana langkah berikutnya?");
  await page.getByRole("button", { name: "Tanya Zyra", exact: true }).click();
  await expect.poll(() => messages.length).toBe(2);
  expect(messages[1].sessionId).toBe("coding-chat");
  expect((messages[1].codingContext as { execution: unknown }).execution).toBeNull();
  await expect(page.getByRole("heading", { name: "Rencana solusi", exact: true })).toBeVisible();
  await page.getByLabel("Input program").fill("5");
  await expect(page.getByText("Penjelasan ini merujuk pada percobaan sebelum perubahan terakhir.")).toBeVisible();
  await expectFitted();
  await capture(page, info, "typed-flowchart-stale");
  expect(failures).toEqual([]);
});


test("compact Zyra toolbar keeps the question input visible and highlights current execution errors", async ({ page }, info) => {
  test.setTimeout(120000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await setup(page);
  await page.addInitScript(() => {
    if (window.top !== window) return;
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
    localStorage.setItem("fcm_consent", "denied");
  });
  expect((await page.goto("/visual-fixtures/coding"))?.status()).toBe(200);
  await expect(page).toHaveURL(/\/visual-fixtures\/coding$/);
  const help = page.getByRole("region", { name: "Konsultasi Zyra" });
  const question = help.getByLabel("Pertanyaan", { exact: true });
  const explain = help.getByRole("button", { name: "Jelaskan error", exact: true });
  await expect(question).toBeVisible();
  await expect(explain).toHaveAttribute("data-variant", "ghost");
  const hint = help.getByRole("button", { name: "Petunjuk", exact: true });
  const hintText = hint.locator("span.hidden");
  if (info.project.name === "mobile-380") await expect(hintText).toBeHidden();
  else await expect(hintText).toBeVisible();
  await expect(help.getByRole("button", { name: "Tanya Zyra", exact: true })).toBeDisabled();
  await capture(page, info, "toolbar-idle");
  await question.fill("Mengapa hasil kode ini berbeda?");
  await expect(help.getByRole("button", { name: "Tanya Zyra", exact: true })).toBeEnabled();
  await capture(page, info, "question-typed");
  const editor = page.getByRole("textbox", { name: "Kode Python", exact: true });
  await editor.fill("print(1 / 0)");
  await page.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(page.getByText("Terjadi error saat menjalankan kode", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(explain).toHaveAttribute("data-variant", "destructive");
  await capture(page, info, "execution-error");
  await editor.fill("print(1)");
  await expect(explain).toHaveAttribute("data-variant", "ghost");
  await capture(page, info, "error-stale");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/zyra/chat", async (route) => {
    expect(route.request().postDataJSON().codingContext.intent).toBe("review");
    await pending;
    await route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text-delta","textDelta":"Periksa pembagi sebelum menjalankan kode."}\n\ndata: [DONE]\n\n' });
  });
  await question.press("Enter");
  await expect(hint).toBeDisabled();
  await expect(help.getByRole("status")).toBeVisible();
  await capture(page, info, "question-busy");
  release();
  await expect(help.getByText("Periksa pembagi sebelum menjalankan kode.")).toBeVisible();
  await expect(hint).toBeEnabled();
  await capture(page, info, "answer");
  expect(failures).toEqual([]);
});


test("compact Zyra controls remain available in Article and Live Quiz", async ({ page }, info) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await setup(page);
  await page.addInitScript(() => {
    if (window.top !== window) return;
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
    localStorage.setItem("fcm_consent", "denied");
  });
  for (const surface of ["article", "live"]) {
    expect((await page.goto(`/visual-fixtures/coding?tab=${surface}`))?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`tab=${surface}$`));
    const help = page.getByRole("region", { name: "Konsultasi Zyra" });
    await expect(help).toBeVisible();
    await expect(async () => {
      await help.scrollIntoViewIfNeeded();
      await expect(help.getByLabel("Pertanyaan", { exact: true })).toBeInViewport();
    }).toPass();
    await capture(page, info, `${surface}-idle`);
    await help.getByLabel("Pertanyaan", { exact: true }).focus();
    await capture(page, info, `${surface}-question-focused`);
  }
  if (info.project.name === "laptop-fhd-125") {
    await page.setViewportSize({ width: 640, height: 864 });
    await capture(page, info, "toolbar-breakpoint-640");
  }
  expect(failures).toEqual([]);
});

test("playground inserts generated code and preserves the editor on failure", async ({ page }, info) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await setup(page);
  let reply = "";
  await page.route("**/api/zyra/chat", (route) => {
    expect(route.request().postDataJSON().codingContext.intent).toBe("generate");
    return route.fulfill({ contentType: "text/event-stream", body: reply });
  });
  expect((await page.goto("/visual-fixtures/coding?terminal=1"))?.status()).toBe(200);
  await expect(page).toHaveURL(/\/visual-fixtures\/coding\?terminal=1$/);
  const editor = page.getByRole("textbox", { name: "Kode Python", exact: true });
  await page.getByRole("button", { name: "Masalah yang ingin diselesaikan" }).click();
  const help = page.locator("div").filter({ has: page.getByRole("textbox", { name: "Deskripsi masalah", exact: true }) }).filter({ has: page.getByRole("button", { name: "Buat kode", exact: true }) }).last();
  await page.getByRole("textbox", { name: "Deskripsi masalah", exact: true }).fill("Tampilkan angka satu");
  reply = `data: ${JSON.stringify({ type: "text-delta", textDelta: "Berikut programnya:\n```python\nprint(1)\n```" })}\n\ndata: [DONE]\n\n`;
  await help.getByRole("button", { name: "Buat kode" }).click();
  await expect(editor).toContainText("print(1)");
  await capture(page, info, "generation-complete");
  reply = `data: ${JSON.stringify({ type: "data-error", data: { message: "Zyra belum dapat merespons." } })}\n\ndata: [DONE]\n\n`;
  await help.getByRole("button", { name: "Buat kode" }).click();
  await expect(help.getByRole("alert")).toHaveText("Zyra belum dapat merespons.");
  await expect(editor).toContainText("print(1)");
  await capture(page, info, "generation-error");
  reply = `data: ${JSON.stringify({ type: "text-delta", textDelta: "Coba gunakan print." })}\n\ndata: [DONE]\n\n`;
  await help.getByRole("button", { name: "Buat kode" }).click();
  await expect(help.getByRole("alert")).toHaveText("Kode belum tersedia. Coba buat kode lagi.");
  await expect(editor).toContainText("print(1)");
  await capture(page, info, "generation-no-code");
  expect(failures).toEqual([]);
});
