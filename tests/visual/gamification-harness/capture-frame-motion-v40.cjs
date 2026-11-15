// Primary agent only. Run under taskset with one CPU and Node heap 384 MB.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');
const { chromium } = require(process.env.ZYX_PLAYWRIGHT || '/data/home/.t3/runtime/versions/0.1.7/node_modules/playwright-core');
const fixture = path.resolve(process.env.ZYX_FRAME_FIXTURE || 'artifacts/visual-quality/frame-motion-fixture-v40/standalone.html');
const out = path.resolve(process.env.ZYX_FRAME_RESULTS || 'artifacts/visual-quality/results/frame-motion-v40');
fs.mkdirSync(out, { recursive: true });
// Bounded decoder for Chromium 8-bit RGB/RGBA PNGs. No dependencies or installs.
function png(file) {
  const b = fs.readFileSync(file); let w, h, channels; const chunks = [];
  if (b.readUInt32BE(0) !== 0x89504e47) throw Error('Not PNG');
  for (let p = 8; p < b.length;) {
    const n = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + n);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); channels = d[9] === 6 ? 4 : d[9] === 2 ? 3 : 0; if (d[8] !== 8 || !channels || d[12] || w * h > 2000000) throw Error('Unsupported PNG'); }
    if (type === 'IDAT') chunks.push(d); p += n + 12;
  }
  const stride = w * channels, raw = zlib.inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * h });
  const data = Buffer.alloc(stride * h); let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[y * stride + x - channels] : 0, b = y ? data[(y - 1) * stride + x] : 0, c = y && x >= channels ? data[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, Math.floor((a + b) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (pred === undefined) throw Error('Invalid PNG filter');
      data[y * stride + x] = (raw[pos++] + pred) & 255;
    }
  }
  return { w, h, channels, data };
}
function compare(aFile, bFile, aperture) {
  const a = png(aFile), b = png(bFile); if (a.w !== b.w || a.h !== b.h) throw Error('Crop dimensions changed');
  let exterior = 0, changed = 0, center = 0, centerChanged = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const radius = Math.hypot(x + .5 - a.w / 2, y + .5 - a.h / 2);
    const delta = Math.max(...[0, 1, 2].map(c => Math.abs(a.data[(y * a.w + x) * a.channels + c] - b.data[(y * b.w + x) * b.channels + c])));
    if (radius > 120 * aperture + 2) { exterior++; if (delta >= 24) changed++; }
    if (radius < 120 * aperture - 6) { center++; if (delta > 3) centerChanged++; }
  }
  return { exteriorPixels: exterior, changedPixels: changed, changedFraction: changed / exterior, centerPixels: center, centerChanged, centerChangedFraction: centerChanged / center };
}
async function model(page) {
  return page.locator('[data-testid=selected-frame]').evaluate(root => {
    const frame = root.querySelector('.collectible-frame'), identity = root.querySelector('[data-testid=identity]');
    const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; };
    const parts = [...root.querySelectorAll('[data-part], [data-frame-part]')].map((el, index) => ({ id:el.getAttribute('data-part') || el.getAttribute('data-frame-part') || String(index), transform:getComputedStyle(el).transform, opacity:getComputedStyle(el).opacity, clipPath:getComputedStyle(el).clipPath, rect:rect(el), animations:el.getAnimations().map(a => ({ state:a.playState,time:a.currentTime })) }));
    return { parts, running:frame.dataset.running, inView:frame.dataset.inView, frame:rect(frame), identity:{ rect:rect(identity),src:identity.getAttribute('src'),transform:getComputedStyle(identity).transform }, clipping:[...root.querySelectorAll("svg, clipPath, .collectible-frame__identity")].map(el=>({tag:el.tagName,id:el.id,overflow:getComputedStyle(el).overflow,clipPath:getComputedStyle(el).clipPath,rect:rect(el)})), sceneTransform:getComputedStyle(root.querySelector('.collectible-frame__scene')).transform, animations:frame.getAnimations({subtree:true}).map(a => ({state:a.playState,time:a.currentTime})), aperture:Number(root.dataset.aperture) };
  });
}
async function phase(page, seconds) {
  await page.locator('[data-testid=selected-frame]').evaluate((root, time) => {
    for (const a of root.getAnimations({ subtree:true })) { a.pause(); a.currentTime = time * 1000; }
  }, seconds);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function settle(page) {
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  await page.waitForTimeout(120);
}
async function capture(page, name) {
  const file = path.join(out, name + '.png');
  await page.locator('[data-testid=hero-crop]').screenshot({ path:file, animations:'allow' }); return file;
}
(async () => {
  const started = Date.now(), errors = [], gates = [], results = [];
  let browser, closed = false, peakRssKB = 0, peakTreeRssKB = 0;
  const check = (ok, message) => { if (!ok) gates.push(message); };
  const sampleRss = () => {
    peakRssKB = Math.max(peakRssKB, process.resourceUsage().maxRSS);
    const rows = [];
    for (const pid of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))) {
      try { const status = fs.readFileSync('/proc/'+pid+'/status','utf8'); rows.push({pid:Number(pid),ppid:Number(status.match(/PPid:\s*(\d+)/)?.[1]),rss:Number(status.match(/VmRSS:\s*(\d+)/)?.[1] || 0)}); } catch {}
    }
    const children = new Set([process.pid]); let previous;
    do { previous=children.size; for(const row of rows) if(children.has(row.ppid)) children.add(row.pid); } while(children.size!==previous);
    peakTreeRssKB=Math.max(peakTreeRssKB,rows.filter(r=>children.has(r.pid)).reduce((n,r)=>n+r.rss,0));
  };
  const memoryTimer=setInterval(sampleRss,1000);
  try {
    const affinity = fs.readFileSync('/proc/self/status','utf8').match(/Cpus_allowed_list:\s*(.*)/)?.[1];
    if (!/^\d+$/.test(affinity || '')) throw Error('Run with taskset -c <one allowed CPU>');
    browser = await chromium.launch({ executablePath:process.env.ZYX_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=1','--js-flags=--max-old-space-size=192','--allow-file-access-from-files'] });
    const page = await browser.newPage({deviceScaleFactor:1, reducedMotion:'no-preference'});
    page.on('pageerror',e => errors.push(e.message));
    page.on('console',m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed',r => errors.push('Request failed: ' + r.url().slice(0,160)));
    page.on('response',r => { if (r.status() >= 400) errors.push('HTTP '+r.status()); });
    await page.route(/^https?:/,route => { errors.push('Unexpected network request'); return route.abort(); });
    for (const [viewport,width,height] of [['desktop',1536,864],['mobile',380,844]]) {
      await page.setViewportSize({width,height}); await page.goto(pathToFileURL(fixture).href); await settle(page);
      check(page.url() === pathToFileURL(fixture).href, 'Unexpected redirect');
      const overview = path.join(out,`overview-${viewport}.png`); await page.screenshot({path:overview,fullPage:true});
      const ids = await page.locator('[data-frame-choice]').evaluateAll(nodes => nodes.map(n => n.dataset.frameChoice));
      check(ids.length === 10, 'Expected 10 frame choices');
      for (const id of ids) {
        await page.locator(`[data-frame-choice="${id}"]`).click();
        await page.locator('[data-testid=hero-crop]').scrollIntoViewIfNeeded(); await settle(page); await page.mouse.move(0,0);
        await page.waitForFunction(() => document.querySelector('[data-testid=selected-frame] .collectible-frame')?.dataset.running === 'true');
        const row = {viewport,id,overview,phases:[],comparisons:[]}; results.push(row);
        for (const time of [.25,.9,1.6]) { await phase(page,time); row.phases.push({time,model:await model(page),file:await capture(page,`${viewport}-${id}-${time}`)}); }
        for (let i=1;i<3;i++) row.comparisons.push(compare(row.phases[i-1].file,row.phases[i].file,row.phases[0].model.aperture));
        const moved = row.phases[0].model.parts.filter((part,index) => row.phases.slice(1).some(p => p.model.parts[index]?.transform !== part.transform));
        row.independentlyMovingParts = moved.map(p=>p.id);
        row.distinctTransformTrajectories = new Set(moved.map(part => JSON.stringify(row.phases.map(p=>p.model.parts.find(q=>q.id===part.id)?.transform)))).size;
        check(row.distinctTransformTrajectories >= 2, `${viewport}/${id}: parts share one transform trajectory`);
        check(moved.length >= 2, `${viewport}/${id}: fewer than two moving parts`);
        check(row.comparisons.every(c => c.changedFraction >= .01),`${viewport}/${id}: exterior movement below 1%`);
        check(row.comparisons.every(c => c.centerChanged === 0),`${viewport}/${id}: photo changed`);
        const initial = row.phases[0].model;
        const crop = await page.locator('[data-testid=hero-crop]').boundingBox();
        row.geometry = await page.evaluate(() => ({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,brokenAssets:[...document.images].filter(i=>!i.complete || !i.naturalWidth).length,canvases:document.querySelectorAll('canvas').length,thumbnailAnimations:[...document.querySelectorAll('[data-frame-choice]')].reduce((n,e)=>n+e.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations===Infinity).length,0)}));
        check(row.geometry.width >= row.geometry.scrollWidth && !row.geometry.brokenAssets && !row.geometry.canvases && !row.geometry.thumbnailAnimations,`${viewport}/${id}: geometry/assets/resource gate`);
        check(initial.frame.x >= crop.x && initial.frame.y >= crop.y && initial.frame.x+240 <= crop.x+crop.width && initial.frame.y+240 <= crop.y+crop.height,`${viewport}/${id}: clipped frame`);
        await page.mouse.move(initial.frame.x+220,initial.frame.y+25); await page.waitForTimeout(750);
        row.pointer = {model:await model(page),file:await capture(page,`${viewport}-${id}-pointer`)};
        check(JSON.stringify(initial.identity) === JSON.stringify(row.pointer.model.identity),`${viewport}/${id}: pointer moved photo geometry`);
        row.pointer.photoComparison = compare(row.phases[2].file,row.pointer.file,initial.aperture);
        check(row.pointer.photoComparison.centerChanged === 0,`${viewport}/${id}: pointer obscured photo`);
        await page.mouse.move(0,0);
        await page.locator('[data-testid=motion-toggle]').click(); await page.locator('[data-testid=hero-crop]').scrollIntoViewIfNeeded(); await settle(page);
        row.off = {model:await model(page),file:await capture(page,`${viewport}-${id}-off`)};
        check(row.off.model.animations.every(a=>a.state!=='running'),`${viewport}/${id}: motion off still running`);
        await page.locator('[data-testid=motion-toggle]').click(); await page.emulateMedia({reducedMotion:'reduce'}); await page.locator('[data-testid=hero-crop]').scrollIntoViewIfNeeded(); await settle(page);
        row.reduced = {model:await model(page),file:await capture(page,`${viewport}-${id}-reduced`)};
        check(row.reduced.model.animations.every(a=>a.state!=='running'),`${viewport}/${id}: reduced motion running`);
        await page.emulateMedia({reducedMotion:'no-preference'}); await settle(page);
        await page.evaluate(() => {const spacer=document.createElement('div');spacer.id='offscreen-probe';spacer.style.height='2000px';document.body.append(spacer);window.scrollTo(0,document.body.scrollHeight);}); await page.waitForTimeout(200);
        row.offscreen = await model(page); check(row.offscreen.running !== 'true' && row.offscreen.animations.every(a=>a.state!=='running'),`${viewport}/${id}: offscreen running`);
        await page.evaluate(() => {document.getElementById('offscreen-probe').remove();window.scrollTo(0,0);}); sampleRss();
      }
    }
  } catch (error) { errors.push(error.stack); }
  finally {
    clearInterval(memoryTimer); sampleRss();
    if (browser) { await browser.close(); closed = !browser.isConnected(); }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({fixture,thresholds:{rgbDelta:24,exteriorFraction:.01,centerRgbTolerance:3,centerChangedPixels:0,minimumMovingParts:2},partContract:'Each independently animated production ornament must expose data-part or data-frame-part on its transformed element. Identity and whole-scene transforms do not count.',resourceLimits:{cpu:1,browsers:1,pages:1,nodeHeapMB:384,rendererHeapMB:192,gpu:false},elapsedMs:Date.now()-started,nodePeakRssKB:peakRssKB,processTreePeakRssKB:peakTreeRssKB,browserClosed:closed,errors,gates,results,visualInspection:'Pending primary agent inspection of every PNG. No full application or hidden-tab verification.'},null,2));
  }
  if(errors.length || gates.length || !closed) {console.error(JSON.stringify({errors,gates,closed}));process.exitCode=1;} else console.log('Capture gates passed; primary visual inspection still required.');
})();
