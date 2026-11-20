// Primary-agent screenshot runner. One browser, one page, sequential local fixtures.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('/data/home/.t3/runtime/versions/0.1.7/node_modules/playwright-core');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, 'artifacts/visual-quality/gamification-dummy');
const entry = path.join(root, 'artifacts/visual-quality/gamification-fixture/index.html');
const views = (process.env.GAMIFICATION_CAPTURE_VIEWS || 'overview,badges,missions,rewards,leaderboard,profile,profile-edit,public-profile,dashboard,toast-badge,toast-rank,solution').split(',');
const sizes = [{ name: 'desktop', width: 1536, height: 864 }, { name: 'mobile', width: 380, height: 844 }];
let peakRssKb = 0;
function sampleMemory() {
  try {
    const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
    const ids = new Set([process.pid]);
    let previous;
    do { previous = ids.size; for (const [pid, parent] of rows) if (ids.has(parent)) ids.add(pid); } while (previous !== ids.size);
    peakRssKb = Math.max(peakRssKb, rows.reduce((sum, [pid, , rss]) => sum + (ids.has(pid) ? rss : 0), 0));
  } catch {}
}
(async () => {
  if (!fs.existsSync(entry)) throw new Error('Compile the component fixture first');
  fs.mkdirSync(output, { recursive: true });
  const started = Date.now();
  const sampler = setInterval(sampleMemory, 1200);
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=192', '--allow-file-access-from-files'] });
  const results = [];
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' });
    await context.addInitScript(() => { try { localStorage.removeItem('zyx-celebrations-shown-v1'); } catch {} });
    const page = await context.newPage();
    let errors = [];
    page.on('pageerror', error => errors.push(String(error.message)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    for (const view of views) for (const size of sizes) {
      errors = [];
      await page.setViewportSize({ width: size.width, height: size.height });
      const url = new URL(pathToFileURL(entry).href);
      url.searchParams.set('view', view);
      await page.goto(url.href, { waitUntil: 'load', timeout: 15000 });
      if (fs.existsSync(path.join(path.dirname(entry), 'fonts.css'))) {
        await page.addStyleTag({ path: path.join(path.dirname(entry), 'fonts.css') });
      }
      await page.waitForFunction(() => document.querySelector('#root')?.textContent.trim().length > 10, { timeout: 10000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })));
      });
      if (view.startsWith('toast-')) await page.locator('[data-sonner-toast]').first().waitFor({ state: 'visible', timeout: 10000 });
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, brokenImages: [...document.images].filter(img => !img.complete || img.naturalWidth === 0).map(img => img.getAttribute('src')) }));
      const file = path.join(output, `${view}-${size.name}.png`);
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 15000 });
      sampleMemory();
      results.push({ view, viewport: size, file, errors: [...errors], ...geometry, overflow: geometry.scrollWidth > geometry.width });
      fs.writeFileSync(path.join(output, 'capture-results.json'), JSON.stringify({ results, observedPeakRssMb: Math.round(peakRssKb / 1024), elapsedSeconds: (Date.now() - started) / 1000, source: 'Production React components and CSS, mock services and fixture shell', fullNextApplicationVerified: false }, null, 2));
      console.log(JSON.stringify({ view, viewport: size.name, errors: errors.length, overflow: geometry.scrollWidth > geometry.width, brokenImages: geometry.brokenImages.length, file }));
    }
  } finally {
    clearInterval(sampler);
    await browser.close();
  }
  const failures = results.filter(row => row.errors.length || row.overflow || row.brokenImages.length);
  console.log(JSON.stringify({ screenshots: results.length, failures: failures.length, observedPeakRssMb: Math.round(peakRssKb / 1024), elapsedSeconds: (Date.now() - started) / 1000, browserClosed: true }));
  process.exitCode = failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
