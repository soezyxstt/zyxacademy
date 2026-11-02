import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { zipSync } from "fflate";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import * as s from "../../db/schema";
import { storage } from "../../lib/storage";
import { buildProductVerificationKey } from "../../lib/storage/keys";
import { daysFrom } from "../../lib/date-utils";
import { buildLocalVerificationFixture } from "../authoring/local-verification-fixture";
import { computeProductBundleChecksum, deterministicProductSerialization, validateProductBundle } from "../../lib/bundle/product-validator";
import { finalizeProductBundleDraft } from "../../lib/bundle/product-draft";
import { requestProductV4Verification, getProductV4Verification } from "../../lib/bundle/product-v4-verification-service";
import { PEDAGOGIC_CRITERION_IDS } from "../../lib/materials/quality-policy";
import { assertTarget } from "./import-core";

process.env.NODE_ENV = "production";
assertTarget(process.env.DATABASE_URL!, process.env.NEON_EXPECTED_HOST!, process.env.NEON_EXPECTED_DATABASE!);
assert.equal(process.env.NEON_BRANCH_ID, "br-cool-water-az2xxbul");
assert.equal(process.env.INNGEST_ENV, "neon-migration");
const share = new URL(process.env.NEON_HTTP_SHARE_URL!);
assert.equal(share.origin, "https://zyx-neon-migration.vercel.app");
const cleanupOnly = process.argv.includes("--cleanup-only");
const resume = cleanupOnly || process.argv.includes("--resume") ? JSON.parse(readFileSync("artifacts/neon-migration/authoring-workflow-pending.json", "utf8")) : null;
const id = resume?.id ?? `neon-authoring-${randomUUID()}`, users = [`${id}-author`, `${id}-reviewer`];
assert.match(id, /^neon-authoring-[a-f0-9-]{36}$/);
if (resume) process.env.NEXT_PUBLIC_V4_WEB_RUNTIME = readFileSync("lib/compute/product-v4-build-runtime.json", "utf8");
const original = buildLocalVerificationFixture().bundle;
const aliases = new Map<string, string>([[original.manifest.courseId, id], [original.manifest.creatorId, users[0]], [original.manifest.curatorId!, users[1]]]);
for (const product of original.products) {
  aliases.set(product.id, `${id}-${product.productType}`);
  if (product.chapterId) aliases.set(product.chapterId, `${id}-chapter`);
  for (const idea of product.ideaLinks) aliases.set(idea.id, `${id}-${idea.id}`);
  for (const source of product.sourceRefs) { aliases.set(source.sourceId, `${id}-${source.sourceId}`); for (const excerpt of source.excerptIds) aliases.set(excerpt, `${id}-${excerpt}`); }
  if (product.productType === "article") for (const section of product.sections) {
    aliases.set(section.id, `${id}-${section.id}`);
    if (section.learningSectionId) aliases.set(section.learningSectionId, `${id}-${section.learningSectionId}`);
    for (const block of section.blocks) aliases.set(block.id, `${id}-${block.id}`);
  }
}
function remap<T>(value: T): T {
  let text = JSON.stringify(value);
  for (const [from, to] of [...aliases].sort((a,b) => b[0].length-a[0].length)) text = text.replaceAll(from, to);
  return JSON.parse(text);
}
const products = remap(original.products), dependencies = remap(original.dependencies);
const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const files = new Map([["products.json", encode(products)], ["dependencies.json", encode(dependencies)]]);
const base = { ...original.manifest, bundleChecksum: undefined, bundleId: id, courseId: id, creatorId: users[0], curatorId: users[1], entityFiles: [
  { path: "products.json", entityType: "products" as const, checksum: sha(files.get("products.json")!), stableIds: products.map(product => product.id) },
  { path: "dependencies.json", entityType: "dependencies" as const, checksum: sha(files.get("dependencies.json")!), stableIds: dependencies.map(dependency => dependency.id) },
] };
files.set("manifest.json", encode({ ...base, bundleChecksum: computeProductBundleChecksum(base, files) }));
const validation = validateProductBundle(zipSync(Object.fromEntries(files)));
assert.ok(validation.success, "Synthetic authoring fixture must validate");
const finalized = finalizeProductBundleDraft(validation.data, { products: [...validation.data.products] });
const article = finalized.bundle.products.find(product => product.productType === "article")!;
const diktat = finalized.bundle.products.find(product => product.productType === "diktat")!;
assert.equal(article.productType, "article");
const cookies = new Map<string, string>(), tokens = new Map<string, string>();
let importId: string | undefined, planHash: string | undefined, stage = "seed", verificationSent = false, verificationComplete = false, seeded = false, terminalRunId: string | undefined;
const ownedObjects = new Set<string>();

