import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import pg from "pg";
import { fixtureCookie } from "./cookie.mjs";

const origin = "http://localhost:3314";
const collection = "http://127.0.0.1:3314/api/native/academic-administration/sessions";
const pastId = `fixture-native-pka-schedule-${randomUUID()}`;
const upcomingId = `fixture-native-pka-schedule-${randomUUID()}`;
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });

function patch(id, draft, requestId = randomUUID(), role = "admin", requestOrigin = origin) {
  return fetch(`${collection}/${id}`, {
    method: "PATCH", redirect: "manual",
    headers: { ...(role ? { cookie: fixtureCookie(role) } : {}), Origin: requestOrigin,
      "Content-Type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify(draft),
  });
}

async function responseJson(response, status) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}

async function read(id, status) {
  const response = await fetch(`${collection}?status=${status}`, { headers: { cookie: fixtureCookie("admin") }, redirect: "manual" });
  const page = await responseJson(response, 200);
  const row = page.rows.find((entry) => entry.id === id);
  assert.ok(row?.pkaScheduleEdit, "Server must return the typed schedule revision");
  return row.pkaScheduleEdit;
}

async function deleteWithWebEditor(title) {
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE });
  try {
    const webOrigin = new URL(collection).origin;
    const context = await browser.newContext({ viewport: { width: 380, height: 844 }, locale: "id-ID", timezoneId: "Asia/Jakarta" });
    const [name, value] = fixtureCookie("admin").split("=");
    await context.addCookies([{ name, value, url: webOrigin }]);
    const page = await context.newPage();
    await page.route("**/*", (route) => new URL(route.request().url()).origin === webOrigin ? route.continue() : route.abort());
    const response = await page.goto(`${webOrigin}/admin/tutorial-pka/schedules`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => [...document.querySelectorAll("main button")]
      .some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), undefined, { timeout: 40_000 });
    const row = page.getByRole("listitem").filter({ hasText: title }).filter({ visible: true });
    await row.getByRole("button", { name: /^(Aksi|Actions)$/ }).click();
    await page.getByRole("menuitem", { name: /^(Hapus jadwal|Delete schedule)$/ }).click();
    const dialog = page.getByRole("dialog", { name: /^(Hapus jadwal|Delete schedule)$/ });
    const [deletion] = await Promise.all([
      page.waitForResponse((result) => result.request().method() === "POST"
        && new URL(result.url()).pathname === "/admin/tutorial-pka/schedules", { timeout: 60_000 }),
      dialog.getByRole("button", { name: /^(Hapus|Delete)( jadwal| schedule)?$/ }).click(),
    ]);
    assert.ok(deletion.ok());
    await dialog.waitFor({ state: "hidden", timeout: 60_000 });
    await row.waitFor({ state: "hidden", timeout: 60_000 });
  } finally {
    await browser.close();
  }
}

