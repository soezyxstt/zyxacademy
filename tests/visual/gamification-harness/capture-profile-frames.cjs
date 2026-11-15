// Run sequentially on one CPU; fixture compilation is a separate step.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('/data/home/.t3/runtime/versions/0.1.7/node_modules/playwright-core');
const root = path.resolve(__dirname, '../../..');
const entry = path.join(process.env.ZYX_FIXTURE_OUT || path.join(root, 'artifacts/visual-quality/gamification-fixture'), 'index.html');
const output = process.env.GAMIFICATION_CAPTURE_OUT || path.join(root, 'artifacts/visual-quality/profile-frames-v35');
const sizes = [{name:'desktop',width:1536,height:864},{name:'mobile',width:380,height:844}];
const views = (process.env.GAMIFICATION_CAPTURE_VIEWS || 'frames,profile,public-profile,profile-edit,rewards,leaderboard').split(',');
const tasks = views.flatMap(view => sizes.map(size => ({view,size,state:'default'})));
if (!process.env.GAMIFICATION_DEFAULT_ONLY) for (const view of ['profile','public-profile']) tasks.push({view,size:{name:'tablet',width:768,height:844},state:'default'});
if (!process.env.GAMIFICATION_DEFAULT_ONLY) for (const size of sizes) for (const state of ['switch','pending','error','success','empty-owned','empty-board','public-long-name']) tasks.push({view:state === 'empty-board' ? 'profile' : state === 'public-long-name' ? 'public-profile' : 'profile-edit',size,state});
let peak = 0;
function sample() { try { const rows=execFileSync('ps',['-eo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(x=>x.trim().split(/\s+/).map(Number)); const ids=new Set([process.pid]); let n; do { n=ids.size; for(const [pid,ppid] of rows) if(ids.has(ppid)) ids.add(pid); } while(n!==ids.size); peak=Math.max(peak,rows.reduce((sum,[pid,,rss])=>sum+(ids.has(pid)?rss:0),0)); } catch {} }
(async()=>{
 if(!fs.existsSync(entry)) throw new Error('Compile the fixture first');
 fs.mkdirSync(output,{recursive:true}); const started=Date.now(); const results=[]; let browser; const sampler=setInterval(sample,1200);
 try {
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--renderer-process-limit=1','--js-flags=--max-old-space-size=192','--allow-file-access-from-files']});
  const context=await browser.newContext({deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:'light'}); const page=await context.newPage(); let errors=[];
  page.on('requestfailed',r=>errors.push(`Request failed: ${r.url()} ${r.failure()?.errorText}`)); page.on('pageerror',e=>errors.push(String(e.message))); page.on('console',m=>{if(m.type()==='error') errors.push(m.text());}); page.on('response',r=>{if(r.status()>=400) errors.push(`HTTP ${r.status()} ${r.url()}`);});
  await page.route(/^https?:\/\//,route=>route.abort('blockedbyclient'));
  for(const task of tasks) {
   errors=[]; const {view,size,state}=task; const file=path.join(output,`${view}-${state}-${size.name}.png`); let geometry={};
   try {
    await page.setViewportSize({width:size.width,height:size.height}); const url=new URL(pathToFileURL(entry).href); url.searchParams.set('view',view); if(view==='frames' && process.env.GAMIFICATION_FRAME_SIZE==='200') url.searchParams.set('frameSize','200');
    if(state==='empty-owned') url.searchParams.set('owned','empty'); if(state==='empty-board') url.searchParams.set('board','empty'); if(state==='public-long-name') url.searchParams.set('name','long'); if(['pending','error','success'].includes(state)) url.searchParams.set('fixtureAction',state);
    await page.goto(url.href,{waitUntil:'load',timeout:15000}); if(page.url()!==url.href) throw new Error(`Unexpected navigation: ${page.url()}`);
    if(fs.existsSync(path.join(path.dirname(entry),'fonts.css'))) await page.addStyleTag({path:path.join(path.dirname(entry),'fonts.css')});
    await page.waitForFunction(()=>document.querySelector('#root')?.textContent.trim().length>10); await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;})));});
    if(state==='switch') { const classic=page.getByRole('button',{name:'Orbit Zyx'}), laurel=page.getByRole('button',{name:'Samudra'}); if(await classic.getAttribute('aria-pressed')!=='true') throw new Error('Classic must initially be selected'); const preview=page.locator('section').filter({has:classic}).getByRole('img',{name:'Alya Putri'}).first(); const before=await preview.getAttribute('src'); await laurel.click(); if(await laurel.getAttribute('aria-pressed')!=='true'||await classic.getAttribute('aria-pressed')!=='false'||!before||await preview.getAttribute('src')!==before) throw new Error('Frame switch did not preserve the portrait or selection'); }
    if(['pending','error','success'].includes(state)) { await page.getByRole('button',{name:'Simpan preferensi',exact:true}).click(); if(state==='pending') { const saving=page.getByRole('button',{name:'Menyimpan…'}); await saving.waitFor(); if(!await saving.isDisabled()) throw new Error('Pending save is not disabled'); } else { const status=page.getByRole('status'); await status.waitFor(); const text=await status.textContent(); if(state==='success'?!text.includes('berhasil'):!text.includes('tidak dapat')) throw new Error(`Unexpected save status: ${text}`); } }
    if(state==='empty-owned' && await page.getByRole('button',{name:'Orbit Zyx'}).count()) throw new Error('Unexpected owned frame');
    geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,brokenImages:[...document.images].filter(img=>!img.complete||img.naturalWidth===0).map(img=>img.getAttribute('src'))}));
    await page.screenshot({path:file,fullPage:true,animations:'disabled',timeout:15000});
   } catch(e) { errors.push(String(e)); }
   sample(); results.push({view,state,viewport:size,file,errors:[...errors],...geometry,overflow:geometry.scrollWidth>geometry.width});
   fs.writeFileSync(path.join(output,'capture-results.json'),JSON.stringify({results,observedPeakRssMb:Math.round(peak/1024),elapsedSeconds:(Date.now()-started)/1000,source:'Local production components with fictional fixture data and mocked actions',fullNextApplicationVerified:false},null,2));
   console.log(JSON.stringify({view,state,viewport:size.name,errors:errors.length,file}));
  }
 } finally { clearInterval(sampler); if(browser) await browser.close(); }
 const failures=results.filter(r=>r.errors.length||r.overflow||r.brokenImages?.length); console.log(JSON.stringify({screenshots:results.length,failures:failures.length,observedPeakRssMb:Math.round(peak/1024),browserClosed:true})); process.exitCode=failures.length?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
