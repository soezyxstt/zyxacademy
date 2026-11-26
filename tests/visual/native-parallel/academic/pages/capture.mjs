// Local protected-page references. Run only against the disposable academic fixture.
import { chromium } from '@playwright/test';
import { fixtureCookie } from '../../../../../packages/native-parity/academic/local/cookie.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const origin = process.env.PARITY_PROTECTED_ORIGIN ?? 'http://127.0.0.1:3314';
if (!['http://127.0.0.1:3314','http://127.0.0.1:3315'].includes(origin)) {
 throw new Error('Use the loopback protected-page fixture on port 3314 or 3315');
}
const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(root, 'captures');
const adminCourse = '/admin/courses/biologi-dasar';
const tutorCourse = '/tutor/academic-course-1';
const canonicalAdminCourse = '/admin/courses/academic-course-1';
const quizId = 'academic-web-quiz-1';
const documentDetail = `${adminCourse}/documents/academic-web-document-1`;
const ideaId = 'academic-web-idea-1';
const productId = 'academic-web-product-1';
const quizTitle = 'Kuis Struktur Sel';
const ideaReview = `/admin/courses/fisika-dasar/review/idea/${ideaId}`;
const productReview = `${adminCourse}/review/product/${productId}`;
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
 ['admin-bundles-idea-alias','admin','/admin/bundles/idea','/admin/courses','Biologi Dasar'],
 ['admin-bundles-product-alias','admin','/admin/bundles/product','/admin/courses','Biologi Dasar'],
 ['admin-materials-manual-alias','admin','/admin/materials/manual','/admin/courses','Biologi Dasar'],
 ['admin-review-scoped-alias','admin','/admin/materials/review?courseId=biologi-dasar&section=idea',`${canonicalAdminCourse}/review`,'Buka review'],
 ['admin-quiz-analytics','admin',`${adminCourse}/analytics/${quizId}`,`${adminCourse}/analytics/${quizId}`,quizTitle],
 ['admin-course-leaderboard','admin',`${adminCourse}/leaderboard`,`${adminCourse}/leaderboard`,'Tidak ada data peringkat'],
 ['admin-quiz-new','admin',`${adminCourse}/quizzes/new`,`${adminCourse}/quizzes/new`,'Buat Kuis'],
 ['admin-quiz-edit','admin',`${adminCourse}/quizzes/${quizId}/edit`,`${adminCourse}/quizzes/${quizId}/edit`,'Edit Kuis'],
 ['admin-tryouts','admin',`${adminCourse}/tryouts`,`${adminCourse}/tryouts`,'Tryout ('],
 ['admin-videos','admin',`${adminCourse}/videos`,`${adminCourse}/videos`,'Belum ada playlist video'],
 ['tutor-course-discussions','tutor',`${tutorCourse}/discussions`,`${tutorCourse}/discussions`,'Belum ada pertanyaan'],
 ['tutor-discussions','tutor','/tutor/discussions','/tutor/discussions','Belum ada pertanyaan'],
 ['tutor-live-quiz','tutor',`${tutorCourse}/live`,`${tutorCourse}/live`,'Kuis langsung'],
 ['tutor-quiz-edit','tutor',`${tutorCourse}/quizzes/${quizId}/edit`,`${tutorCourse}/quizzes/${quizId}/edit`,'Edit Kuis'],
 ['tutor-quiz-attempts','tutor',`${tutorCourse}/quizzes/${quizId}/attempts`,`${tutorCourse}/quizzes/${quizId}/attempts`,'Belum ada data pengerjaan untuk kuis ini'],
 ['admin-document-detail','admin',documentDetail,documentDetail,'Membran sel memisahkan isi sel'],
 ['admin-idea-bundle','admin',ideaReview,ideaReview,'Kecepatan adalah perubahan posisi terhadap waktu'],
 ['admin-product-bundle','admin',productReview,productReview,'Struktur dan Fungsi Membran Sel'],
 ['admin-idea-bundle-alias','admin',`/admin/materials/review/idea/${ideaId}`,`/admin/courses/academic-course-2/review/idea/${ideaId}`,'Kecepatan adalah perubahan posisi terhadap waktu'],
 ['admin-product-bundle-alias','admin',`/admin/materials/review/product/${productId}`,`${canonicalAdminCourse}/review/product/${productId}`,'Struktur dan Fungsi Membran Sel'],
 ['missing-admin-document','admin','/admin/courses/biologi-dasar/documents/not-seeded','/admin/courses/biologi-dasar/documents/not-seeded',null],
 ['missing-idea-bundle','admin','/admin/courses/biologi-dasar/review/idea/not-seeded','/admin/courses/biologi-dasar/review/idea/not-seeded',null],
 ['missing-product-bundle','admin','/admin/courses/biologi-dasar/review/product/not-seeded','/admin/courses/biologi-dasar/review/product/not-seeded',null],
 ['missing-tutor-quiz','tutor','/tutor/academic-course-1/quizzes/not-seeded/edit','/tutor/academic-course-1/quizzes/not-seeded/edit',null],
];
const strictContentIds = new Set(['admin-analytics','admin-groups','tutor-quiz-grading','tutor-tryout-grading']);
const selected = new Set(process.argv.slice(2));
const requiredReads = {
 'admin-analytics': '/api/admin/quiz-insights',
 'admin-quiz-analytics': `/api/admin/quiz-insights/${quizId}`,
 'tutor-quiz-attempts': `/api/admin/quiz-insights/${quizId}/attempts`,
 'admin-idea-bundle': `/api/admin/bundles/idea/${ideaId}`,
 'admin-idea-bundle-alias': `/api/admin/bundles/idea/${ideaId}`,
 'admin-product-bundle': `/api/admin/bundles/product/${productId}`,
 'admin-product-bundle-alias': `/api/admin/bundles/product/${productId}`,
};
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
  const entry={id,role,path,expectedPath,expectedLabel:label,origin,cases:[],...(previous[id] ? {previousAttempts: [...(previous[id].previousAttempts ?? []), previous[id].cases]} : {})}; entries.push(entry); await save();
  for (const theme of ['light','dark']) {
   const item={theme};entry.cases.push(item);let ctx;
   try {
    ctx=await browser.newContext({viewport:{width:380,height:844},deviceScaleFactor:1,locale:'id-ID',timezoneId:'Asia/Jakarta',colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
    const [name,value]=fixtureCookie(role).split('=');await ctx.addCookies([{name,value,url:origin}]);
    await ctx.addInitScript(v=>localStorage.setItem('theme',v),theme);
    const page=await ctx.newPage();const blocked=[];const insightResponses=[];
    const requiredRead=requiredReads[id];
    const reviewRead=requiredRead?.includes('/bundles/product/') ? `${requiredRead}/review` : null;
    const waitForReadStatus=path=>page.waitForResponse(r=>new URL(r.url()).pathname===path,{timeout:180000}).then(r=>r.status(),()=>null);
    const readFinished=requiredRead ? waitForReadStatus(requiredRead) : null;
    const reviewFinished=reviewRead ? waitForReadStatus(reviewRead) : null;
    page.on('response', r=>{if(new URL(r.url()).pathname===requiredRead)insightResponses.push(r.status());});
    await page.route('**/*',route=>{const u=new URL(route.request().url()); if(u.origin===origin)return route.continue();blocked.push(u.origin);return route.abort();});
    const response=await page.goto(origin+path,{waitUntil:'commit',timeout:origin.endsWith(':3315')?180000:120000});
    item.status=response?.status() ?? null;
    if (expectedPath !== path) await page.waitForURL(u=>u.pathname===expectedPath,{timeout:45000,waitUntil:'commit'}).catch(()=>{});
    item.landed=new URL(page.url()).pathname;item.offOriginBlocked=[...new Set(blocked)];
    item.redirectChain=[];
    for(let request=response?.request().redirectedFrom();request;request=request.redirectedFrom()){
     const from=new URL(request.url());
     item.redirectChain.unshift(from.pathname+from.search);
    }
    if(label){
     item.expectedPathOk=item.landed===expectedPath;
     const found=page.getByText(label,{exact:false}).filter({visible:true}).first();
     const readStatus=readFinished && id!=='admin-analytics' && item.expectedPathOk ? await readFinished : null;
     const reviewStatus=reviewFinished && readStatus>=200 && readStatus<300 ? await reviewFinished : null;
     if(reviewRead)item.productReviewRead={path:reviewRead,status:reviewStatus};
     item.labelVisible=readStatus>=400||reviewStatus>=400 ? false : await found.waitFor({timeout:45000}).then(()=>true,()=>false);
     const landed = new URL(page.url());
     item.landed=landed.pathname;item.landedQuery=landed.search || undefined;
     const scopedAliasOk=id!=='admin-review-scoped-alias'||landed.searchParams.get('tab')==='idea';
     item.expectedPathOk=item.landed===expectedPath&&scopedAliasOk;
     if(new URL(path,origin).pathname!==expectedPath&&item.expectedPathOk&&item.status>=200&&item.status<300)
      item.redirectObserved=true;
     if(strictContentIds.has(id)) {
      item.contentReady=await page.waitForFunction((target)=>{
       const visible=el=>{const r=el.getBoundingClientRect();return r.width>0 && r.height>0 && getComputedStyle(el).visibility!=='hidden';};
       if(target==='tutor-quiz-grading'||target==='tutor-tryout-grading'){
        const surface=target==='tutor-quiz-grading'?'mobile-quiz-grading-queue':'mobile-tryout-grading-queue';
        const root=document.querySelector(`[data-surface="${surface}"]`);if(!root||!visible(root))return false;
        const empty=target==='tutor-quiz-grading'?'Tidak ada kuis yang menunggu penilaian':'Semua tugas telah dinilai';
        return root.innerText.includes(empty)||[...root.querySelectorAll('button[class*="min-h-11"]')].some(visible);
       }
       const tables=[...document.querySelectorAll('.admin-table')].filter(visible);
       return tables.some(table=>{
        if([...table.querySelectorAll('.animate-pulse,[role="status"]')].some(visible))return false;
        const t=table.innerText.trim();if(!t || /Memuat/i.test(t))return false;
        if(target==='admin-groups')return t.includes('Tidak ada kelompok belajar')||[...table.querySelectorAll('button.font-heading.font-bold')].some(visible);
        return t.includes('Tidak ada kuis yang ditemukan')||[...table.querySelectorAll('a[href]')].some(visible);
       });
      },id,{timeout:45000}).then(()=>true,()=>false);
      if(id==='admin-analytics'){
       item.insightsHttpStatuses=insightResponses;
       item.contentReady=item.contentReady && insightResponses.some(status=>status>=200 && status<300);
      }
      item.contentState=item.contentReady ? await page.evaluate(target=>{
       const el=target==='tutor-quiz-grading'?document.querySelector('[data-surface="mobile-quiz-grading-queue"]'):
        target==='tutor-tryout-grading'?document.querySelector('[data-surface="mobile-tryout-grading-queue"]'):
        [...document.querySelectorAll('.admin-table')].find(x=>x.getBoundingClientRect().height>0);
       const t=el?.innerText ?? '';return /Tidak ada kuis yang menunggu penilaian|Semua tugas telah dinilai|Tidak ada kuis yang ditemukan|Tidak ada kelompok belajar/.test(t)?'empty':'populated';
      },id) : 'shell-only or loading; expected content not observed';
     }
     if(requiredRead && id!=='admin-analytics'){
      item.requiredRead={path:requiredRead,statuses:insightResponses};
      item.contentReady=item.labelVisible&&insightResponses.some(status=>status>=200&&status<300)
       && (!reviewRead||(reviewStatus>=200&&reviewStatus<300));
      if(!item.contentReady)
       item.classification=readStatus>=400 ? `required detail read returned HTTP ${readStatus}`
        : reviewStatus>=400 ? `required product review read returned HTTP ${reviewStatus}`
        : 'shell-only or loading: expected detail content not observed';
     }
     item.pass=item.status>=200 && item.status<300 && item.expectedPathOk && item.labelVisible && (!(strictContentIds.has(id)||requiredRead)||item.contentReady);
     if(strictContentIds.has(id)&&!item.contentReady)item.classification='shell-only or loading: expected task content not observed';
     item.textExcerpt=(await page.locator('body').innerText()).slice(0,900);
     if(item.pass || (strictContentIds.has(id)&&!item.contentReady)){await page.evaluate(()=>document.fonts.ready);item.screenshot=`captures/${id}-${theme}${item.pass?'':'-shell-only'}.png`; await page.screenshot({path:resolve(root,item.screenshot),animations:'disabled',style:'nextjs-portal { display: none !important; }'});}
    }else{
     item.pass=false;item.notFoundVisible=await page.getByRole('heading',{name:'404',exact:true}).waitFor({timeout:30000}).then(()=>true,()=>false);
     item.classification=item.notFoundVisible ? (item.status===404?'unseeded/missing: HTTP 404 and 404 UI':'unseeded/missing: streamed HTTP '+item.status+' and 404 UI') : 'missing fixture: 404 UI not observed';
     item.textExcerpt=(await page.locator('body').innerText()).slice(0,500);
     if(item.notFoundVisible){await page.evaluate(()=>document.fonts.ready);item.screenshot=`captures/${id}-${theme}-404.png`;await page.screenshot({path:resolve(root,item.screenshot),animations:'disabled',style:'nextjs-portal { display: none !important; }'});}
    }
    console.log(id,theme,item.status,item.landed,item.pass ? 'PASS':item.classification ?? 'LABEL_OR_PATH_MISMATCH');
   } catch(e){item.pass=false; item.error=String(e).slice(0,500);console.log(id,theme,'ERROR',item.error.slice(0,130));}
   finally{if(ctx)await ctx.close();await save();}
   if(!item.pass&&!strictContentIds.has(id))break;
  }
 }
} finally {await browser.close();await save();}
