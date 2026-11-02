import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { eq, inArray, sql } from "drizzle-orm";

const expected = { project: "muddy-sky-44104897", branch: "br-holy-snow-azveniaa", database: "neondb", host: "ep-empty-wave-azlduma4.c-3.ap-southeast-1.aws.neon.tech" };
const target = new URL(process.env.DATABASE_URL || "");
assert.equal(target.hostname, expected.host);
assert.equal(target.pathname, `/${expected.database}`);
const control = new pg.Client({ connectionString: process.env.DATABASE_URL });
await control.connect();
const guard = await control.query("select current_database() as db, current_setting('neon.branch_id', true) as branch, pg_backend_pid() as pid");
assert.equal(guard.rows[0].db, expected.database);
assert.equal(guard.rows[0].branch, expected.branch);
console.log(JSON.stringify({ guard: "passed", ...expected }));
const monitor = new pg.Client({ connectionString: process.env.DATABASE_URL });
await monitor.connect();
await monitor.query("set statement_timeout = '5s'");
control.on("error", () => {});
monitor.on("error", () => {});
console.error = () => {};

const { db } = await import("../../lib/db");
const s = await import("../../db/schema");
const { collaborativeBookSlot, collaborativeMoveSlot } = await import("../../app/(student)/dashboard/schedule/actions");
const { executeDeleteTutorSlot, executeMoveTutorSession, executeDecideTutorRescheduleTicket } = await import("../../app/(tutor)/tutor/schedule/actions");
const { createCodingAttemptRepository } = await import("../../lib/coding/repository");
const { daysFrom, formatIsoDateUtc } = await import("../../lib/date-utils");
const { getIndonesianDayFromDate } = await import("../../lib/schedule/tutor-policy");
const id = `neon-concurrency-${randomUUID()}`;
const student = `${id}-student`, tutor = `${id}-tutor`, slots = [0, 1, 2].map(n => `${id}-slot-${n}`);
const date = formatIsoDateUtc(daysFrom(14));
const sourceDate = formatIsoDateUtc(daysFrom(28)), sameDate = formatIsoDateUtc(daysFrom(42));
const extraSlots = Array.from({ length: 7 }, (_, n) => `${id}-extra-slot-${n}`);
const extraBookings = [0, 1].map(n => `${id}-booking-${n}`);
const tickets = [0, 1].map(n => `${id}-ticket-${n}`);
const evidence: Record<string, unknown> = { target: expected, guard: "passed" };
let stage = "seed", seeded = false, releaseBooking = () => {}, openTransaction = false;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
async function waitForBlocked(pid: number, count: number) {
  const until = Date.now() + 15000;
  let maxBlocked = 0;
  while (Date.now() < until) {
    const result = await monitor.query("select pid, pg_blocking_pids(pid) as blockers from pg_stat_activity where wait_event_type = 'Lock'");
    const blocked = new Set([pid]);
    for (let i = 0; i < result.rows.length; i++) for (const row of result.rows) if (row.blockers.some((p: number) => blocked.has(p))) blocked.add(row.pid);
    maxBlocked = Math.max(maxBlocked, blocked.size - 1);
    if (blocked.size - 1 >= count) return;
    await new Promise(r => setTimeout(r, 50));
  }
  evidence.maxBlocked = maxBlocked;
  throw new Error("LOCK_BARRIER_TIMEOUT");
}
function trackedExecutor(pids: number[], index?: number) {
  const executor = Object.create(db);
  executor.transaction = (fn: any) => db.transaction(async tx => {
    await tx.execute(sql`set local statement_timeout = '30s'`);
    const result = await tx.execute(sql`select pg_backend_pid() as pid`);
    if (index === undefined) pids.push(Number(result.rows[0].pid));
    else if (!pids[index]) pids[index] = Number(result.rows[0].pid);
    return fn(tx);
  }).catch((error: any) => {
    const code = error?.cause?.code ?? error?.code;
    if (typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code)) evidence.transactionErrorCode = code;
    throw error;
  });
  return executor;
}
async function waitForPids(pids: number[], blockerPid?: number) {
  const until = Date.now() + 12000;
  let maximum = 0;
  while (Date.now() < until) {
    if (pids.length === 2 && pids[0] && pids[1]) {
      const result = await monitor.query("select pid, pg_blocking_pids(pid) as blockers from pg_stat_activity where wait_event_type = 'Lock'");
      const blocked = new Set<number>(blockerPid ? [blockerPid] : []);
      if (blockerPid) for (let i = 0; i < result.rows.length; i++) for (const row of result.rows) if (row.blockers.some((pid: number) => blocked.has(pid))) blocked.add(row.pid);
      evidence.lastWaits = result.rows.filter(row => pids.includes(row.pid)).map(row => ({ pid: row.pid, blockers: row.blockers }));
      const count = pids.filter(pid => blockerPid ? blocked.has(pid) : result.rows.some(row => row.pid === pid)).length;
      maximum = Math.max(maximum, count);
      if (count === 2) return;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  evidence.maxTrackedWaiters = maximum;
  throw new Error("LOCK_BARRIER_TIMEOUT");
}
try {
  await db.transaction(async tx => {
    const roles = await tx.select().from(s.peran).where(inArray(s.peran.code, ["tutor", "murid"]));
    const tutorRole = roles.find(r => r.code === "tutor"), studentRole = roles.find(r => r.code === "murid");
    assert.ok(tutorRole && studentRole);
    for (const [userId, role, membership] of [[student, "student", studentRole], [tutor, "teacher", tutorRole]] as const) {
      await tx.insert(s.user).values({ id: userId, name: "Synthetic fixture", email: `${userId}@example.invalid`, role });
      await tx.insert(s.pengguna).values({ id: userId, status: "active" });
      await tx.insert(s.penggunaPeran).values({ id: `${userId}-role`, penggunaId: userId, peranId: membership.id, source: "neon-concurrency" });
    }
    await tx.insert(s.courses).values({ id, title: "Synthetic fixture", category: "Test" });
    await tx.insert(s.mataKuliah).values({ id, code: id, title: "Synthetic fixture", legacyCourseId: id, status: "active" });
    await tx.insert(s.penugasanTutor).values({ id, penggunaId: tutor, mataKuliahId: id, status: "active" });
    await tx.insert(s.groups).values({ id, name: "Synthetic fixture", status: "active", totalQuotaSessions: 2, usedQuotaSessions: 0 });
    await tx.insert(s.groupCourses).values({ id, groupId: id, courseId: id });
    await tx.insert(s.groupMembers).values({ id, groupId: id, userId: student, role: "leader" });
    for (const [n, slotId] of slots.entries()) await tx.insert(s.tutorSlots).values({ id: slotId, tutorId: tutor, sessionDate: date, dayOfWeek: getIndonesianDayFromDate(date), startTime: ["09:00", "11:00", "13:00"][n], endTime: ["10:30", "12:30", "14:30"][n], mode: "offline" });
  });
  seeded = true;
  stage = "booking-delete";
  const entered = deferred(), release = deferred(); releaseBooking = release.resolve;
  let bookingPid = 0;
  const bookingExecutor = Object.create(db);
  bookingExecutor.transaction = (fn: any) => db.transaction(async tx => {
    const pid = await tx.execute(sql`select pg_backend_pid() as pid`);
    bookingPid = Number(pid.rows[0].pid);
    const result = await fn(tx);
    entered.resolve();
    await release.promise;
    return result;
  });
  const bookingPromise = collaborativeBookSlot(slots[0], id, id, date, { actorId: student, executor: bookingExecutor });
  await Promise.race([entered.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("BOOKING_BARRIER_TIMEOUT")), 15000))]);
  const deletePromise = executeDeleteTutorSlot({ slotId: slots[0] }, { actorId: tutor, executor: db, courseId: id });
  let deleteBarrierFailed = false;
  try { await waitForBlocked(bookingPid, 1); } catch { deleteBarrierFailed = true; } finally { release.resolve(); }
  const [booked, deleted] = await Promise.all([bookingPromise, deletePromise]);
  if (deleteBarrierFailed) throw new Error("LOCK_BARRIER_TIMEOUT");
  assert.equal(booked.success, true); assert.ok(booked.bookingId);
  assert.equal(deleted.success, false); assert.equal(deleted.reason, "CANNOT_DELETE_BOOKED_SLOT");
  assert.equal((await db.select().from(s.bookings).where(eq(s.bookings.id, booked.bookingId))).length, 1);
  assert.equal((await db.select().from(s.tutorSlots).where(eq(s.tutorSlots.id, slots[0]))).length, 1);
  assert.equal((await db.select().from(s.groups).where(eq(s.groups.id, id)))[0].usedQuotaSessions, 1);
  evidence.bookingDelete = { blockedDeleteObserved: true, bookingRetained: 1, slotRetained: 1, quotaUsed: 1 };

  stage = "concurrent-moves";
  await control.query("begin"); openTransaction = true;
  await control.query("select id from bookings where id = $1 for update", [booked.bookingId]);
  const movePids: number[] = [];
  const moves = [1, 2].map(n => collaborativeMoveSlot(booked.bookingId!, slots[n], date, { actorId: student, executor: trackedExecutor(movePids) }));
  let moveBarrierFailed = false;
  try { await waitForPids(movePids); } catch { moveBarrierFailed = true; } finally { await control.query("commit"); openTransaction = false; }
  const moveResults = await Promise.all(moves);
  if (moveBarrierFailed) { evidence.moveResults = moveResults.map(r => ({ success: r.success })); throw new Error("LOCK_BARRIER_TIMEOUT"); }
  assert.equal(moveResults.filter(r => r.success).length, 1);
  const [moved] = await db.select().from(s.bookings).where(eq(s.bookings.id, booked.bookingId));
  assert.ok(slots.slice(1).includes(moved.slotId));
  assert.equal((await db.select().from(s.bookingAuditLogs).where(eq(s.bookingAuditLogs.bookingId, booked.bookingId))).filter(r => r.action === "SLOT_MOVED").length, 1);
  evidence.moves = { blockedUpdatesObserved: 2, successes: 1, failures: 1, moveAudits: 1 };

  stage = "tutor-fixtures";
  await db.transaction(async tx => {
    for (const [n, slotId] of extraSlots.entries()) {
      const slotDate = n < 2 ? sourceDate : n < 4 ? date : sameDate;
      const time = n < 2 ? n : n < 4 ? n - 2 : n - 4;
      await tx.insert(s.tutorSlots).values({ id: slotId, tutorId: tutor, sessionDate: slotDate, dayOfWeek: getIndonesianDayFromDate(slotDate), startTime: ["16:00", "18:00", "20:00"][time], endTime: ["17:30", "19:30", "21:30"][time], mode: "offline" });
    }
    for (const [n, bookingId] of extraBookings.entries()) await tx.insert(s.bookings).values({ id: bookingId, slotId: extraSlots[n], studentId: student, courseId: id, groupId: id, sessionDate: sourceDate, startTime: ["16:00", "18:00"][n], endTime: ["17:30", "19:30"][n], mode: "offline" });
  });
  const options = (pids: number[], index: number) => ({ actorId: tutor, executor: trackedExecutor(pids, index), skipNotifications: true });
  async function groupRace(run: (pids: number[]) => Promise<any>[]) {
    await control.query("begin"); openTransaction = true;
    const lock = await control.query("select id, pg_backend_pid() as pid from groups where id = $1 for no key update", [id]);
    assert.equal(lock.rowCount, 1);
    const blockerPid = Number(lock.rows[0].pid);
    const pids: number[] = [];
    const actions = run(pids);
    const settled = Promise.allSettled(actions);
    let barrierFailed = false;
    try { await waitForPids(pids, blockerPid); } catch { barrierFailed = true; } finally { await control.query("commit"); openTransaction = false; }
    const results = await settled;
    evidence[`${stage}Pids`] = { actions: pids, blocker: blockerPid };
      evidence[`${stage}Settled`] = results.map(r => r.status === "fulfilled" ? { success: r.value.success, reason: r.value.reason ?? null, movedDirectly: r.value.movedDirectly ?? null } : { rejected: true });
    if (barrierFailed) {
      const audits = await db.select().from(s.auditMutasi).where(eq(s.auditMutasi.actorId, tutor));
      evidence.failureReasons = audits.map(a => a.reason).filter(Boolean).map(reason => /^[A-Z_]+$/.test(reason!) ? reason : /deadlock/i.test(reason!) ? "DEADLOCK" : /timeout/i.test(reason!) ? "TIMEOUT" : "OTHER");
      throw new Error("LOCK_BARRIER_TIMEOUT");
    }
    assert.ok(results.every(r => r.status === "fulfilled"));
    const values = results.map(r => (r as PromiseFulfilledResult<any>).value);
    evidence[`${stage}Results`] = values.map(r => ({ success: r.success, reason: r.reason ?? null, movedDirectly: r.movedDirectly ?? null }));
    return values;
  }
  stage = "tutor-quota";
  assert.equal((await db.select().from(s.groups).where(eq(s.groups.id, id)))[0].weeklyQuotaSessions, 2);
  assert.equal((await db.select().from(s.bookings).where(eq(s.bookings.groupId, id))).filter(r => r.sessionDate === date).length, 1);
  const quotaMoves = await groupRace(pids => extraBookings.map((bookingId, n) => executeMoveTutorSession({ bookingId, targetSlotId: extraSlots[n + 2], targetSessionDate: date }, options(pids, n))));
  assert.equal(quotaMoves.filter(r => r.success && r.movedDirectly).length, 1);
  assert.equal(quotaMoves.filter(r => r.reason === "WEEKLY_QUOTA_EXCEEDED").length, 1);
  let rows = await db.select().from(s.bookings).where(eq(s.bookings.groupId, id));
  assert.equal(rows.filter(r => r.sessionDate === date).length, 2);
  evidence.tutorQuota = { blockedActions: 2, targetWeekBefore: 1, quota: 2, targetWeekAfter: 2, successes: 1 };

  stage = "ticket-fixtures";
  await db.transaction(async tx => {
    for (const [n, bookingId] of extraBookings.entries()) {
      await tx.update(s.bookings).set({ slotId: extraSlots[n], sessionDate: sourceDate }).where(eq(s.bookings.id, bookingId));
      await tx.insert(s.bookingRescheduleTickets).values({ id: tickets[n], bookingId, groupId: id, requestedById: student, tutorId: tutor, type: "reschedule", status: "pending", reason: "Synthetic fixture", proposedSlotId: extraSlots[n + 2], proposedDate: date });
    }
  });
  stage = "tutor-ticket-quota";
  assert.equal((await db.select().from(s.bookings).where(eq(s.bookings.groupId, id))).filter(r => r.sessionDate === date).length, 1);
  const decisions = await groupRace(pids => tickets.map((ticketId, n) => executeDecideTutorRescheduleTicket({ ticketId, decision: "approved" }, options(pids, n))));
  assert.equal(decisions.filter(r => r.success).length, 1);
  assert.equal(decisions.filter(r => r.reason === "WEEKLY_QUOTA_EXCEEDED").length, 1);
  const ticketRows = await db.select().from(s.bookingRescheduleTickets).where(inArray(s.bookingRescheduleTickets.id, tickets));
  assert.deepEqual(ticketRows.map(r => r.status).sort(), ["approved", "pending"]);
  rows = await db.select().from(s.bookings).where(eq(s.bookings.groupId, id));
  assert.equal(rows.filter(r => r.sessionDate === date).length, 2);
  const pending = ticketRows.find(r => r.status === "pending")!;
  assert.equal(rows.find(r => r.id === pending.bookingId)?.slotId, extraSlots[extraBookings.indexOf(pending.bookingId)]);
  evidence.tutorTicketQuota = { blockedActions: 2, targetWeekBefore: 1, quota: 2, targetWeekAfter: 2, approved: 1, pending: 1 };

  stage = "tutor-same-booking";
  const sameMoves = await groupRace(pids => [4, 5].map((n, index) => executeMoveTutorSession({ bookingId: extraBookings[0], targetSlotId: extraSlots[n], targetSessionDate: sameDate }, options(pids, index))));
  assert.equal(sameMoves.filter(r => r.success && r.movedDirectly).length, 1);
  assert.equal(sameMoves.filter(r => r.reason === "BOOKING_TERMINAL_STATE").length, 1);
  const sameAudits = (await db.select().from(s.bookingAuditLogs).where(eq(s.bookingAuditLogs.bookingId, extraBookings[0]))).filter(r => r.action === "TUTOR_SESSION_MOVED" && (r.metadata as any)?.newDate === sameDate);
  assert.equal(sameAudits.length, 1);
  const [sameBooking] = await db.select().from(s.bookings).where(eq(s.bookings.id, extraBookings[0]));
  assert.ok(extraSlots.slice(4, 6).includes(sameBooking.slotId));
  evidence.tutorSameBooking = { blockedActions: 2, successes: 1, moveAudits: 1 };

  stage = "coding-reservations";
  const codingPids: number[] = [];
  const repository = createCodingAttemptRepository(trackedExecutor(codingPids));
  const request = { requestId: `${id}-request-1`, problem: { problemId: `${id}-problem`, version: 1 }, code: "print(1)", stdin: "" };
  const input = { learnerId: student, courseId: id, surface: "article" as const, surfaceId: id, request, maxAttempts: 1, deadlineMs: null };
  await control.query("begin"); openTransaction = true;
  await control.query('select id from "user" where id = $1 for update', [student]);
  const reservations = [repository.reserve(input), repository.reserve({ ...input, request: { ...request, requestId: `${id}-request-2` } })];
  const settledPromise = Promise.allSettled(reservations);
  let codingBarrierFailed = false;
  try { await waitForPids(codingPids); } catch { codingBarrierFailed = true; } finally { await control.query("commit"); openTransaction = false; }
  const results = await settledPromise;
  if (codingBarrierFailed) throw new Error("LOCK_BARRIER_TIMEOUT");
  const accepted = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled");
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(accepted.length, 1); assert.equal(rejected.length, 1); assert.equal(rejected[0].reason?.message, "CODING_ATTEMPT_LIMIT");
  const winningRequest = accepted[0].value.attempt.request;
  const reordered = { stdin: winningRequest.stdin, code: winningRequest.code, problem: { version: winningRequest.problem.version, problemId: winningRequest.problem.problemId }, requestId: winningRequest.requestId };
  const replay = await repository.reserve({ ...input, request: reordered });
  assert.equal(replay.created, false); assert.equal(replay.attempt.id, accepted[0].value.attempt.id);
  assert.equal((await db.select().from(s.codingAttempts).where(eq(s.codingAttempts.learnerId, student))).length, 1);
  evidence.coding = { blockedReservationsObserved: 2, created: 1, limitRejections: 1, reorderedJsonbReplay: true };
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed"; evidence.stage = stage;
  evidence.error = error instanceof assert.AssertionError ? "ASSERTION_FAILED" : error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "SMOKE_FAILED";
  const code = (error as any)?.code ?? (error as any)?.cause?.code;
  if (typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code)) evidence.errorCode = code;
  process.exitCode = 1;
} finally {
  releaseBooking();
  if (openTransaction) await control.query("rollback").catch(() => {});
  if (seeded) {
    try {
      await db.transaction(async tx => {
        await tx.delete(s.auditMutasi).where(inArray(s.auditMutasi.actorId, [student, tutor]));
        await tx.delete(s.codingAttempts).where(eq(s.codingAttempts.learnerId, student));
        await tx.delete(s.bookings).where(eq(s.bookings.groupId, id));
        await tx.delete(s.tutorSlots).where(inArray(s.tutorSlots.id, [...slots, ...extraSlots]));
        await tx.delete(s.groups).where(eq(s.groups.id, id));
        await tx.delete(s.penugasanTutor).where(eq(s.penugasanTutor.id, id));
        await tx.delete(s.mataKuliah).where(eq(s.mataKuliah.id, id));
        await tx.delete(s.courses).where(eq(s.courses.id, id));
        await tx.delete(s.pengguna).where(inArray(s.pengguna.id, [student, tutor]));
        await tx.delete(s.user).where(inArray(s.user.id, [student, tutor]));
      });
      const remaining = await db.select({ id: s.user.id }).from(s.user).where(inArray(s.user.id, [student, tutor]));
      assert.equal(remaining.length, 0);
      const counts = await Promise.all([
        db.select({ id: s.groups.id }).from(s.groups).where(eq(s.groups.id, id)),
        db.select({ id: s.courses.id }).from(s.courses).where(eq(s.courses.id, id)),
        db.select({ id: s.mataKuliah.id }).from(s.mataKuliah).where(eq(s.mataKuliah.id, id)),
        db.select({ id: s.tutorSlots.id }).from(s.tutorSlots).where(inArray(s.tutorSlots.id, [...slots, ...extraSlots])),
        db.select({ id: s.bookings.id }).from(s.bookings).where(eq(s.bookings.groupId, id)),
        db.select({ id: s.codingAttempts.id }).from(s.codingAttempts).where(eq(s.codingAttempts.learnerId, student)),
        db.select({ id: s.auditMutasi.id }).from(s.auditMutasi).where(inArray(s.auditMutasi.actorId, [student, tutor])),
        db.select({ id: s.pengguna.id }).from(s.pengguna).where(inArray(s.pengguna.id, [student, tutor])),
      ]);
      assert.ok(counts.every(rows => rows.length === 0));
      evidence.cleanup = "passed";
    } catch { evidence.cleanup = "failed"; evidence.fixturePrefix = id; process.exitCode = 1; }
  } else evidence.cleanup = "seed transaction rolled back";
  mkdirSync("artifacts/neon-integration/concurrency", { recursive: true });
  writeFileSync(`artifacts/neon-integration/concurrency/${id}.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  await monitor.end(); await control.end(); await db.$client.end();
}
