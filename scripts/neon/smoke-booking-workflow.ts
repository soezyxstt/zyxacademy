import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import * as s from "../../db/schema";
import { daysFrom, formatIsoDateUtc } from "../../lib/date-utils";
import { getIndonesianDayFromDate } from "../../lib/schedule/tutor-policy";
import { assertTarget } from "./import-core";

assertTarget(process.env.DATABASE_URL!, process.env.NEON_EXPECTED_HOST!, process.env.NEON_EXPECTED_DATABASE!);
assert.equal(process.env.NEON_BRANCH_ID, "br-cool-water-az2xxbul");
const share = new URL(process.env.NEON_HTTP_SHARE_URL!);
assert.equal(share.origin, "https://zyx-neon-migration.vercel.app");
const id = `neon-booking-${randomUUID()}`;
const users = [id, `${id}-tutor`, `${id}-outsider`], slots = [`${id}-a`, `${id}-b`];
const date = formatIsoDateUtc(daysFrom(5));
const cookies = new Map<string, string>();
const tokens = new Map<string, string>();
let seeded = false;
let stage = "seed";

async function request(path: string, init: RequestInit = {}, redirects = 0): Promise<Response> {
  assert.ok(redirects < 6, "Protection redirect limit exceeded");
  const url = new URL(path, share.origin);
  if (!init.method && redirects === 0) for (const [key, value] of share.searchParams) url.searchParams.set(key, value);
  const response = await fetch(url, { ...init, redirect: "manual", headers: { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; "), origin: share.origin, ...init.headers }, signal: AbortSignal.timeout(60000) });
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";", 1)[0], index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  if (!init.method && response.status >= 300 && response.status < 400) {
    const next = new URL(response.headers.get("location")!, url);
    assert.equal(next.origin, share.origin, "Unexpected protection redirect");
    return request(next.pathname + next.search, init, redirects + 1);
  }
  return response;
}
function actor(userId: string) {
  const token = tokens.get(userId)!;
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
  cookies.set("__Secure-better-auth.session_token", encodeURIComponent(`${token}.${signature}`));
}
const actionIds = new Map<string, string>();
async function action(name: string, args: unknown[]) {
  const actionId = actionIds.get(name);
  assert.ok(actionId, `Deployed action not found: ${name}`);
  const response = await request("/dashboard/schedule", { method: "POST", headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" }, body: JSON.stringify(args) });
  assert.equal(response.status, 200, `Action HTTP failure: ${name}`);
  const text = await response.text();
  for (const line of text.split("\n")) {
    const match = line.match(/^[0-9a-f]+:(\{.*\})$/);
    if (match) {
      const value = JSON.parse(match[1]);
      if (typeof value.success === "boolean") return value;
    }
  }
  throw new Error(`Action result missing: ${name}`);
}
async function quota() {
  return (await db.select().from(s.groups).where(eq(s.groups.id, id)))[0].usedQuotaSessions;
}

try {
  await db.transaction(async tx => {
    assert.equal((await tx.select().from(s.user).where(inArray(s.user.id, users))).length, 0);
    for (const userId of users) {
      const role = userId === users[1] ? "tutor" : "murid";
      const [membership] = await tx.select().from(s.peran).where(eq(s.peran.code, role));
      assert.ok(membership);
      await tx.insert(s.user).values({ id: userId, name: "Migration booking fixture", email: `${userId}@example.invalid`, role: role === "tutor" ? "teacher" : "student" });
      await tx.insert(s.pengguna).values({ id: userId, status: "active" });
      await tx.insert(s.penggunaPeran).values({ id: userId, penggunaId: userId, peranId: membership.id, source: "neon-rehearsal" });
      const token = randomUUID(); tokens.set(userId, token);
      await tx.insert(s.session).values({ id: userId, userId, token, expiresAt: daysFrom(1) });
    }
    await tx.insert(s.courses).values({ id, title: "Migration booking fixture", category: "Test" });
    await tx.insert(s.mataKuliah).values({ id, code: id, title: "Migration booking fixture", legacyCourseId: id, status: "active" });
    await tx.insert(s.penugasanTutor).values({ id, penggunaId: users[1], mataKuliahId: id, status: "active" });
    await tx.insert(s.groups).values({ id, name: "Migration booking fixture", status: "active", weeklyQuotaSessions: 2, totalQuotaSessions: 2, usedQuotaSessions: 0 });
    await tx.insert(s.groupCourses).values({ id, groupId: id, courseId: id });
    await tx.insert(s.groupMembers).values({ id, groupId: id, userId: id, role: "leader" });
    for (const [index, slotId] of slots.entries()) await tx.insert(s.tutorSlots).values({ id: slotId, tutorId: users[1], sessionDate: date, dayOfWeek: getIndonesianDayFromDate(date), startTime: index ? "11:00" : "09:00", endTime: index ? "12:30" : "10:30", mode: "offline", location: "Synthetic fixture" });
  });
  seeded = true;
  actor(id);
  const page = await request("/dashboard/schedule"); assert.equal(page.status, 200);
  const html = await page.text();
  const paths = [...new Set([...html.matchAll(/(?:src|href)="([^" ]+\.js(?:\?[^" ]*)?)"/g)].map(match => match[1]))];
  for (const path of paths) {
    const url = new URL(path, share.origin); assert.equal(url.origin, share.origin);
    const response = await request(url.pathname + url.search); assert.equal(response.status, 200);
    const js = await response.text();
    for (const match of js.matchAll(/\(["']([a-f0-9]{40,})["'],[^"']{0,250}["'](bookTutorialSlot|submitRescheduleTicket|tutorDecideTicket)["']\)/g)) actionIds.set(match[2], match[1]);
  }
  assert.equal(actionIds.size, 3, `Expected three deployed booking action references, found ${actionIds.size}`);
  const input = { slotId: slots[0], courseId: id, groupId: id };
  stage = "invalid-booking";
  assert.equal((await action("bookTutorialSlot", [{ ...input, slotId: `${id}-missing` }])).success, false);
  assert.equal(await quota(), 0);
  stage = "book";
  const booked = await action("bookTutorialSlot", [input]); assert.equal(booked.success, true);
  assert.ok(booked.bookingId); assert.equal(await quota(), 1);
  stage = "duplicate-booking";
  assert.equal((await action("bookTutorialSlot", [input])).success, false);
  assert.equal(await quota(), 1);
  actor(users[2]);
  stage = "outsider-request";
  assert.equal((await action("submitRescheduleTicket", [booked.bookingId, "cancellation", "Synthetic unauthorized request"])).success, false);
  actor(id);
  stage = "invalid-reschedule-ticket";
  const failedTicket = await action("submitRescheduleTicket", [booked.bookingId, "reschedule", "Synthetic invalid date", slots[1], "2000-01-01"]);
  assert.equal(failedTicket.success, true);
  actor(users[2]);
  stage = "outsider-decision";
  assert.equal((await action("tutorDecideTicket", [failedTicket.ticketId, "approved", "Unauthorized fixture"])).success, false);
  actor(users[1]);
  stage = "invalid-reschedule-decision";
  assert.equal((await action("tutorDecideTicket", [failedTicket.ticketId, "approved", "Synthetic invalid date"])).success, false);
  assert.equal((await db.select().from(s.bookings).where(eq(s.bookings.id, booked.bookingId)))[0].slotId, slots[0]);
  stage = "reject-invalid-request";
  assert.equal((await action("tutorDecideTicket", [failedTicket.ticketId, "rejected", "Reject invalid date"])).success, true);
  actor(id);
  stage = "corrected-request";
  const ticket = await action("submitRescheduleTicket", [booked.bookingId, "reschedule", "Synthetic corrected request", slots[1], date]);
  assert.equal(ticket.success, true);
  actor(users[1]);
  stage = "corrected-decision";
  assert.equal((await action("tutorDecideTicket", [ticket.ticketId, "approved", "Synthetic correction"])).success, true);
  assert.equal((await db.select().from(s.bookings).where(eq(s.bookings.id, booked.bookingId)))[0].slotId, slots[1]);
  assert.equal(await quota(), 1);
  actor(id);
  stage = "cancel-request";
  const cancel = await action("submitRescheduleTicket", [booked.bookingId, "cancellation", "Synthetic cancellation"]);
  assert.equal(cancel.success, true);
  actor(users[1]);
  stage = "cancel-decision";
  assert.equal((await action("tutorDecideTicket", [cancel.ticketId, "approved", "Synthetic cancellation"])).success, true);
  assert.equal((await db.select().from(s.bookings).where(eq(s.bookings.id, booked.bookingId)))[0].status, "cancelled");
  assert.equal(await quota(), 0);
  stage = "cancel-replay";
  assert.equal((await action("tutorDecideTicket", [cancel.ticketId, "approved", "Synthetic replay"])).success, false);
  assert.equal(await quota(), 0);
  const evidence = { status: "passed", hostedServerActions: true, booking: true, duplicateDenied: true, unauthorizedMoveAndCancelDenied: true, failedMovePreservedOriginal: true, retryAndReschedule: true, cancellationRefundedOnce: true };
  writeFileSync("artifacts/neon-migration/booking-workflow.json", JSON.stringify(evidence)); console.log(JSON.stringify(evidence));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", stage, message: error instanceof assert.AssertionError ? error.message : "BOOKING_SMOKE_FAILED" }));
  process.exitCode = 1;
} finally {
  if (seeded) await db.transaction(async tx => {
    const tickets = await tx.select({ id: s.bookingRescheduleTickets.id }).from(s.bookingRescheduleTickets).where(eq(s.bookingRescheduleTickets.groupId, id));
    if (tickets.length) await tx.delete(s.auditMutasi).where(inArray(s.auditMutasi.entityId, tickets.map(ticket => ticket.id)));
    await tx.delete(s.auditMutasi).where(inArray(s.auditMutasi.actorId, users));
    await tx.delete(s.bookings).where(eq(s.bookings.groupId, id));
    await tx.delete(s.tutorSlots).where(inArray(s.tutorSlots.id, slots));
    await tx.delete(s.groups).where(eq(s.groups.id, id));
    await tx.delete(s.penugasanTutor).where(eq(s.penugasanTutor.id, id));
    await tx.delete(s.mataKuliah).where(eq(s.mataKuliah.id, id));
    await tx.delete(s.courses).where(eq(s.courses.id, id));
    await tx.delete(s.pengguna).where(inArray(s.pengguna.id, users));
    await tx.delete(s.user).where(inArray(s.user.id, users));
  });
  assert.equal((await db.select().from(s.user).where(inArray(s.user.id, users))).length, 0);
  console.log(JSON.stringify({ fixtureCleanup: "passed" }));
  await db.$client.end();
}
