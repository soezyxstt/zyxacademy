import { test, expect } from '@playwright/test';

test('catalogue chapter title stays concise in normal and focus modes', async ({ page }, testInfo) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
 page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
 await page.route('**/api/student/articles/visual-article/progress', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
 const url='/visual-fixtures/structured-article?mode=student&catalogueTitle=1';
 const response=await page.goto(url);
 await page.waitForLoadState('networkidle');
 expect(response?.status()).toBe(200);
 expect(new URL(page.url()).pathname).toBe('/visual-fixtures/structured-article');
 await expect(page.getByRole('heading', {name:'Bab 2: Fungsi dan Limit', exact:true})).toBeVisible();
 await page.emulateMedia({ reducedMotion:'reduce' });
 for (const state of ['normal','focus']) {
  if (state==='focus') await page.getByRole('button', {name:'Masuk mode fokus',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Bab 2: Fungsi dan Limit', exact:true})).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const width=await page.evaluate(() => ({ scroll:document.documentElement.scrollWidth, client:document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await page.screenshot({path:testInfo.outputPath(`screenshots/title-${state}.png`),fullPage:true,animations:'disabled',caret:'initial'});
 }
 expect(errors).toEqual([]);
});
