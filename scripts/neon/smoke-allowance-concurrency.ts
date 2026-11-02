import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { user, pengguna, penggunaPeran, peran, aiAllowanceLeases, aiUsageEvents } from "../../db/schema";
import { UsageBudgetService, ZYRA_FREE_ALLOWANCE_POLICY } from "../../lib/usage-budget-service";
import { assertTarget } from "./import-core";

assertTarget(process.env.DATABASE_URL || "", process.env.NEON_EXPECTED_HOST || "", process.env.NEON_EXPECTED_DATABASE || "");
assert.equal(process.env.NEON_BRANCH_ID,"br-cool-water-az2xxbul");
const id=`neon-quota-${randomUUID()}`;
try {
  const [role]=await db.select().from(peran).where(eq(peran.code,"murid"));
  assert.ok(role);
  await db.insert(user).values({id,email:`${id}@example.invalid`,name:"Neon quota fixture"});
  await db.insert(pengguna).values({id,status:"active"});
  await db.insert(penggunaPeran).values({id:randomUUID(),penggunaId:id,peranId:role.id,source:"neon-rehearsal"});
  const results=await Promise.all(Array.from({length:20},(_,i)=>UsageBudgetService.reserve({userId:id,idempotencyKey:`${id}:${i}`,feature:"zyra_tutor",mode:"provider",units:1,accessTier:"free"})));
  const accepted=results.filter(result=>result.accepted);
  console.log(JSON.stringify({attempts:results.length,accepted:accepted.length,limit:ZYRA_FREE_ALLOWANCE_POLICY.providerPerDay,rejections:results.filter(result=>!result.accepted).map(result=>result.accepted?null:result.reason)}));
  assert.equal(accepted.length,ZYRA_FREE_ALLOWANCE_POLICY.providerPerDay,"Concurrent reservations must respect the shared Free allowance");
  const first=accepted[0];
  assert.ok(first.accepted);
  const duplicate=await UsageBudgetService.reserve({userId:id,idempotencyKey:`${id}:${results.indexOf(first)}`,feature:"zyra_tutor",mode:"provider",units:1,accessTier:"free"});
  assert.ok(duplicate.accepted&&duplicate.idempotent,"A replay at the limit must remain idempotent");
  const replays=await Promise.all(Array.from({length:10},()=>UsageBudgetService.reserve({userId:id,idempotencyKey:`${id}:${results.indexOf(first)}`,feature:"zyra_tutor",mode:"provider",units:1,accessTier:"free"})));
  assert.ok(replays.every(result=>result.accepted&&result.idempotent&&result.lease.id===first.lease.id));
  assert.equal((await UsageBudgetService.markDispatched(first.lease.id))?.status,"dispatched");
  assert.equal((await UsageBudgetService.commit(first.lease.id,{model:"synthetic",inputTokens:2,outputTokens:3}))?.status,"committed");
  assert.equal((await UsageBudgetService.commit(first.lease.id))?.changed,false);
  assert.equal((await UsageBudgetService.refund(first.lease.id))?.status,"committed","Committed usage cannot be refunded");
  const events=await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.userId,id));
  assert.equal(events.length,1,"Committing twice must not charge twice");
  const refundable=accepted[1];
  assert.ok(refundable.accepted);
  assert.equal((await UsageBudgetService.refund(refundable.lease.id))?.status,"refunded");
  assert.equal((await UsageBudgetService.refund(refundable.lease.id))?.changed,false);
  const replacement=await UsageBudgetService.reserve({userId:id,idempotencyKey:`${id}:replacement`,feature:"zyra_tutor",accessTier:"free"});
  assert.ok(replacement.accepted,"A refunded reservation must release capacity");
  console.log(JSON.stringify({status:"passed",idempotentReplay:true,concurrentReplays:10,commitOnce:true,refundRecovery:true}));
} catch(error:any) {
  console.error(JSON.stringify({status:"failed",assertion:error?.name==="AssertionError"?error.message:undefined,code:error?.code}));
  process.exitCode=1;
} finally {
  await db.delete(aiUsageEvents).where(eq(aiUsageEvents.userId,id));
  await db.delete(aiAllowanceLeases).where(eq(aiAllowanceLeases.userId,id));
  await db.delete(penggunaPeran).where(eq(penggunaPeran.penggunaId,id));
  await db.delete(pengguna).where(eq(pengguna.id,id));
  await db.delete(user).where(eq(user.id,id));
  await db.$client.end();
}
