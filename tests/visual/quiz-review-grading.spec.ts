import { expect, test } from '@playwright/test';
import { stubVisualTelemetry } from './telemetry-stubs';
import { waitForVisualReadiness } from './visual-readiness';

test.setTimeout(90_000);

test('review status and mistake actions follow the recorded score', async ({ page }, testInfo) => {
 const failures: string[] = [];
 page.on('pageerror', error => failures.push(error.message));
 page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
 page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
 await stubVisualTelemetry(page);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 const response = await page.goto('/visual-fixtures/content-visuals?mode=review-grading');
 expect(response?.status()).toBe(200);
 expect(new URL(page.url()).pathname).toBe('/visual-fixtures/content-visuals');
 expect(new URL(page.url()).searchParams.get('mode')).toBe('review-grading');
 await waitForVisualReadiness(page);
 await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
 const diagnosis = page.getByRole('link', { name: 'Lihat diagnosis dan rencana belajar' });
 await expect(diagnosis).toHaveAttribute('href', '/courses/visual-content-course/quiz/visual-content-quiz/summary/visual-content-attempt');
 await expect(diagnosis).toHaveCSS('width', '36px');
 await diagnosis.focus();
 await expect(page.getByRole('tooltip', { name: 'Lihat diagnosis dan rencana belajar' })).toBeVisible();
 await diagnosis.blur();
 const questions = page.getByRole('article');
 const rows = [
  ['Pilihan tunggal dengan jawaban tambahan', 'Salah', true],
  ['Pilihan jamak dengan jawaban berulang', 'Salah', true],
  ['Pilihan tunggal benar', 'Benar', false],
  ['Pilihan tunggal salah', 'Salah', true],
 ] as const;
 for (const [prompt, status, feedback] of rows) {
  const row = questions.filter({ hasText: prompt });
  await expect(row).toHaveCount(1);
  await expect(row.getByText(status, { exact: true })).toBeVisible();
  await expect(row.locator('button')).toHaveCount(feedback ? 1 : 0);
 }
 await expect(page.getByText('25%', { exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({ path: testInfo.outputPath('screenshots/review-grading.png'), fullPage: true, animations: 'disabled' });
 expect(failures).toEqual([]);
});
