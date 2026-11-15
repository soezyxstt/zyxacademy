import { expect, test } from '@playwright/test';

// Requires an isolated local admin session and a seeded active course with a draft.
const course = process.env.VISUAL_GAMIFICATION_COURSE_ID;
for (const state of ['empty', 'populated', 'approval', 'error', 'reports', 'catalog'] as const) {
 test(`admin gamification ${state}`, async ({ page }, info) => {
  test.skip(!course && ['populated', 'approval', 'error'].includes(state), 'Set VISUAL_GAMIFICATION_COURSE_ID to a local seeded course with a draft');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !(state === 'error' && message.text().includes('net::ERR_INTERNET_DISCONNECTED'))) errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const query = state === 'empty' ? '?q=visual-no-such-course-987654' : state === 'reports' || state === 'catalog' ? `?tab=${state}` : `?course=${encodeURIComponent(course!)}`;
  const response = await page.goto(`/admin/gamification${query}`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/admin\/gamification/);
  if (state === 'empty') await expect(page.getByText('Mata kuliah tidak ditemukan')).toBeVisible();
  if (state === 'populated') await expect(page.getByText('Draf', { exact: false }).first()).toBeVisible();
  if (state === 'approval') { await page.getByRole('button', { name: 'Setujui' }).first().click(); await expect(page.getByRole('dialog')).toBeVisible(); }
  if (state === 'error') {
   await page.context().setOffline(true);
   await page.getByRole('button', { name: 'Buat atau perbarui draf' }).click();
   await expect(page.getByRole('alert')).toBeVisible();
   await page.context().setOffline(false);
  }
  await page.screenshot({ path: info.outputPath(`screenshots/admin-gamification-${state}.png`), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
 });
}