let seeded = false;
try {
  await pool.query(`insert into pka_schedules(id,title,session_at,meet_link,created_by)
    values ($1,'Sesi lampau uji','2020-04-01T06:30:00Z',null,'academic-admin'),
      ($2,'Sesi mendatang uji','2099-04-01T06:30:00Z',null,'academic-admin')`, [pastId, upcomingId]);
  seeded = true;
  const initial = await read(pastId, "past");
  const draft = {
    title: "Sesi tersimpan uji", sessionAt: "2020-04-02T15:15:00+07:00",
    meetLink: "https://meet.google.com/aaa-bbbb-ccc", expectedRevision: initial.revision,
  };
  assert.equal((await patch(pastId, draft, randomUUID(), null)).status, 401);
  assert.equal((await patch(pastId, draft, randomUUID(), "tutor")).status, 403);
  assert.equal((await patch(pastId, draft, randomUUID(), "admin", "https://foreign.invalid")).status, 403);
  assert.equal((await patch(pastId, { ...draft, sessionAt: "2020-04-02T15:15:00" })).status, 422);
  assert.deepEqual(await responseJson(await patch(pastId, { ...draft, title: "Judul\u0000uji" }), 422),
    { error: "INVALID_SCHEDULE" });
  assert.deepEqual(await responseJson(await patch(pastId, { ...draft, meetLink: `${draft.meetLink}\u0000` }), 422),
    { error: "INVALID_SCHEDULE" });
  assert.equal((await patch(pastId, { ...draft, meetLink: "http://meet.google.com/aaa-bbbb-ccc" })).status, 422);
  assert.equal((await patch(pastId, draft, "invalid")).status, 400);

  const key = randomUUID();
  const results = await Promise.all([patch(pastId, draft, key), patch(pastId, draft, key)]);
  const receipts = await Promise.all(results.map((response) => responseJson(response, 200)));
  assert.deepEqual(receipts[0], receipts[1]);
  assert.equal(receipts[0].id, pastId);
  assert.equal(receipts[0].requestId, key);
  assert.equal(receipts[0].schedule.sessionAt, "2020-04-02T08:15:00.000Z");
  assert.notEqual(receipts[0].schedule.revision, initial.revision);
  const row = await read(pastId, "past");
  assert.deepEqual(row, receipts[0].schedule);
  assert.equal((await responseJson(await patch(pastId, { ...draft, title: "Judul lain" }, key), 409)).error, "REQUEST_CONFLICT");

  const contenders = await Promise.all(["Revisi pertama", "Revisi kedua"].map((title) =>
    patch(pastId, { ...draft, title, expectedRevision: row.revision })));
  assert.deepEqual(contenders.map((response) => response.status).sort(), [200, 409]);
  const conflict = await responseJson(contenders.find((response) => response.status === 409), 409);
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(conflict.schedule, await read(pastId, "past"));
  const finalTitle = `Revisi ditinjau ${pastId.slice(-12)}`;
  const final = await responseJson(await patch(pastId, { ...draft, title: finalTitle,
    meetLink: null, expectedRevision: conflict.schedule.revision }), 200);
  assert.equal(final.schedule.meetLink, null);
  assert.equal((await responseJson(await patch(pastId, draft, key), 200)).schedule.title, draft.title);
  assert.equal((await read(pastId, "past")).title, finalTitle);

  const upcoming = await read(upcomingId, "upcoming");
  const future = { title: "Waktu mendatang diperbarui", sessionAt: upcoming.sessionAt,
    meetLink: draft.meetLink, expectedRevision: upcoming.revision };
  assert.equal((await responseJson(await patch(upcomingId, future), 422)).error, "WEB_DELIVERY_REQUIRED");
  assert.deepEqual(await read(upcomingId, "upcoming"), upcoming);
  await responseJson(await patch(upcomingId, { ...future, meetLink: null }), 200);
  assert.equal((await read(upcomingId, "upcoming")).title, future.title);

  const audit = await pool.query(`select entity_id,count(*)::int as count from audit_mutasi
    where entity_type = 'native_pka_schedule' and entity_id = any($1) group by entity_id`, [[pastId, upcomingId]]);
  assert.deepEqual(Object.fromEntries(audit.rows.map((row) => [row.entity_id, row.count])), { [pastId]: 3, [upcomingId]: 1 });
  await deleteWithWebEditor(finalTitle);
  const deleted = await pool.query("select id from pka_schedules where id = $1", [pastId]);
  assert.equal(deleted.rowCount, 0);
  assert.deepEqual(await responseJson(await patch(pastId, draft, key), 404), { error: "NOT_FOUND" });
  console.log("PKA schedule live PATCH: Admin and origin checks, title validation, exact WIB instant, durable replay, revision conflict, web delivery boundary and replay after web deletion passed");
} finally {
  try {
    if (seeded) {
      await pool.query("delete from audit_mutasi where entity_type = 'native_pka_schedule' and entity_id = any($1)", [[pastId, upcomingId]]);
      await pool.query("delete from pka_schedules where id = any($1)", [[pastId, upcomingId]]);
    }
  } finally {
    await pool.end();
  }
}
