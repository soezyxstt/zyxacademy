import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Compile identity-entry.tsx with the existing gamification harness first. No live data is used.
const fixture = process.env.STUDENT_IDENTITY_FIXTURE;
test.skip(!fixture, 'Set STUDENT_IDENTITY_FIXTURE to the compiled fixture index.html');
for (const view of ['leaderboard', 'group', 'search']) {
 for (const state of ['loading', 'ready', 'following', 'unavailable', 'follow-pending', 'follow-error']) {
  test(`${view} profile ${state}`, async ({ page }, info) => {
   const failures: string[] = [];
   page.on('pageerror', error => failures.push(error.message));
   page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
   page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
   await page.emulateMedia({ reducedMotion: 'reduce' });
   const url = new URL(pathToFileURL(resolve(fixture!)).href);
   url.searchParams.set('view', view);
   url.searchParams.set('identityState', state);
   await page.goto(url.href);
   expect(page.url()).toBe(url.href);
   if (view === 'group') await expect(page.getByText('Anggota privat')).toBeVisible();
   if (state === 'ready') await page.screenshot({ path: info.outputPath(`screenshots/${view}-closed.png`), fullPage: true, animations: 'disabled' });
   await page.getByRole('button', { name: /Alya Putri/ }).click();
   const dialog = page.getByRole('dialog', { name: 'Profil siswa' });
   await expect(dialog).toBeVisible();
   if (state === 'loading') await expect(dialog.getByRole('status')).toHaveText('Memuat profil');
   else if (state === 'unavailable') await expect(dialog.getByText('Profil tidak tersedia')).toBeVisible();
   else {
    await expect(dialog.getByText('12 pengikut')).toBeVisible();
    await expect(dialog.getByRole('button', { name: state === 'following' ? 'Unfollow' : 'Follow' })).toBeVisible();
   }
   if (state === 'follow-pending' || state === 'follow-error') {
    await dialog.getByRole('button', { name: 'Follow', exact: true }).click();
    if (state === 'follow-pending') await expect(dialog.getByRole('button', { name: 'Follow', exact: true })).toBeDisabled();
    else await expect(dialog.getByRole('alert')).toContainText('Coba lagi');
   }
   await page.screenshot({ path: info.outputPath(`screenshots/${view}-${state}.png`), fullPage: true, animations: 'disabled' });
   if (state === 'ready') {
    await dialog.getByRole('button', { name: 'Follow', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Unfollow' })).toBeVisible();
    await expect(dialog.getByText('13 pengikut')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`screenshots/${view}-followed.png`), fullPage: true, animations: 'disabled' });
   }
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
   expect(await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || image.naturalWidth === 0).length)).toBe(0);
   expect(failures).toEqual([]);
  });
 }
}
