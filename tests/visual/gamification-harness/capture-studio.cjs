// Root runs this file and personally inspects every resulting PNG. No compilation or server here.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync, spawnSync } = require('node:child_process');
// Bound the Node wrapper and all inherited browser processes to one allowed core.
if (!process.env.ZYX_STUDIO_SINGLE_CORE) {
  const allowed = fs.readFileSync('/proc/self/status', 'utf8').match(/^Cpus_allowed_list:\s*(\d+)/m);
  if (!allowed) throw new Error('Cannot determine an allowed CPU');
  const child = spawnSync('taskset', ['-c', allowed[1], process.execPath, '--max-old-space-size=384', __filename], {
    stdio: 'inherit', env: { ...process.env, ZYX_STUDIO_SINGLE_CORE: '1', NODE_OPTIONS: '--max-old-space-size=384', RAYON_NUM_THREADS: '1' },
  });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
const { chromium } = require('/data/home/.t3/runtime/versions/0.1.7/node_modules/playwright-core');
const root = path.resolve(__dirname, '../../..');
const entry = path.join(process.env.ZYX_FIXTURE_OUT || path.join(root, 'artifacts/visual-quality/gamification-fixture'), 'index.html');
const output = process.env.ZYX_STUDIO_CAPTURE_OUT || path.join(root, 'artifacts/visual-quality/cosmetics-studio-v38');
const sizes = [{ name: 'desktop', width: 1536, height: 864 }, { name: 'mobile', width: 380, height: 844 }];
const frameIds = ['frame-classic', 'frame-detailed', 'frame-laurel', 'frame-circuit', 'frame-celestial', 'frame-merah-putih'];
// Optional asset-worker output is read exactly once. Absence never starts polling.
const registryFile = path.join(root, 'lib/gamification/collection-art.ts');
const registryText = fs.existsSync(registryFile) ? fs.readFileSync(registryFile, 'utf8') : null;
const registryMatch = registryText?.match(/FRAME_COLLECTIONS\s*=\s*(\[[\s\S]*?\])\s*as const/);
let registry = null;
try { if (registryMatch) registry = JSON.parse(registryMatch[1]); } catch { /* DOM labels remain authoritative. */ }
const results = [], started = Date.now();
let peakRssKb = 0, browserClosed = false, fatal = null, browser, sampler;
function assert(value, message) { if (!value) throw new Error(message); }
function sample() {
  try {
    const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8', timeout: 2000 }).trim().split('\n').map(x => x.trim().split(/\s+/).map(Number));
    const ids = new Set([process.pid]);
    for (let n = -1; n !== ids.size;) { n = ids.size; for (const [pid, parent] of rows) if (ids.has(parent)) ids.add(pid); }
    peakRssKb = Math.max(peakRssKb, rows.reduce((sum, [pid,,rss]) => sum + (ids.has(pid) ? rss : 0), 0));
  } catch { /* Observation must not interrupt capture. */ }
}
function report(exitCode) {
  fs.writeFileSync(path.join(output, 'capture-results.json'), JSON.stringify({
    results, fatal, exitCode, browserClosed, elapsedSeconds: (Date.now() - started) / 1000,
    resources: { observedProcessTreePeakRssMb: Math.round(peakRssKb / 1024), nodeHeapLimitMb: 384, rendererHeapLimitMb: 192, cpuAffinity: fs.readFileSync('/proc/self/status', 'utf8').match(/^Cpus_allowed_list:\s*(.*)/m)?.[1], browserCount: 1, pageCount: 1 },
    registry: { present: registryText !== null, parsed: !!registry, entries: registry },
    limits: ['Local actual-component fixture with fictional identity and mocked services', 'Full Next.js, auth, persistence and external services are not exercised', 'Hidden-tab behavior is not tested', 'Human visual inspection remains required', 'Clipboard is not exercised'],
  }, null, 2));
}
async function settle(page) {
  await page.waitForFunction(() => document.querySelector('[data-testid="cosmetics-studio"]'));
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  await page.evaluate(() => document.fonts.ready);
}
async function selected(button, group) {
  assert(await button.getAttribute('aria-pressed') === 'true', 'Selected control must have aria-pressed=true');
  assert(await group.locator('button[aria-pressed="true"]').count() === 1, 'Exactly one control must be selected in group');
}
async function motionSample(hero) {
  return hero.evaluate(el => ({ running: el.dataset.running, animations: el.getAnimations({ subtree: true }).map(a => ({ state: a.playState, time: a.currentTime })), accents: [...el.querySelectorAll('.collectible-frame__accent')].map(x => { const s = getComputedStyle(x); return { transform: s.transform, opacity: s.opacity, name: s.animationName, visibility: s.visibility }; }) }));
}
async function assertMotion(page, hero, mode) {
  await hero.scrollIntoViewIfNeeded();
  if (mode !== 'off') await page.waitForFunction(() => document.querySelector('[aria-label="Koleksi bingkai"] .collectible-frame')?.dataset.running === 'true');
  const first = await motionSample(hero);
  await page.waitForTimeout(180);
  let second = await motionSample(hero);
  // Shimmer deliberately rests at the start of its cycle before the highlight passes.
  if (mode === 'on' && JSON.stringify(first.accents) === JSON.stringify(second.accents)) {
    await page.waitForTimeout(650);
    second = await motionSample(hero);
  }
  if (mode === 'on') {
    assert(second.animations.some(a => a.state === 'running'), 'In-view hero has no running real animation');
    assert(JSON.stringify(first.accents) !== JSON.stringify(second.accents), 'Computed motion did not change between two samples');
  } else if (mode === 'off') {
    assert(second.running === 'false', 'Motion-off hero still data-running=true');
    assert(second.animations.every(a => a.state !== 'running'), 'Motion-off hero animation still running');
    assert(second.accents.every(a => a.visibility === 'hidden'), 'Motion-off accents must be hidden');
  } else {
    assert(second.accents.every(a => a.name === 'none'), 'Reduced-motion computed animationName must be none');
    assert(second.animations.every(a => a.state !== 'running'), 'Reduced-motion animation still running');
  }
  return { first, second };
}
// Pause real animations at a visible phase, including the blaze peak. Never disable CSS animations.
async function freeze(page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const duration = Number(a.effect?.getTiming().duration);
      a.pause();
      if (Number.isFinite(duration) && duration > 0) a.currentTime = duration * (a.animationName === 'collectible-flame' ? 0.95 : 0.45);
    }
  });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    assert(fs.existsSync(entry), 'Compile studio-entry.tsx via ZYX_FIXTURE_ENTRY before capture');
    sampler = setInterval(sample, 1200);
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=192', '--allow-file-access-from-files'] });
    const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'no-preference', colorScheme: 'light' });
    const page = await context.newPage();
    page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(15000);
    let errors = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    const tasks = sizes.flatMap(size => [
      { state: 'overview', size }, ...frameIds.map((id, index) => ({ state: id, index, kind: 'frame', size })),
      ...Array.from({ length: 6 }, (_, index) => ({ state: `skin-${index + 1}`, index, kind: 'skin', size })),
      ...['motion-on', 'motion-off', 'reduced-motion'].map(state => ({ state, size })),
    ]);
    tasks.push({ state: 'overview', size: { name: 'tablet', width: 768, height: 844 } });
    const requestedStates = process.env.ZYX_STUDIO_CAPTURE_STATES?.split(',');
    for (const task of tasks.filter(task => !requestedStates || requestedStates.includes(task.state))) {
      errors = [];
      const file = path.join(output, `${task.state}-${task.size.name}.png`);
      const result = { state: task.state, viewport: task.size, file, gates: {}, errors: [], screenshotWritten: false };
      try {
        await page.setViewportSize({ width: task.size.width, height: task.size.height });
        await page.emulateMedia({ reducedMotion: task.state === 'reduced-motion' ? 'reduce' : 'no-preference' });
        const url = pathToFileURL(entry).href;
        await page.goto(url, { waitUntil: 'load' });
        assert(page.url() === url, 'Unexpected navigation'); result.gates.noRedirect = true;
        const fonts = path.join(path.dirname(entry), 'fonts.css');
        if (fs.existsSync(fonts)) await page.addStyleTag({ path: fonts });
        await settle(page);
        const frames = page.getByRole('region', { name: 'Koleksi bingkai', exact: true });
        const zyra = page.getByRole('region', { name: 'Gaya Zyra', exact: true });
        const hero = frames.locator('.collectible-frame').first();
        const frameButtons = frames.getByRole('button', { name: /^Pilih bingkai / });
        assert(await frameButtons.count() === 6, 'Expected six frame controls');
        const portraitBefore = await frames.locator('.collectible-frame__identity img').first().getAttribute('src');
        assert(portraitBefore, 'Student photo must be present');
        // Compare every student identity image, including the chat portrait, after each selection.
        const identitySources = () => page.locator('[data-testid="cosmetics-studio"] img').evaluateAll((images, src) => images.filter(i => i.getAttribute('src') === src).map(i => i.getAttribute('src')), portraitBefore);
        const identitiesBefore = await identitySources();
        let scope = frames;
        if (task.kind === 'frame') {
          const button = frameButtons.nth(task.index);
          result.control = await button.getAttribute('aria-label');
          await button.click();
          await selected(button, frames.locator('div.grid').last());
          assert(await frames.getByRole('heading', { name: result.control.replace('Pilih bingkai ', ''), exact: true }).count() === 1, 'Active frame heading must match selection');
          const art = registry?.find(r => r.id === task.state);
          if (art) {
            assert(await hero.getAttribute('data-motion') === (art.motion === 'flame' ? 'blaze' : art.motion), 'Motion adapter does not match registry');
            assert((await hero.locator('.collectible-frame__art').getAttribute('src')).endsWith(art.src), 'Hero art does not match registry');
          }
          assert(await frames.locator('.collectible-frame').nth(1).evaluate(el => el.getBoundingClientRect().width) === 48, 'Scaled preview must be 48 px');
          result.motion = await assertMotion(page, hero, 'on');
        } else if (task.kind === 'skin') {
          scope = zyra;
          const groups = zyra.locator('fieldset');
          const mascots = groups.filter({ has: page.locator('legend', { hasText: 'Maskot Zyra' }) });
          const skins = groups.filter({ has: page.locator('legend', { hasText: 'Gelembung percakapan' }) });
          assert(await mascots.getByRole('button').count() === 4 && await skins.getByRole('button').count() === 6, 'Expected four mascots and six skins');
          const avatar = zyra.locator('.zyra-cosmetic-avatar[aria-label="Zyra"] img').first();
          // Start on the preceding mascot so every round-robin selection must change its image.
          const mascotIndex = task.index % 4;
          await mascots.getByRole('button').nth((mascotIndex + 3) % 4).click();
          const before = await avatar.getAttribute('src');
          const mascotButton = mascots.getByRole('button').nth(mascotIndex);
          await mascotButton.click(); await selected(mascotButton, mascots);
          assert(await avatar.getAttribute('src') !== before, 'Selected assistant avatar image did not change');
          const button = skins.getByRole('button').nth(task.index);
          result.control = await button.textContent(); result.mascot = await mascotButton.textContent();
          await button.click(); await selected(button, skins);
          const motif = await zyra.locator('[data-message-role="assistant"]').getAttribute('data-zyra-skin');
          assert(motif, 'Selected assistant skin is absent'); result.skinMotif = motif;
          const like = zyra.getByRole('button', { name: 'Jawaban membantu', exact: true });
          await like.click(); assert(await like.isVisible() && await like.getAttribute('aria-pressed') === 'true', 'Like feedback state missing');
          result.gates.assistantAvatarChanged = true; result.gates.likeFeedback = true;
        } else {
          const toggle = frames.getByRole('switch', { name: 'Gerak' });
          assert(await toggle.getAttribute('aria-checked') === 'true', 'Motion must default on');
          if (task.state === 'motion-off') await toggle.click();
          result.motion = await assertMotion(page, hero, task.state === 'motion-off' ? 'off' : task.state === 'reduced-motion' ? 'reduce' : 'on');
        }
        await settle(page);
        assert(JSON.stringify(await identitySources()) === JSON.stringify(identitiesBefore), 'Student photo changed after cosmetic selection');
        result.gates.studentPhotoUnchanged = true;
        assert(await hero.locator('.collectible-frame__art').evaluate(i => i.complete && i.naturalWidth > 0), 'Main hero image missing or broken'); result.gates.heroImage = true;
        // Exercise actual intersection visibility before freezing for the image.
        if (task.kind !== 'skin' && task.state !== 'motion-off') {
          // A temporary inert spacer guarantees enough scroll range even on a tall desktop.
          // It is removed before geometry checks and screenshots.
          await hero.evaluate(el => {
            const spacer = document.createElement('div'); spacer.id = 'capture-scroll-spacer';
            spacer.style.height = `${window.innerHeight}px`; document.body.append(spacer);
            window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY + 2);
          });
          await page.waitForFunction(() => document.querySelector('[aria-label="Koleksi bingkai"] .collectible-frame')?.dataset.running === 'false');
          result.gates.offscreenPaused = true;
          await page.evaluate(() => document.getElementById('capture-scroll-spacer')?.remove());
        }
        await scope.scrollIntoViewIfNeeded();
        if (scope === frames) {
          await hero.scrollIntoViewIfNeeded();
          if (task.state !== 'motion-off') await page.waitForFunction(() => document.querySelector('[aria-label="Koleksi bingkai"] .collectible-frame')?.dataset.running === 'true');
        }
        await freeze(page);
        result.geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')) }));
        result.gates.noOverflow = result.geometry.scrollWidth <= result.geometry.width;
        result.gates.noBrokenImages = result.geometry.brokenImages.length === 0;
        if (task.state === 'overview') await page.screenshot({ path: file, fullPage: true, animations: 'allow', timeout: 15000 });
        else await scope.screenshot({ path: file, animations: 'allow', timeout: 15000 });
        result.screenshotWritten = true;
      } catch (error) { errors.push(String(error)); }
      result.errors = [...errors]; result.gates.noRuntimeOrHttpErrors = errors.length === 0;
      result.passed = result.screenshotWritten && Object.values(result.gates).every(Boolean);
      sample(); results.push(result); report(null);
      console.log(JSON.stringify({ state: task.state, viewport: task.size.name, passed: result.passed, file, errors: result.errors }));
    }
  } catch (error) { fatal = String(error); }
  finally {
    clearInterval(sampler); sample();
    if (browser) { try { await browser.close(); browserClosed = true; } catch (error) { fatal = `${fatal || ''} Browser close failed: ${error}`; } }
    const exitCode = fatal || results.some(r => !r.passed) || results.length !== (process.env.ZYX_STUDIO_CAPTURE_STATES === 'overview' ? 3 : 33) ? 1 : 0;
    report(exitCode); process.exitCode = exitCode;
    console.log(JSON.stringify({ exitCode, captures: results.length, browserClosed, fatal }));
  }
})();