async function request(path: string, init: RequestInit = {}, redirects = 0): Promise<Response> {
  assert.ok(redirects < 6, "Protection redirect limit exceeded");
  const url = new URL(path, share.origin);
  if (!init.method && redirects === 0) for (const [key,value] of share.searchParams) url.searchParams.set(key,value);
  const response = await fetch(url, { ...init, redirect: "manual", headers: { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; "), origin: share.origin, "x-correlation-id": id, ...init.headers }, signal: AbortSignal.timeout(60000) });
  for (const header of response.headers.getSetCookie()) { const pair = header.split(";",1)[0], i=pair.indexOf("="); cookies.set(pair.slice(0,i),pair.slice(i+1)); }
  if (!init.method && response.status >= 300 && response.status < 400) { const next=new URL(response.headers.get("location")!,url); assert.equal(next.origin,share.origin); return request(next.pathname+next.search,init,redirects+1); }
  return response;
}
function actor(userId: string) { const token=tokens.get(userId)!; const signature=createHmac("sha256",process.env.BETTER_AUTH_SECRET!).update(token).digest("base64"); cookies.set("__Secure-better-auth.session_token",encodeURIComponent(`${token}.${signature}`)); }
async function json(path: string, method: string, body?: unknown) { return request(path,{method,headers:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)}); }

try {
  if (cleanupOnly) {
    const proof = JSON.parse(readFileSync("artifacts/neon-migration/authoring-workflow.json", "utf8"));
    assert.equal(proof.status, "passed"); assert.ok(proof.terminalRunId);
    const response = await fetch(`https://api.inngest.com/v2/runs/${proof.terminalRunId}`, { headers: { Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": "neon-migration" } });
    assert.equal(response.status, 200); assert.equal((await response.json()).data.status, "COMPLETED");
    importId = resume.importId; planHash = resume.planHash; seeded = true; verificationSent = true; verificationComplete = true;
    assert.equal(resume.articleId, article.id); assert.equal(resume.diktatId, diktat.id);
    for (const key of resume.sourceKeys) ownedObjects.add(key);
  } else {
  if (!resume) {
  await db.transaction(async tx => {
    assert.equal((await tx.select().from(s.courses).where(eq(s.courses.id,id))).length,0);
    const [adminRole] = await tx.select().from(s.peran).where(eq(s.peran.code,"admin")); assert.ok(adminRole);
    for(const userId of users) {
      await tx.insert(s.user).values({id:userId,name:"Synthetic authoring fixture",email:`${userId}@example.invalid`,emailVerified:true,role:"admin"});
      await tx.insert(s.pengguna).values({id:userId,status:"active"});
      await tx.insert(s.penggunaPeran).values({id:userId,penggunaId:userId,peranId:adminRole.id,source:"neon-rehearsal"});
      const token=randomUUID(); tokens.set(userId,token); await tx.insert(s.session).values({id:userId,userId,token,expiresAt:daysFrom(1)});
    }
    await tx.insert(s.courses).values({id,title:"Synthetic authoring fixture",category:"Test"});
    await tx.insert(s.mataKuliah).values({id,code:id,title:"Synthetic authoring fixture",legacyCourseId:id});
    await tx.insert(s.bab).values({id:article.chapterId!,mataKuliahId:id,code:"FIXTURE",title:"Synthetic chapter",orderIndex:1});
    for(const idea of article.ideaLinks) await tx.insert(s.ide).values({id:idea.id,mataKuliahId:id,babId:article.chapterId!,stableKey:idea.id,code:idea.id,canonicalStatement:"Synthetic limit statement",conciseExplanation:"Synthetic explanation",semanticHash:idea.semanticHash,generationHash:idea.semanticHash,version:idea.version,status:"published",creatorId:users[0]});
    for(const source of article.sourceRefs) {
      await tx.insert(s.sumberMateri).values({id:source.sourceId,mataKuliahId:id,title:"Synthetic source",canonicalUriOrR2Key:`fixture/${source.sourceId}`,checksum:source.checksum,version:source.version,status:"active",creatorId:users[0]});
      for(const[index,excerpt]of source.excerptIds.entries()) await tx.insert(s.potonganSumber).values({id:excerpt,sumberMateriId:source.sourceId,sourceVersion:source.version,content:"Synthetic source excerpt",startOffset:index*20,endOffset:index*20+14,checksum:source.checksum});
    }
    if(article.productType==="article") for(const[index,section]of article.sections.entries()) if(section.learningSectionId) await tx.insert(s.bagianPembelajaran).values({id:section.learningSectionId,mataKuliahId:id,babId:article.chapterId!,stableKey:section.learningSectionId,title:section.title,slug:section.slug,orderIndex:index,learningObjective:section.learningObjective});
  }); seeded=true;
  actor(users[0]); await request("/sign-in");
  stage="invalid-upload";
  const invalid=new FormData(); invalid.set("file",new File(["not a bundle"],"invalid.zip"));
  assert.equal((await request("/api/admin/bundles/product",{method:"POST",body:invalid})).status,422);
  stage="upload-and-stage";
  const form=new FormData();form.set("file",new File([new Uint8Array(finalized.bytes).buffer],"synthetic-v4.zip",{type:"application/zip"}));form.set("intent","stage");form.set("draft",JSON.stringify({products:finalized.bundle.products}));
  const staged=await request("/api/admin/bundles/product",{method:"POST",body:form});assert.equal(staged.status,201);const result=(await staged.json()).result;importId=result.importId;assert.ok(importId);ownedObjects.add(result.sourceKey);
  stage="stale-edit-recovery";
  const draft={products:finalized.bundle.products};
  assert.equal((await json(`/api/admin/bundles/product/${importId}`,"PUT",{draft,expectedRevision:"0".repeat(64)})).status,409);
  assert.equal((await json(`/api/admin/bundles/product/${importId}`,"PUT",{draft,expectedRevision:result.checksum})).status,200);
  stage="publication-gate";
  assert.equal((await json(`/api/admin/bundles/product/${importId}/publish`,"POST")).status,422);
  assert.equal((await db.select().from(s.artikel).where(eq(s.artikel.id,article.id))).length,0);
  } else {
    importId = resume.importId; planHash = resume.planHash;
    assert.equal(resume.articleId, article.id); assert.equal(resume.diktatId, diktat.id);
    for (const key of resume.sourceKeys) ownedObjects.add(key);
    for (const session of await db.select().from(s.session).where(inArray(s.session.userId, users))) tokens.set(session.userId, session.token);
    assert.equal(tokens.size, 2); seeded = true; verificationSent = true;
    actor(users[0]); await request("/sign-in");
  }
  assert.ok(importId, "Owned staged import is required");
  stage="request-verification";
  let current=await requestProductV4Verification({importId,runId:id});planHash=current.plan.planHash;verificationSent=true;
  writeFileSync("artifacts/neon-migration/authoring-workflow-pending.json",JSON.stringify({id,users,importId,planHash,sourceKeys:[...ownedObjects],articleId:article.id,diktatId:diktat.id}));
  for(let attempt=0;attempt<360;attempt++) {
    current=await getProductV4Verification({importId,runId:id,planHash});
    if(current.state.status==="complete") break;
    if(current.state.status==="failed"||current.state.status==="stale") { console.log(JSON.stringify({verificationState:current.state.status,failureCode:current.state.failureCode,completed:current.state.completedChecks,total:current.state.totalChecks}));break; }
    if(attempt%6===0)console.log(JSON.stringify({verificationState:current.state.status,completed:current.state.completedChecks,total:current.state.totalChecks}));
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  writeFileSync("artifacts/neon-migration/authoring-verification-result.json",JSON.stringify(current));
  assert.equal(current.evaluation.ready,true,"Real worker verification must be ready");
  stage="worker-terminal-state";
  const apiHeaders={Authorization:`Bearer ${process.env.INNGEST_SIGNING_KEY}`,"X-Inngest-Env":"neon-migration"};
  const [row]=await db.select({createdAt:s.imporBundle.createdAt}).from(s.imporBundle).where(eq(s.imporBundle.id,importId));
  const listed=await fetch("https://api.inngest.com/v2/apps/zyx-academy/functions/product-v4-verification/runs?limit=100",{headers:apiHeaders});assert.equal(listed.status,200);
  const candidates=(await listed.json()).data.filter((run:{queuedAt:string})=>Date.parse(run.queuedAt)>=row.createdAt.getTime());
  assert.equal(candidates.length,1,"Exactly one verification run must belong to the owned import window");terminalRunId=candidates[0].id;
  for(let attempt=0;attempt<40;attempt++) {
    const response=await fetch(`https://api.inngest.com/v2/runs/${terminalRunId}`,{headers:apiHeaders});assert.equal(response.status,200);const run=(await response.json()).data;
    if(["COMPLETED","FAILED","CANCELLED"].includes(run.status)) {verificationComplete=true;assert.equal(run.status,"COMPLETED");break;}
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  assert.equal(verificationComplete,true,"Retain fixture until worker termination is confirmed");
  stage="review";actor(users[1]);
  const detail=await(await request(`/api/admin/bundles/product/${importId}`)).json();const context=detail.v4ReviewContext;assert.equal(context.verificationReady,true);
  const review={decision:"approved",expectedRevision:context.expectedRevision,policyVersion:context.policyVersion,contentFingerprint:context.contentFingerprint,verificationPlanHash:context.verificationPlanHash,verificationReceiptSignature:context.verificationReceiptSignature,sectionDecisions:context.sections.map((section:{sectionId:string;semanticHash:string})=>({sectionId:section.sectionId,semanticHash:section.semanticHash,decision:"approved"})),criteria:PEDAGOGIC_CRITERION_IDS.map(criterionId=>({criterionId,status:"met",contentAnchors:[{targetType:"document",targetId:article.id}],reason:"Synthetic workflow fixture review"})),exceptions:[]};
  const reviewed=await json(`/api/admin/bundles/product/${importId}/review`,"POST",review);assert.equal(reviewed.status,200);
  stage="publish";const published=await json(`/api/admin/bundles/product/${importId}/publish`,"POST");assert.equal(published.status,200);assert.equal((await published.json()).result.published,true);
  assert.equal((await db.select().from(s.artikel).where(eq(s.artikel.id,article.id)))[0].status,"published");
  assert.equal((await db.select().from(s.diktatMateri).where(eq(s.diktatMateri.id,diktat.id)))[0].status,"published");
  stage="download";const pdf=await request(`/api/admin/bundles/product/${importId}/pdf?download=1`);assert.equal(pdf.status,200);assert.match(pdf.headers.get("content-type")??"",/application\/pdf/);const bytes=Buffer.from(await pdf.arrayBuffer());assert.ok(bytes.subarray(0,5).toString()==="%PDF-");
  const evidence={status:"passed",invalidUploadRejected:true,staleEditRejectedAndRecovered:true,prematurePublicationBlocked:true,realWorkerVerification:true,verifiedChecks:current.receipt?.results.length,terminalRunId,review:true,published:true,pdfDownload:true,pdfBytes:bytes.length};writeFileSync("artifacts/neon-migration/authoring-workflow.json",JSON.stringify(evidence));console.log(JSON.stringify(evidence));
  }
} catch(error) { console.error(JSON.stringify({status:"failed",stage,message:error instanceof assert.AssertionError?error.message:error instanceof Error&&/^[A-Z][A-Z_]+$/.test(error.message)?error.message:"AUTHORING_SMOKE_FAILED"}));process.exitCode=1;
} finally {
  if(seeded&&(!verificationSent||verificationComplete)) {
    if(importId) for(const row of await db.select().from(s.buktiPdfBundle).where(eq(s.buktiPdfBundle.imporBundleId,importId))) if(row.storageKey)ownedObjects.add(row.storageKey);
    if(planHash&&storage.list) {const prefix=buildProductVerificationKey(planHash).replace(/manifest\.json$/,"");for(const object of await storage.list(prefix))ownedObjects.add(object.key);}
    for(const key of ownedObjects)await storage.delete(key);
    await db.transaction(async tx=>{
      await tx.delete(s.auditMutasi).where(inArray(s.auditMutasi.actorId,users));
      if(importId) {
        await tx.delete(s.publikasiBundle).where(eq(s.publikasiBundle.imporBundleId,importId));
        await tx.delete(s.reviewBundle).where(eq(s.reviewBundle.imporBundleId,importId));
        await tx.delete(s.imporBundle).where(eq(s.imporBundle.id,importId));
      }
      await tx.delete(s.artikel).where(eq(s.artikel.id,article.id));await tx.delete(s.diktatMateri).where(eq(s.diktatMateri.id,diktat.id));
      await tx.delete(s.ketergantunganProduk).where(inArray(s.ketergantunganProduk.downstreamEntityId,[article.id,diktat.id]));
      await tx.delete(s.ide).where(eq(s.ide.mataKuliahId,id));
      await tx.delete(s.bagianPembelajaran).where(eq(s.bagianPembelajaran.mataKuliahId,id));
      for(const source of article.sourceRefs) await tx.delete(s.potonganSumber).where(eq(s.potonganSumber.sumberMateriId,source.sourceId));
      await tx.delete(s.sumberMateri).where(eq(s.sumberMateri.mataKuliahId,id));
      await tx.delete(s.bab).where(eq(s.bab.mataKuliahId,id));
      await tx.delete(s.mataKuliah).where(eq(s.mataKuliah.id,id));await tx.delete(s.courses).where(eq(s.courses.id,id));
      await tx.delete(s.pengguna).where(inArray(s.pengguna.id,users));await tx.delete(s.user).where(inArray(s.user.id,users));
    });
    assert.equal((await db.select().from(s.user).where(inArray(s.user.id,users))).length,0);
    if(importId)assert.equal((await db.select().from(s.imporBundle).where(eq(s.imporBundle.id,importId))).length,0);
    for(const key of ownedObjects)assert.equal(await storage.exists(key),false);
    const proof=JSON.parse(readFileSync("artifacts/neon-migration/authoring-workflow.json","utf8"));
    writeFileSync("artifacts/neon-migration/authoring-workflow.json",JSON.stringify({...proof,fixtureCleanup:"passed",ownedObjectsAbsent:ownedObjects.size}));
    console.log(JSON.stringify({fixtureCleanup:"passed",ownedObjectsAbsent:ownedObjects.size}));
  } else if(seeded)console.log(JSON.stringify({fixtureRetainedForInFlightJob:true}));
  await db.$client.end();
}
