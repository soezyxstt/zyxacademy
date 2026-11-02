import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import * as s from "../../db/schema";
import { daysFrom, formatIsoDateUtc } from "../../lib/date-utils";
import { checkCanDeleteTutorSlot, checkTutorSlotOwnership, getIndonesianDayFromDate, checkCanonicalTutorAssignment, checkActiveGroupCourseEligibility } from "../../lib/schedule/tutor-policy";
import { addBookingResource, getBookingResources, deleteBookingResource } from "../../lib/schedule/session-resources";
import { assertTarget } from "./import-core";

assertTarget(process.env.DATABASE_URL || "",process.env.NEON_EXPECTED_HOST || "",process.env.NEON_EXPECTED_DATABASE || "");
assert.equal(process.env.NEON_BRANCH_ID,"br-cool-water-az2xxbul");
const id=`neon-schedule-${randomUUID()}`;
const tutor=`${id}-tutor`,student=`${id}-student`,outsider=`${id}-outsider`;
const rollback=new Error("EXPECTED_FIXTURE_ROLLBACK");
try {
  await assert.rejects(db.transaction(async tx=>{
    const [course]=await tx.select({id:s.courses.id,canonicalId:s.mataKuliah.id}).from(s.courses).innerJoin(s.mataKuliah,eq(s.mataKuliah.legacyCourseId,s.courses.id)).where(eq(s.mataKuliah.status,"active")).limit(1);
    assert.ok(course);
    for(const [userId,role] of [[tutor,"tutor"],[student,"murid"],[outsider,"murid"]]) {
      const [membership]=await tx.select().from(s.peran).where(eq(s.peran.code,role));
      assert.ok(membership);
      await tx.insert(s.user).values({id:userId,name:"Neon schedule fixture",email:`${userId}@example.invalid`,role:role==="tutor"?"teacher":"student"});
      await tx.insert(s.pengguna).values({id:userId,status:"active"});
      await tx.insert(s.penggunaPeran).values({id:randomUUID(),penggunaId:userId,peranId:membership.id,source:"neon-rehearsal"});
    }
    await tx.insert(s.penugasanTutor).values({id,penggunaId:tutor,mataKuliahId:course.canonicalId,status:"active"});
    await tx.insert(s.groups).values({id,name:"Neon schedule fixture",status:"active"});
    await tx.insert(s.groupMembers).values({id,groupId:id,userId:student,role:"leader"});
    await tx.insert(s.groupCourses).values({id,groupId:id,courseId:course.id});
    const date=formatIsoDateUtc(daysFrom(5));
    await tx.insert(s.tutorSlots).values({id,tutorId:tutor,sessionDate:date,dayOfWeek:getIndonesianDayFromDate(date),startTime:"09:00",endTime:"10:30"});
    assert.equal((await checkTutorSlotOwnership(id,tutor,tx)).isOwner,true);
    assert.equal((await checkTutorSlotOwnership(id,outsider,tx)).isOwner,false);
    assert.equal((await checkCanDeleteTutorSlot(id,tutor,tx)).canDelete,true);
    assert.equal((await checkCanonicalTutorAssignment(tutor,course.id,{},tx)).isAssigned,true);
    assert.equal((await checkActiveGroupCourseEligibility(id,course.id,tx)).isEligible,true);
    await tx.insert(s.bookings).values({id,slotId:id,studentId:student,courseId:course.id,groupId:id,sessionDate:date,startTime:"09:00",endTime:"10:30"});
    assert.equal((await checkCanDeleteTutorSlot(id,tutor,tx)).canDelete,false);
    const input={bookingId:id,phase:"pre" as const,kind:"link" as const,label:"Synthetic resource",url:"https://example.invalid/resource"};
    const pre=await addBookingResource(input,{actorId:student,executor:tx});
    assert.ok(pre.success);
    assert.equal((await addBookingResource({...input,phase:"post"},{actorId:student,executor:tx})).success,false);
    const post=await addBookingResource({...input,phase:"post"},{actorId:tutor,executor:tx});
    assert.ok(post.success);
    const listed=await getBookingResources(id,{actorId:student,executor:tx});
    assert.ok(listed.success);
    assert.equal(listed.resources.length,2);
    assert.equal((await getBookingResources(id,{actorId:outsider,executor:tx})).success,false);
    assert.equal((await deleteBookingResource(post.resource.id,{actorId:student,executor:tx})).success,false);
    assert.equal((await deleteBookingResource(post.resource.id,{actorId:tutor,executor:tx})).success,true);
    assert.equal((await deleteBookingResource(post.resource.id,{actorId:tutor,executor:tx})).success,false);
    throw rollback;
  }),error=>error===rollback);
  assert.equal((await db.select().from(s.user).where(eq(s.user.id,tutor))).length,0);
  console.log(JSON.stringify({status:"passed",slotOwnership:true,bookedDeletionDenied:true,tutorAssignment:true,groupEligibility:true,resourceCreateReadDelete:true,resourcePermissionDenials:true,fixtureRolledBack:true,bookingServerActionVerified:false}));
} catch(error:any) {
  console.error(JSON.stringify({status:"failed",assertion:error?.name==="AssertionError"?error.message:undefined,code:error?.code,causeCode:error?.cause?.code}));
  process.exitCode=1;
} finally {await db.$client.end();}
