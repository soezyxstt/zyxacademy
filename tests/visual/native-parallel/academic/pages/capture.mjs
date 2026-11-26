// Local protected-page references. Run only against the disposable academic fixture.
import { chromium } from '@playwright/test';
import { fixtureCookie } from '../../../../../packages/native-parity/academic/local/cookie.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const origin = 'http://127.0.0.1:3314';
const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(root, 'captures');
const defs = [
 ['admin-groups','admin','/admin/groups','/admin/groups','Kelompok Belajar'],
 ['admin-schedules','admin','/admin/schedules','/admin/schedules','Jadwal & Kalender Akademik'],
 ['admin-users','admin','/admin/users','/admin/users','Pengguna'],
 ['admin-tokens','admin','/admin/tokens','/admin/tokens','Token Aktivasi'],
 ['admin-notifications','admin','/admin/notifications','/admin/notifications','Kirim Notifikasi'],
 ['admin-pka-registrations','admin','/admin/tutorial-pka/registrations','/admin/tutorial-pka/registrations','Pendaftar Tutorial PKA'],
 ['admin-pka-announcements','admin','/admin/tutorial-pka/announcements','/admin/tutorial-pka/announcements','Pengumuman Tutorial PKA'],
 ['admin-pka-schedules','admin','/admin/tutorial-pka/schedules','/admin/tutorial-pka/schedules','Jadwal Live Tutorial PKA'],
 ['admin-pka-alias','admin','/admin/tutorial-pka','/admin/tutorial-pka/registrations','Pendaftar Tutorial PKA'],
 ['admin-materials-alias','admin','/admin/materials','/admin/courses','Biologi Dasar'],
 ['admin-review-alias','admin','/admin/materials/review','/admin/courses','Biologi Dasar'],
 ['admin-authoring-alias','admin','/admin/authoring-context','/admin/courses','Biologi Dasar'],
 ['admin-review','admin','/admin/courses/biologi-dasar/review','/admin/courses/biologi-dasar/review','Source Pack + Idea'],
 ['admin-documents','admin','/admin/courses/biologi-dasar/documents','/admin/courses/biologi-dasar/documents','Dokumen'],
 ['admin-analytics','admin','/admin/courses/biologi-dasar/analytics','/admin/courses/biologi-dasar/analytics','Analitik'],
 ['admin-questions','admin','/admin/courses/biologi-dasar/questions','/admin/courses/biologi-dasar/questions','Soal'],
 ['admin-flashcards','admin','/admin/courses/biologi-dasar/flashcards','/admin/courses/biologi-dasar/flashcards','Flashcard'],
 ['admin-quizzes','admin','/admin/courses/biologi-dasar/quizzes','/admin/courses/biologi-dasar/quizzes','Kuis'],
 ['admin-results','admin','/admin/courses/biologi-dasar/results','/admin/courses/biologi-dasar/results','Hasil'],
 ['admin-settings','admin','/admin/courses/biologi-dasar/settings','/admin/courses/biologi-dasar/settings','Pengaturan'],
 ['tutor-schedule','tutor','/tutor/schedule','/tutor/schedule','Jadwal tutorial'],
 ['tutor-quizzes','tutor','/tutor/academic-course-1/quizzes','/tutor/academic-course-1/quizzes','Kelola kuis dan bank soal'],
 ['tutor-quiz-new','tutor','/tutor/academic-course-1/quizzes/new','/tutor/academic-course-1/quizzes/new','Kuis'],
 ['tutor-quiz-grading','tutor','/tutor/academic-course-1/quizzes/grading','/tutor/academic-course-1/quizzes/grading','Penilaian kuis'],
 ['tutor-tryout-grading','tutor','/tutor/academic-course-1/grading','/tutor/academic-course-1/grading','Penilaian tryout'],
 ['tutor-tryout-alias','tutor','/tutor/academic-course-1/tryouts','/tutor/academic-course-1','Biologi Dasar'],
 ['tutor-docs','tutor','/tutor/docs','/tutor/docs','Dokumentasi tutor'],
 ['tutor-doc-detail','tutor','/tutor/docs/ruang-kerja-tutor','/tutor/docs/ruang-kerja-tutor','Mengenal ruang kerja tutor'],
 ['tutor-materials','tutor','/tutor/academic-course-1/materials','/tutor/academic-course-1/materials','Materi'],
 ['tutor-videos','tutor','/tutor/academic-course-1/videos','/tutor/academic-course-1/videos','Video'],
 ['missing-admin-document','admin','/admin/courses/biologi-dasar/documents/not-seeded','/admin/courses/biologi-dasar/documents/not-seeded',null],
 ['missing-idea-bundle','admin','/admin/courses/biologi-dasar/review/idea/not-seeded','/admin/courses/biologi-dasar/review/idea/not-seeded',null],
 ['missing-product-bundle','admin','/admin/courses/biologi-dasar/review/product/not-seeded','/admin/courses/biologi-dasar/review/product/not-seeded',null],
 ['missing-tutor-quiz','tutor','/tutor/academic-course-1/quizzes/not-seeded/edit','/tutor/academic-course-1/quizzes/not-seeded/edit',null],
];
const selected = new Set(process.argv.slice(2));
let entries = [];
let previous = {};
if (selected.size) {
 try { const data = JSON.parse(await readFile(resolve(root, 'results.json'), 'utf8')).entries; previous = Object.fromEntries(data.filter(item => selected.has(item.id)).map(item => [item.id, item])); entries = data.filter(item => !selected.has(item.id)); } catch {}
}
await mkdir(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.PARITY_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium',headless:true});
async function save(){await writeFile(resolve(root,'results.json'),JSON.stringify({origin,observedAt:new Date().toISOString(),viewport:{width:380,height:844,dpr:1},entries},null,2)+'\n');}
try {
 for (const [id,role,path,expectedPath,label] of defs) {
  if (selected.size && !selected.has(id)) continue;
  const entry={id,role,path,expectedPath,expectedLabel:label,cases:[],...(previous[id] ? {previousAttempts: [...(previous[id].previousAttempts ?? []), previous[id].cases]} : {})}; entries.push(entry); await save();
  for (const theme of ['light','dark']) {
   const item={theme};entry.cases.push(item);let ctx;
   try {
    ctx=await browser.newContext({viewport:{width:380,height:844},deviceScaleFactor:1,locale:'id-ID',timezoneId:'Asia/Jakarta',colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
    const [name,value]=fixtureCookie(role).split('=');await ctx.addCookies([{name,value,url:origin}]);
    await ctx.addInitScript(v=>localStorage.setItem('theme',v),theme);
    const page=await ctx.newPage();const blocked=[];
    await page.route('**/*',route=>{const u=new URL(route.request().url()); if(u.origin===origin)return route.continue();blocked.push(u.origin);return route.abort();});
    const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:90000});
    item.status=response?.status() ?? null;
    if (expectedPath !== path) await page.waitForURL(u=>u.pathname===expectedPath,{timeout:45000}).catch(()=>{});
    item.landed=new URL(page.url()).pathname;item.offOriginBlocked=[...new Set(blocked)];
    await page.evaluate(()=>document.fonts.ready);
    if(label){
     item.expectedPathOk=item.landed===expectedPath;
     const found=page.getByText(label,{exact:false}).filter({visible:true}).first();
     item.labelVisible=await found.waitFor({timeout:30000}).then(()=>true,()=>false);
     item.landed=new URL(page.url()).pathname;item.expectedPathOk=item.landed===expectedPath;
     item.pass=item.status>=200 && item.status<300 && item.expectedPathOk && item.labelVisible;
     item.textExcerpt=(await page.locator('body').innerText()).slice(0,900);
     if(item.pass){item.screenshot=`captures/${id}-${theme}.png`; await page.screenshot({path:resolve(root,item.screenshot),animations:'disabled',style:'nextjs-portal { display: none !important; }'});}
    }else{
     item.pass=false;item.notFoundVisible=await page.getByRole('heading',{name:'404',exact:true}).waitFor({timeout:30000}).then(()=>true,()=>false);
     item.classification=item.notFoundVisible ? (item.status===404?'unseeded/missing: HTTP 404 and 404 UI':'unseeded/missing: streamed HTTP '+item.status+' and 404 UI') : 'missing fixture: 404 UI not observed';
     item.textExcerpt=(await page.locator('body').innerText()).slice(0,500);
     if(item.notFoundVisible){item.screenshot=`captures/${id}-${theme}-404.png`;await page.screenshot({path:resolve(root,item.screenshot),animations:'disabled',style:'nextjs-portal { display: none !important; }'});}
    }
    console.log(id,theme,item.status,item.landed,item.pass ? 'PASS':item.classification ?? 'LABEL_OR_PATH_MISMATCH');
   } catch(e){item.pass=false; item.error=String(e).slice(0,500);console.log(id,theme,'ERROR',item.error.slice(0,130));}
   finally{if(ctx)await ctx.close();await save();}
   if(!item.pass)break;
  }
 }
} finally {await browser.close();await save();}
