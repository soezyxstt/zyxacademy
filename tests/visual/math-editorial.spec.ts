import { test, expect } from '@playwright/test';

for (let chapter = 1; chapter <= 5; chapter++) {
  test(`Matematika I Bab ${chapter} revision`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/student/articles/**/progress', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    const response = await page.goto(`/visual-fixtures/structured-article?editorialChapter=${chapter}`);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`Bab ${chapter}:`);
    await expect(page.locator('[class~="z-99999"]')).toHaveCount(0);
    const readingBounds = await page.locator('main').boundingBox();
    expect(readingBounds!.x + readingBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForFunction(() => {
      let element: Element | null = document.querySelector('main article h2');
      while (element) {
        if (Number(getComputedStyle(element).opacity) < 0.99) return false;
        element = element.parentElement;
      }
      return true;
    });
    await page.screenshot({ path: testInfo.outputPath('screenshots/article.png'), animations: 'disabled', caret: 'initial' });
    if (chapter === 2) {
      await page.locator('[data-point-kind="open"]').first().scrollIntoViewIfNeeded();
      await expect(page.locator('[data-point-kind="open"]').first()).toBeVisible();
      await expect(page.locator('[data-point-kind="closed"]').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ubah rumus', exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('screenshots/limit-graph.png'), animations: 'disabled', caret: 'initial' });
      await page.getByRole('button', { name: 'Nilai grafik', exact: true }).first().press('Enter');
      await expect(page.getByRole('button', { name: 'Sembunyikan nilai grafik', exact: true }).first()).toHaveAttribute('aria-expanded', 'true');
      await page.screenshot({ path: testInfo.outputPath('screenshots/limit-values.png'), animations: 'disabled', caret: 'initial' });
      const endpointFigure = page.locator('#visual-bab2-intermediate-value');
      await endpointFigure.scrollIntoViewIfNeeded();
      await expect(endpointFigure.locator('[data-point-kind="closed"]').last()).toBeVisible();
      const labelsFit = await endpointFigure.evaluate(figure => Array.from(figure.querySelectorAll('[data-point-kind]')).every(marker => {
        const text = marker.parentElement!.querySelector('text')!;
        const label = text.getBoundingClientRect();
        const svg = marker.closest('svg')!.getBoundingClientRect();
        return label.left >= svg.left && label.right <= svg.right && label.top >= svg.top && label.bottom <= svg.bottom;
      }));
      expect(labelsFit).toBe(true);
      await endpointFigure.screenshot({ path: testInfo.outputPath('screenshots/endpoint-labels.png'), animations: 'disabled' });
    }
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
    expect(errors).toEqual([]);
  });
}
