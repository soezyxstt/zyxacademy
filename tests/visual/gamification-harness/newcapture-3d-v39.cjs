// Primary agent only. Compile studio-entry.tsx first, then run and inspect every PNG.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
if (!process.env.ZYX_STUDIO_SINGLE_CORE) {
  const cpu = fs.readFileSync('/proc/self/status', 'utf8').match(/^Cpus_allowed_list:\s*(\d+)/m)[1];
  const child = spawnSync('taskset', ['-c', cpu, process.execPath, '--max-old-space-size=384', __filename], { stdio: 'inherit', env: { ...process.env, ZYX_STUDIO_SINGLE_CORE: '1', NODE_OPTIONS: '--max-old-space-size=384', RAYON_NUM_THREADS: '1' } });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
const { chromium } = require(process.env.ZYX_PLAYWRIGHT_PATH || '/data/home/.t3/runtime/versions/0.1.7/node_modules/playwright-core');
const root = path.resolve(__dirname, '../../..');
const entry = path.join(process.env.ZYX_FIXTURE_OUT || path.join(root, 'artifacts/visual-quality/gamification-fixture'), 'index.html');
const output = process.env.ZYX_STUDIO_CAPTURE_OUT || path.join(root, 'artifacts/visual-quality/cosmetics-studio-v39');
const frameIds = ['classic','detailed','laurel','circuit','celestial','merah-putih','borobudur','khatulistiwa','anggrek','naga'].map(id => `frame-${id}`);
const mascotIds = ['komodo','jalak','harimau','orangutan','anoa','bekantan','cenderawasih','penyu','badak','elang'].map(id => `zyra-avatar-${id}`);
const results = []; let browser, fatal; const errors = [];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--renderer-process-limit=1','--js-flags=--max-old-space-size=192','--allow-file-access-from-files','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ deviceScaleFactor: 1, colorScheme: 'light' });
    await context.addInitScript(() => {
      const fallback = location.search.includes('webgl=off');
      const stats = window.__webgl39 = { contexts: 0, draws: 0, triangles: 0, depthDraws: 0, lost: 0 };
      const seen = new WeakSet(); const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (fallback && /webgl/i.test(type)) return null;
        const gl = original.call(this, type, ...args);
        if (gl && /webgl/i.test(type) && !seen.has(gl)) {
          seen.add(gl); stats.contexts++;
          this.addEventListener('webglcontextlost', () => stats.lost++);
          for (const key of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
            if (!gl[key]) continue;
            const draw = gl[key].bind(gl);
            gl[key] = (...values) => { stats.draws++; if (gl.isEnabled(gl.DEPTH_TEST)) stats.depthDraws++; if (values[0] === gl.TRIANGLES) stats.triangles++; return draw(...values); };
          }
        }
        return gl;
      };
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on('requestfailed', r => errors.push(`${r.url()} ${r.failure()?.errorText}`));
    await page.route(/^https?:/, route => route.abort());
    const viewer = page.getByTestId('selected-mascot');
    async function settle() {
      await page.waitForFunction(() => document.querySelector('[data-testid="cosmetics-studio"]'));
      await page.waitForFunction(() => [...document.images].every(i => i.complete));
      await page.evaluate(() => document.fonts.ready);
    }
    async function capture(state, size, scope) {
      await settle(); await scope.scrollIntoViewIfNeeded();
      const gates = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, broken: [...document.images].filter(i => !i.naturalWidth).map(i => i.src), webgl: { ...window.__webgl39 } }));
      assert(!gates.overflow, `${state}: overflow`); assert(!gates.broken.length, `${state}: broken images`); assert(!errors.length, errors.join('\n'));
      assert(gates.webgl.lost === 0, 'Unexpected WebGL context loss');
      const file = path.join(output, `${state}-${size.name}.png`);
      await scope.screenshot({ path: file });
      results.push({ state, viewport: size, file, gates });
    }
    for (const size of [{ name: 'desktop', width: 1536, height: 864 }, { name: 'mobile', width: 380, height: 844 }]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const url = pathToFileURL(entry).href;
      await page.goto(url); assert(page.url() === url, 'Unexpected redirect');
      if(fs.existsSync(path.join(path.dirname(entry),'fonts.css'))) await page.addStyleTag({path:path.join(path.dirname(entry),'fonts.css')});
      await settle();
      await page.screenshot({path:path.join(output,`overview-${size.name}.png`),fullPage:true});
      assert(await page.locator('[data-frame-id]').count() === 10, 'Expected ten frame choices');
      assert(await page.locator('[data-mascot-id]').count() === 10, 'Expected ten static mascot choices');
      const photo = await page.locator('.collectible-frame__identity img').first().getAttribute('src');
      for (const id of frameIds) {
        const control = page.locator(`[data-frame-id="${id}"]`); await control.click();
        assert(await control.getAttribute('aria-pressed') === 'true', `Unselected ${id}`);
        assert(await page.locator('.collectible-frame__identity img').first().getAttribute('src') === photo, 'Student photo changed');
        await capture(id, size, page.locator('.collectible-frame').first());
      }
      await viewer.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => window.__webgl39.triangles > 0 && window.__webgl39.depthDraws > 0);
      assert(await page.locator('canvas').count() === 1, 'Expected one actual 3D canvas');
      await viewer.locator('canvas').evaluate(canvas => { canvas.dataset.identity39 = 'original'; });
      const contextCount = await page.evaluate(() => window.__webgl39.contexts);
      for (const id of mascotIds) {
        const control = page.locator(`[data-mascot-id="${id}"]`); await control.click();
        assert(await control.getAttribute('aria-pressed') === 'true', `Unselected ${id}`);
        await viewer.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
        assert(await page.locator('canvas').count() === 1, 'Multiple 3D canvases');
        assert(await viewer.locator('canvas').getAttribute('data-identity39') === 'original', 'Selection recreated canvas');
        assert(await page.evaluate(() => window.__webgl39.contexts) === contextCount, 'Selection leaked a WebGL context');
        await capture(id, size, viewer);
      }
      const toggle = page.locator('#studio-motion');
      for (const state of ['motion-on','motion-off','reduced-motion']) {
        if (state === 'motion-off') await toggle.click();
        if (state === 'reduced-motion') { await toggle.click(); await page.emulateMedia({ reducedMotion: 'reduce' }); }
        const hero = page.locator('.collectible-frame').first();
        await hero.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
        const frameMotion = await hero.evaluate(el => ({ running: el.dataset.running, animations: el.getAnimations({ subtree: true }).map(a => a.playState) }));
        assert(state === 'motion-on' ? frameMotion.animations.includes('running') : !frameMotion.animations.includes('running'), `${state}: unexpected frame motion`);
        await viewer.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
        const before = await page.evaluate(() => window.__webgl39.draws);
        await page.waitForTimeout(350);
        const after = await page.evaluate(() => window.__webgl39.draws);
        assert(state === 'motion-on' ? after > before : after === before, `${state}: unexpected rendering loop`);
        await capture(state, size, viewer);
      }
      await page.goto(`${url}?webgl=off`); await settle(); await viewer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      assert(await page.evaluate(() => window.__webgl39.contexts) === 0, 'Fallback created WebGL context');
      assert(await viewer.locator('canvas').count() === 0, 'Fallback retains blank canvas');
      assert(await viewer.locator('[role="status"]').count() > 0, 'Fallback must explain 3D unavailability with role=status');
      await capture('webgl-fallback', size, viewer);
    }
  } catch (error) { fatal = error.stack; process.exitCode = 1; }
  finally {
    if (browser) await browser.close();
    fs.writeFileSync(path.join(output, 'capture-results.json'), JSON.stringify({ exitCode: process.exitCode || 0, results, fatal, errors, resources: { browserCount: 1, pageCount: 1, cores: 1, nodeHeapMb: 384, rendererHeapMb: 192 }, limitations: ['Primary must inspect every image', 'Fixture only; no routing, authentication, database or persistence verification', 'WebGL draw instrumentation verifies rasterized triangles, not model anatomy; primary must inspect shape and depth', 'Hidden-tab pause and GPU memory reclamation require separate verification'] }, null, 2));
  }
})();
