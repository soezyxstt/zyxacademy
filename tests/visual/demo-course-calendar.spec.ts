import { expect, test, type Page, type TestInfo } from "@playwright/test";

const courses = [
  { id: "fictional-berpikir", title: "Berpikir Komputasional" },
  { id: "fictional-fisika", title: "Fisika Dasar I" },
  { id: "fictional-kimia", title: "Kimia Dasar I" },
  { id: "fictional-matematika", title: "Matematika I" },
];
test.setTimeout(180000);
function guard(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) errors.push(`Unexpected request ${path}`); });
  return errors;
}
async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('#main-content [aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: !(await page.getByRole("dialog").count()), animations: "disabled" });
}
async function visit(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('#main-content [aria-busy="true"]')).toHaveCount(0);
}
async function navigation(page: Page, info: TestInfo) {
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
}
test("global schedule navigation stays global and routes another course's edits and files to its own store", async ({ page }, info) => {
  const errors = guard(page);
  await visit(page, `/id/demo?course=${courses[0].id}`);
  await navigation(page, info);
  await page.getByRole("link", { name: "Jadwal", exact: true }).first().click();
  await expect(page).toHaveURL(/\/id\/demo\/schedule$/, { timeout: 60000 });
  const sessions = page.locator("#main-content").getByRole("button").filter({ hasText: /Diskusi materi|Latihan dan pembahasan/ });
  await expect(sessions).toHaveCount(8);
  for (const course of courses) await expect(sessions.filter({ hasText: course.title })).toHaveCount(2);
  await capture(page, info, "global-calendar-four-courses");
  await navigation(page, info);
  await expect(page.getByRole("link", { name: "Profil", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ringkasan", exact: true })).toHaveCount(0);
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Tutup sidebar", exact: true }).click();
  await sessions.filter({ hasText: "Fisika Dasar I" }).filter({ hasText: "Diskusi materi" }).click();
  await page.locator("#session-note").fill("Catatan fisika dari kalender global");
  await page.getByRole("button", { name: "Simpan konteks", exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "fisika.pdf", mimeType: "application/pdf", buffer: Buffer.from("physics scoped bytes") });
  await expect(page.getByRole("link", { name: /fisika.pdf/ })).toBeVisible();
  await capture(page, info, "global-physics-session-saved");
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("zyx-demo-community:")));
  expect(saved).toHaveLength(1);
  expect(saved[0][0]).toContain(courses[1].id);
  await visit(page, `/id/demo/overview?course=${courses[1].id}`);
  await navigation(page, info);
  await page.getByRole("link", { name: "Jadwal", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/id/demo/schedule\\?course=${courses[1].id}$`));
  await expect(sessions).toHaveCount(2);
  await expect(sessions.filter({ hasText: "Fisika Dasar I" })).toHaveCount(2);
  await capture(page, info, "course-calendar-physics-only");
  await navigation(page, info);
  await expect(page.getByRole("link", { name: "Ringkasan", exact: true }).first()).toBeVisible();
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Tutup sidebar", exact: true }).click();
  await sessions.filter({ hasText: "Diskusi materi" }).click();
  await expect(page.locator("#session-note")).toHaveValue("Catatan fisika dari kalender global");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /fisika.pdf/ }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe("physics scoped bytes");
  await capture(page, info, "course-physics-session-persisted");
  await visit(page, "/id/demo/schedule");
  await expect(sessions).toHaveCount(8);
  await page.getByRole("button").filter({ hasText: /^15:00-16:30/ }).first().click();
  await expect(page.getByRole("dialog").getByText("Tim Newton", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button").filter({ hasText: "Fisika Dasar I" }).click();
  await page.locator("#booking-topic").fill("Fisika dari kalender global");
  await capture(page, info, "global-booking-physics-only");
  await page.getByRole("button", { name: "Konfirmasi pemesanan", exact: true }).click();
  await expect(page.locator("#session-topic")).toHaveValue("Fisika dari kalender global");
  await capture(page, info, "global-booking-saved");
  const booked = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("zyx-demo-community:")));
  expect(booked).toHaveLength(1);
  expect(booked[0][0]).toContain(courses[1].id);
  expect(booked[0][1]).toContain("Fisika dari kalender global");
  expect(errors).toEqual([]);
});
test("each course and assessment has a distinct stable leaderboard using the current shared layout", async ({ page }, info) => {
  const errors = guard(page);
  const rows: string[] = [];
  for (const course of courses) {
    await visit(page, `/id/demo/course-leaderboard?course=${course.id}`);
    await expect(page.locator("#main-content ol li")).toHaveCount(3);
    const ranking = await page.locator("#main-content ol").innerText(); rows.push(ranking);
    await capture(page, info, `ranking-${course.id}`);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#main-content ol")).toHaveText(ranking, { useInnerText: true });
  }
  expect(new Set(rows).size).toBe(4);
  await visit(page, `/id/demo/course-leaderboard?course=${courses[0].id}&type=simulation`);
  await expect(page.locator("#main-content ol li")).toHaveCount(3);
  expect(await page.locator("#main-content ol").innerText()).not.toBe(rows[0]);
  await capture(page, info, "ranking-tryout");
  await visit(page, "/id/demo/leaderboard");
  await expect(page.locator("#main-content tbody tr")).toHaveCount(16);
  await capture(page, info, "ranking-overview-four-courses");
  expect(errors).toEqual([]);
});
