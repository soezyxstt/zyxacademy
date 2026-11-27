// Read-only browser interactions against the running synthetic local fixture.
import { chromium } from '@playwright/test';
import { fixtureCookie } from '../../../../../packages/native-parity/academic/local/cookie.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const origin='http://127.0.0.1:3314'; const root=dirname(fileURLToPath(import.meta.url));
const defs=[
 ['admin-groups-create','admin','/admin/groups','Buat kelompok','Buat kelompok belajar baru'],
 ['admin-tokens-create','admin','/admin/tokens','Buat token','Buat token'],
 ['admin-pka-draft','admin','/admin/tutorial-pka/announcements','__fill_title__','Judul'],
 ['admin-pka-schedule-create','admin','/admin/tutorial-pka/schedules','Tambah jadwal','Tambah jadwal baru'],
 ['tutor-schedule-create','tutor','/tutor/schedule','Tambah slot','Tambah slot'],
 ['tutor-quiz-bank','tutor','/tutor/academic-course-1/quizzes','__quiz_bank__','Bank Soal Kosong'],
 ['admin-review-product','admin','/admin/courses/biologi-dasar/review','__product_tab__','Produk'],
];
const selected=new Set(process.argv.slice(2));let entries=[];let previous={};if(selected.size){try{const data=JSON.parse(await readFile(resolve(root,'interactions-results.json'),'utf8')).entries;previous=Object.fromEntries(data.filter(x=>selected.has(x.id)).map(x=>[x.id,x]));entries=data.filter(x=>!selected.has(x.id));}catch{}} await mkdir(resolve(root,'captures'),{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PARITY_CHROMIUM_EXECUTABLE??'/usr/bin/chromium'});
try {
 for(const [id,role,path,button,label] of defs){
  if(selected.size&&!selected.has(id))continue;
  const row={id,role,path,button,expectedStateLabel:label,...(previous[id]?{previousAttempt:previous[id]}:{})};entries.push(row);let ctx;
  try {
   ctx=await browser.newContext({viewport:{width:380,height:844},deviceScaleFactor:1,locale:'id-ID',timezoneId:'Asia/Jakarta',colorScheme:'dark',reducedMotion:'reduce',serviceWorkers:'block'});
   const [name,value]=fixtureCookie(role).split('=');await ctx.addCookies([{name,value,url:origin}]);
   await ctx.addInitScript(()=>localStorage.setItem('theme','dark'));
   const page=await ctx.newPage();const blocked=[];
   await page.route('**/*',route=>{const u=new URL(route.request().url()); if(u.origin===origin)return route.continue();blocked.push(u.origin);return route.abort();});
   const res=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:90000});row.status=res?.status();row.landed=new URL(page.url()).pathname;
   if(!res?.ok()||row.landed!==path)throw new Error('Unexpected navigation or HTTP status');
   await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});await page.waitForTimeout(1000);
   if(button==='__product_tab__'){const tab=page.getByRole('tab',{name:'Produk',exact:true});await tab.click({timeout:15000});row.labelVisible=(await tab.getAttribute('aria-selected'))==='true';}
   else if(button==='__quiz_bank__'){await page.getByRole('tab',{name:'Bank Soal',exact:true}).click({timeout:15000});row.labelVisible=await page.getByText(label,{exact:false}).first().isVisible();}
   else if(button==='__fill_title__'){await page.locator('#pka-ann-title').fill('Judul akademik');row.labelVisible=(await page.locator('#pka-ann-title').inputValue())==='Judul akademik';}
   else {await page.getByRole('button',{name:button,exact:true}).first().click({timeout:15000});const dialog=page.getByRole('dialog');await dialog.waitFor({timeout:10000});row.labelVisible=await dialog.getByText(label,{exact:false}).first().isVisible();}
   if(!row.labelVisible)throw new Error('Expected interaction state missing');
   await page.evaluate(()=>document.fonts.ready);row.screenshot=`captures/${id}-interaction-dark.png`;await page.screenshot({path:resolve(root,row.screenshot),animations:'disabled',style:'nextjs-portal { display: none !important; }'});
   row.offOriginBlocked=[...new Set(blocked)];row.pass=true;
  }catch(e){row.pass=false;row.error=String(e).slice(0,500);}
  finally{if(ctx)await ctx.close();await writeFile(resolve(root,'interactions-results.json'),JSON.stringify({origin,observedAt:new Date().toISOString(),entries},null,2)+'\n');}
  console.log(id,row.pass?'PASS':row.error);
 }
}finally{await browser.close();}
