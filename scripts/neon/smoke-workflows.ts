import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import * as s from "../../db/schema";
import { daysFrom } from "../../lib/date-utils";
import { assertTarget } from "./import-core";

assertTarget(process.env.DATABASE_URL || "", process.env.NEON_EXPECTED_HOST || "", process.env.NEON_EXPECTED_DATABASE || "");
assert.equal(process.env.NEON_BRANCH_ID, "br-cool-water-az2xxbul");
const share = new URL(process.env.NEON_HTTP_SHARE_URL || "");
assert.equal(share.origin, "https://zyx-neon-migration.vercel.app");
const id = `neon-workflow-${randomUUID()}`;
const outsiderId = `${id}-outsider`;
const templateId = `${id}-quiz`, questionId = `${id}-question`;
const results: Record<string, boolean> = {};
const cookies = new Map<string, string>();
let attemptId: string | undefined;
let oauthState: string | undefined;
let blueprintId: string | undefined;

async function request(path: string, body?: unknown) {
  let url = new URL(path, share.origin);
  if(body===undefined)for (const [key, value] of share.searchParams) url.searchParams.set(key, value);
  for(let redirect=0;redirect<6;redirect++) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST", redirect: "manual",
    headers: { cookie: [...cookies].map(([k,v])=>`${k}=${v}`).join("; "), origin: share.origin, ...(body === undefined ? {} : {"content-type":"application/json"}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  for (const header of response.headers.getSetCookie()) {
    const value = header.split(";",1)[0], index=value.indexOf("=");
    cookies.set(value.slice(0,index),value.slice(index+1));
  }
  if(body===undefined&&response.status>=300&&response.status<400) {
    const next=new URL(response.headers.get("location")!,url);
    assert.equal(next.origin,share.origin);
    assert.equal(next.pathname,new URL(path,share.origin).pathname);
    url=next;
    continue;
  }
  return response;
  }
  throw new Error("HTTP_REDIRECT_LOOP");
}

try {
  // Bootstrap only Vercel's protection cookie before sending any mutation.
  const bootstrap = await request("/api/auth/get-session");
  assert.equal(bootstrap.status,200);
  assert.equal((await request("/api/quiz/attempts",{})).status,401);
  results.anonymousWritesDenied=true;
  const [course]=await db.select({id:s.courses.id,canonicalId:s.mataKuliah.id}).from(s.courses)
    .innerJoin(s.mataKuliah,eq(s.mataKuliah.legacyCourseId,s.courses.id)).where(eq(s.mataKuliah.status,"active")).limit(1);
  assert.ok(course,"An active mapped course is required");
  const [role]=await db.select().from(s.peran).where(eq(s.peran.code,"murid"));
  assert.ok(role);
  const token=randomBytes(32).toString("hex");
  const outsiderToken=randomBytes(32).toString("hex");
  await db.transaction(async tx=>{
    await tx.insert(s.user).values({id,name:"Neon workflow fixture",email:`${id}@example.invalid`,role:"student"});
    await tx.insert(s.user).values({id:outsiderId,name:"Neon workflow outsider",email:`${outsiderId}@example.invalid`,role:"student"});
    await tx.insert(s.pengguna).values({id,status:"active"});
    await tx.insert(s.penggunaPeran).values({id:randomUUID(),penggunaId:id,peranId:role.id,source:"neon-rehearsal"});
    await tx.insert(s.pendaftaranMurid).values({id,penggunaId:id,mataKuliahId:course.canonicalId,status:"active",endAt:daysFrom(1)});
    await tx.insert(s.session).values({id,token,userId:id,expiresAt:daysFrom(1)});
    await tx.insert(s.session).values({id:outsiderId,token:outsiderToken,userId:outsiderId,expiresAt:daysFrom(1)});
    await tx.insert(s.aiQuestionBank).values({id:questionId,courseId:course.id,prompt:"What is 2 + 2?",options:["4","5"],correctIndices:[0],explanation:"2 + 2 = 4",reviewStatus:"published",quizEligible:true});
    await tx.insert(s.quizTemplates).values({id:templateId,courseId:course.id,title:"Neon workflow fixture",category:"chapter",status:"published",manualStatus:"open",selectionRules:{fixedQuestionIds:[questionId]},maxAttempts:1,timeLimitSeconds:60});
  });
  const signature=createHmac("sha256",process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
  cookies.set("__Secure-better-auth.session_token",encodeURIComponent(`${token}.${signature}`));
  assert.equal((await (await request("/api/auth/get-session")).json())?.user?.id,id);
  assert.ok([401,403].includes((await request("/api/admin/analytics")).status));
  results.studentAdminAccessDenied=true;
  assert.equal((await request("/api/quiz/attempts",{})).status,400);
  const started=await request("/api/quiz/attempts",{courseId:course.id,templateId});
  assert.equal(started.status,201,"Quiz start must succeed");
  const quiz=await started.json();
  attemptId=quiz.attemptId;
  assert.ok(attemptId);
  assert.equal(quiz.questions.length,1);
  assert.ok(!/correct_indices|correctIndices|acceptable_answers|explanation/.test(JSON.stringify(quiz.questions)),"Answer material must stay server-side");
  results.quizStartAndAnswerRedaction=true;
  const own=await request(`/api/quiz/attempts/${attemptId}`);
  assert.equal(own.status,200);
  const answer=quiz.questions[0].stable_option_ids?.[0] ?? 0;
  const submitted=await request(`/api/quiz/attempts/${attemptId}`,{answers:{[questionId]:answer},durationSeconds:1});
  assert.equal(submitted.status,200,"Quiz submission must succeed");
  const grade=await submitted.json();
  assert.equal(grade.score,100);
  assert.equal(grade.correct,1);
  const [stored]=await db.select().from(s.studentQuizAttempts).where(eq(s.studentQuizAttempts.id,attemptId));
  assert.equal(stored.status,"completed");
  assert.equal(stored.score,100);
  assert.ok(stored.submittedAt instanceof Date);
  const [canonical]=await db.select().from(s.percobaanAsesmen).where(eq(s.percobaanAsesmen.id,attemptId));
  assert.equal(canonical.status,"submitted");
  results.quizSubmitAndCanonicalMirror=true;
  assert.equal((await request(`/api/quiz/attempts/${attemptId}`,{answers:{}})).status,404);
  assert.equal((await request("/api/quiz/attempts",{courseId:course.id,templateId})).status,409);
  results.resubmitAndMaxAttemptsDenied=true;
  const outsiderSignature=createHmac("sha256",process.env.BETTER_AUTH_SECRET!).update(outsiderToken).digest("base64");
  cookies.set("__Secure-better-auth.session_token",encodeURIComponent(`${outsiderToken}.${outsiderSignature}`));
  assert.equal((await (await request("/api/auth/get-session")).json())?.user?.id,outsiderId);
  assert.equal((await request(`/api/quiz/attempts/${attemptId}`)).status,404);
  assert.equal((await request(`/api/quiz/attempts/${attemptId}`,{answers:{}})).status,404);
  results.otherStudentAttemptAccessDenied=true;
  cookies.delete("__Secure-better-auth.session_token");
  assert.equal((await request(`/api/quiz/attempts/${attemptId}`)).status,401);
  const oauth=await request("/api/auth/sign-in/social",{provider:"google",callbackURL:`${share.origin}/dashboard`});
  assert.equal(oauth.status,200,"Google OAuth initiation must succeed");
  const auth=await oauth.json();
  const authUrl=new URL(auth.url);
  oauthState=authUrl.searchParams.get("state") || undefined;
  assert.equal(authUrl.hostname,"accounts.google.com");
  assert.equal(authUrl.searchParams.get("redirect_uri"),`${share.origin}/api/auth/callback/google`);
  assert.equal(authUrl.searchParams.get("client_id"),process.env.GOOGLE_CLIENT_ID);
  results.googleOAuthInitiation=true;
  console.log(JSON.stringify({status:"passed",results,backgroundCompletionVerified:false,interactiveGoogleConsentVerified:false}));
} catch(error:any) {
  console.error(JSON.stringify({status:"failed",results,assertion:error?.name==="AssertionError"?error.message:undefined,code:error?.code}));
  process.exitCode=1;
} finally {
  const [assessment]=await db.select({blueprintId:s.asesmen.blueprintAsesmenId}).from(s.asesmen).where(eq(s.asesmen.id,templateId));
  blueprintId=assessment?.blueprintId;
  await db.transaction(async tx=>{
    await tx.delete(s.auditMutasi).where(eq(s.auditMutasi.actorId,id));
    if(attemptId)await tx.delete(s.percobaanAsesmen).where(eq(s.percobaanAsesmen.id,attemptId));
    await tx.delete(s.asesmen).where(eq(s.asesmen.id,templateId));
    if(blueprintId)await tx.delete(s.blueprintAsesmen).where(eq(s.blueprintAsesmen.id,blueprintId));
    await tx.delete(s.quizTemplates).where(eq(s.quizTemplates.id,templateId));
    await tx.delete(s.aiQuestionBank).where(eq(s.aiQuestionBank.id,questionId));
    await tx.delete(s.pendaftaranMurid).where(eq(s.pendaftaranMurid.penggunaId,id));
    await tx.delete(s.penggunaPeran).where(eq(s.penggunaPeran.penggunaId,id));
    await tx.delete(s.pengguna).where(eq(s.pengguna.id,id));
    await tx.delete(s.user).where(eq(s.user.id,id));
    await tx.delete(s.user).where(eq(s.user.id,outsiderId));
    if(oauthState)await tx.delete(s.verification).where(eq(s.verification.identifier,oauthState));
  });
  await db.$client.end();
}
