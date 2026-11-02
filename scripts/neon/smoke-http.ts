import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertTarget } from "./import-core";
import { daysFrom } from "../../lib/date-utils";
import { storage } from "../../lib/storage";

assertTarget(process.env.DATABASE_URL || "", process.env.NEON_EXPECTED_HOST || "", process.env.NEON_EXPECTED_DATABASE || "");
assert.equal(process.env.NEON_BRANCH_ID, "br-cool-water-az2xxbul");
const share = new URL(process.env.NEON_HTTP_SHARE_URL || "");
assert.equal(share.origin, "https://zyx-neon-migration.vercel.app");
const client = new Client({ connectionString: process.env.DATABASE_URL });
const sessions: string[] = [];
const results: Array<{role:string;path:string;status:number}> = [];

async function request(path: string, appCookie = "") {
  let url = new URL(path, share.origin);
  for (const [key,value] of share.searchParams) url.searchParams.set(key,value);
  const cookies = new Map<string,string>();
  if(appCookie) cookies.set(appCookie.split("=",1)[0], appCookie.slice(appCookie.indexOf("=")+1));
  for(let redirect=0;redirect<6;redirect++) {
    const response=await fetch(url,{headers:{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join("; ")},redirect:"manual",signal:AbortSignal.timeout(60000)});
    for(const header of response.headers.getSetCookie()) {
      const value=header.split(";",1)[0]; const index=value.indexOf("=");
      cookies.set(value.slice(0,index),value.slice(index+1));
    }
    if(response.status>=300&&response.status<400) {
      const next=new URL(response.headers.get("location") || "", url);
      assert.equal(next.origin,share.origin,"Unexpected external redirect");
      assert.equal(next.pathname,new URL(path,share.origin).pathname,"Unexpected route redirect");
      url=next; continue;
    }
    return response;
  }
  throw new Error("HTTP_REDIRECT_LOOP");
}

try {
  await client.connect();
  assert.equal((await request("/api/admin/analytics")).status,401,"Anonymous admin API access must be denied");
  const objectKey=`migration/smoke/http-${randomUUID()}.txt`;
  const objectBody="Zyx isolated HTTP storage verification";
  await storage.upload(Buffer.from(objectBody),"smoke.txt","text/plain",{key:objectKey});
  const objectResponse=await request(`/api/storage/file/${objectKey}`);
  assert.equal(objectResponse.status,200);
  assert.equal(await objectResponse.text(),objectBody);
  for(const [role,paths] of Object.entries({public:["/","/blog"],admin:["/admin","/admin/users","/admin/courses","/admin/questions","/admin/schedules","/api/admin/analytics","/api/admin/questions"],tutor:["/tutor","/tutor/schedule"],murid:["/dashboard","/courses","/dashboard/schedule"]})) {
    let cookie="";
    if(role!=="public") {
      const selected=await client.query("SELECT p.id FROM public.pengguna p JOIN public.pengguna_peran pp ON pp.pengguna_id=p.id JOIN public.peran r ON r.id=pp.peran_id WHERE p.status='active' AND r.code=$1 ORDER BY p.id LIMIT 1",[role]);
      assert.equal(selected.rowCount,1,`No fixture identity for ${role}`);
      const id=randomUUID(),token=randomBytes(32).toString("hex");
      await client.query('INSERT INTO public.session (id, token, user_id, expires_at) VALUES ($1,$2,$3,$4)',[id,token,selected.rows[0].id,daysFrom(1)]);
      sessions.push(id);
      const signature=createHmac("sha256",process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
      cookie=`__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
      const session=await request("/api/auth/get-session",cookie);
      assert.equal(session.status,200);
      const data=await session.json();
      assert.equal(data?.user?.id,selected.rows[0].id,`Session lookup failed for ${role}`);
    }
    for(const path of paths) {
      const response=await request(path,cookie);
      results.push({role,path,status:response.status});
      assert.equal(response.status,200,`HTTP check failed for ${role} ${path}`);
      const body=await response.text();
      assert.ok(!body.includes('NEXT_HTTP_ERROR_FALLBACK;500')&&!body.includes('data-next-error'),`Server render failed for ${path}`);
    }
  }
  console.log(JSON.stringify({status:"passed",results}));
} catch(error:any) {
  console.error(JSON.stringify({status:"failed",results,assertion:error?.name==="AssertionError"?error.message:undefined,code:error?.code,causeCode:error?.cause?.code}));
  process.exitCode=1;
} finally {
  if(sessions.length)await client.query("DELETE FROM public.session WHERE id=ANY($1::text[])",[sessions]);
  await client.end();
}
