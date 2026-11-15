// Primary-only derived posters from real WebGL geometry. No image alteration.
const fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
const {chromium}=require('/data/home/.t3/runtime/versions/0.1.7/node_modules/playwright-core');
(async()=>{let browser;const dir='artifacts/visual-quality/cosmetics-studio-v39';const checks={};try{
browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files','--renderer-process-limit=1','--js-flags=--max-old-space-size=192']});
const page=await browser.newPage({viewport:{width:1536,height:864},reducedMotion:'reduce'}); const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(pathToFileURL(path.resolve('artifacts/visual-quality/cosmetics-studio-fixture-v39/index.html')).href);
const viewer=page.getByTestId('selected-mascot');await viewer.scrollIntoViewIfNeeded();await page.waitForSelector('canvas');
const clean=await page.addStyleTag({content:'* {background-color:transparent!important}'});
for(const key of ['komodo','jalak','harimau','orangutan','anoa','bekantan','cenderawasih','penyu','badak','elang']){await page.locator(`[data-mascot-id="zyra-avatar-${key}"]`).click();await viewer.scrollIntoViewIfNeeded();const canvas=viewer.locator('canvas');await canvas.focus();await page.keyboard.press('Home');await page.waitForTimeout(150);await canvas.screenshot({path:`public/gamification/collections/models/${key}-poster-v39.png`,omitBackground:true});}
await clean.evaluate(el=>el.remove());
await page.locator('[data-mascot-id="zyra-avatar-penyu"]').click();await viewer.scrollIntoViewIfNeeded();const canvas=viewer.locator('canvas');await canvas.focus();for(let i=0;i<21;i++)await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);await viewer.screenshot({path:`${dir}/penyu-back-desktop.png`});
await page.keyboard.press('Home');await page.mouse.move(100,100);const box=await canvas.boundingBox();await page.mouse.move(box.x+120,box.y+120);await page.mouse.down();await page.mouse.move(box.x+210,box.y+120,{steps:8});await page.mouse.up();await page.waitForTimeout(150);await viewer.screenshot({path:`${dir}/penyu-drag-desktop.png`});checks.keyboardAndPointerRendered=true;checks.errors=errors;if(errors.length)throw Error(errors.join(';'));}finally{await browser?.close();fs.writeFileSync(`${dir}/poster-capture.json`,JSON.stringify(checks,null,2));}})().catch(e=>{console.error(e.message);process.exitCode=1});
