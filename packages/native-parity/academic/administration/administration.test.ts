import assert from "node:assert/strict";
import test from "node:test";
import type { AcademicCommand } from "../../../../apps/mobile-native/features/academic/client";
import { savePkaAnnouncement } from "../../../../apps/mobile-native/features/academic/administration/pka-edit-client";
import { readAdministration } from "../../../../apps/mobile-native/features/academic/administration/live-client";
import { checkDiktatPdfEvidence, checkDiktatPdfRequest, requestDiktatPdf } from "../../../../apps/mobile-native/features/academic/administration/diktat-client";
import { handlePkaAnnouncementEdit } from "../../../../lib/native/academic/administration/announcement-edit-handler";
import { announcementRevision, editAnnouncementInTransaction, type AnnouncementEditStore } from "../../../../lib/native/academic/administration/announcement-edit-transaction";
import { handleAdministrationRead, type AdministrationReadServices } from "../../../../lib/native/academic/administration/handle-read";
import { administrationBundleFixtures, productCriteria, type AcademicEventFields } from "./fixtures";
import { administrationReadPath, canReplayDiktatPdfRequest, isLiveAdministrationRead } from "./live";
import { administrationCases, administrationRoutes, findAdministrationBundle, matchAdministrationRoute, resolveAdministrationRedirect } from "./routes";
import { createAdministrationStore, type AdministrationCommand } from "./store";

const admin = { id: "fixture-admin", role: "admin" } as const;

test("all 19 owned administration patterns are matched and have three unique cases", () => {
  assert.equal(administrationRoutes.length, 19);
  assert.equal(administrationCases.length, 57);
  assert.equal(new Set(administrationCases.map(({ id }) => id)).size, 57);
  assert.equal(matchAdministrationRoute("/admin/anything"), undefined);
  for (const route of administrationRoutes) {
    assert.equal(matchAdministrationRoute(route.fixture)?.pattern, route.pattern);
  }
});

test("material aliases preserve section intent and enforce course and bundle type", () => {
  const resolve = (route: Parameters<typeof resolveAdministrationRedirect>[0], params = {}, query = {}) =>
    resolveAdministrationRedirect(route, params, query, administrationBundleFixtures);
  assert.deepEqual(resolve("/admin/materials/review", {}, { courseId: "academic-course-2", section: "product" }), {
    type: "redirect", target: "/admin/courses/fisika-dasar/review?tab=product",
  });
  assert.deepEqual(resolve("/admin/materials/review", {}, { courseId: "unknown" }), { type: "redirect", target: "/admin/courses" });
  assert.deepEqual(resolve("/admin/materials/review/idea/[slug]", { slug: "academic-product-1" }), { type: "missing" });
  assert.deepEqual(resolve("/admin/materials/review/product/[slug]", { slug: "academic-product-2" }), {
    type: "redirect", target: "/admin/courses/fisika-dasar/review/product/academic-product-2",
  });
  assert.equal(findAdministrationBundle("biologi-dasar", "academic-product-2", "product", administrationBundleFixtures), undefined);
  assert.equal(findAdministrationBundle("biologi-dasar", "academic-product-1", "product", administrationBundleFixtures)?.title, "Sel dan organel");
});

test("fixture save validates, preserves revision conflicts, and never crosses actor or scenario", () => {
  const store = createAdministrationStore(admin, "error");
  const event = store.getSnapshot().records.academicEvents[0];
  const fields: AcademicEventFields = { ...event, title: "Kuis konsep membran" };
  const edit = (revision: number, input = fields) => ({ type: "event.save", id: event.id, revision, fields: input }) as const;
  assert.equal(store.getSnapshot().readError, true);
  store.retryRead();
  assert.equal(store.getSnapshot().readError, false);
  const requestId = store.requestId();
  const failure = store.commit(requestId, edit(event.revision));
  assert.equal(failure.status, "conflict");
  assert.equal(store.getSnapshot().records.academicEvents[0].title, event.title);
  assert.equal(store.commit(requestId, edit(event.revision + 1, { ...fields, startsAt: "2026-02-31T10:00:00+07:00" })).status, "invalid");
  assert.equal(store.commit(requestId, edit(event.revision + 1)).status, "saved");
  assert.deepEqual(store.commit(requestId, edit(event.revision + 1)), { status: "saved", id: event.id });
  assert.equal(store.getSnapshot().records.academicEvents[0].title, fields.title);
  assert.equal(createAdministrationStore({ id: "second", role: "admin" }, "populated").getSnapshot().records.academicEvents[0].title, event.title);
  assert.deepEqual(createAdministrationStore(admin, "empty").getSnapshot().records.academicEvents, []);
  const denied = createAdministrationStore({ id: admin.id, role: "tutor" }, "populated");
  assert.equal(denied.getSnapshot().records.users.length, 0);
  assert.equal(denied.commit(requestId, edit(1)).status, "denied");
});

test("user controls enforce a role and prevent self-suspension", () => {
  const store = createAdministrationStore(admin, "populated");
  const me = store.getSnapshot().records.users[0];
  assert.equal(store.commit(store.requestId(), { type: "user.roles", id: me.id, revision: me.revision, roles: [] }).status, "invalid");
  assert.equal(store.commit(store.requestId(), { type: "user.roles", id: me.id, revision: me.revision, roles: ["tutor"] }).status, "invalid");
  assert.equal(store.commit(store.requestId(), { type: "user.status", id: me.id, revision: me.revision, status: "suspended" }).status, "invalid");
});

test("token validation, duplicate receipt and linked group deletion are atomic", () => {
  const store = createAdministrationStore(admin, "empty");
  const requestId = store.requestId();
  const fields = { courseIds: ["academic-course-1", "academic-course-2"], packageType: "custom" as const, total: 0, weekly: 2, capacity: 5 };
  assert.equal(store.commit(requestId, { type: "token.create", fields: { ...fields, capacity: 1001 } }).status, "invalid");
  const create: AdministrationCommand = { type: "token.create", fields };
  for (let index = 0; index < 2; index++) assert.equal(store.commit(requestId, create).status, "saved");
  const { tokens, groups } = store.getSnapshot().records;
  assert.equal(tokens.length, 1);
  assert.equal(groups.length, 1);
  assert.match(tokens[0].code, /^Zyx-[0-9A-F]{8}-5-2$/);
  assert.equal(tokens[0].weekly, 0);
  assert.equal(tokens[0].groupId, groups[0].id);
  assert.equal(store.commit(store.requestId(), { type: "token.delete", id: tokens[0].id, revision: tokens[0].revision }).status, "saved");
  assert.deepEqual(store.getSnapshot().records.groups, []);
});

test("broadcast settlement survives navigation and does not resend the same request", () => {
  const store = createAdministrationStore(admin, "error");
  store.retryRead();
  const requestId = store.requestId();
  const fields = { title: "Ujian besok", body: "Periksa jadwal.", link: "/dashboard", target: "course" as const, targetId: "academic-course-1" };
  assert.equal(store.commit(requestId, { type: "broadcast.send", fields }).status, "uncertain");
  assert.equal(store.getSnapshot().pendingDelivery, requestId);
  assert.equal(store.commit(store.requestId(), { type: "broadcast.send", fields }).status, "invalid");
  assert.deepEqual(store.confirmDelivery(requestId), { status: "saved", id: requestId });
  assert.equal(store.commit(requestId, { type: "broadcast.send", fields }).status, "saved");
  assert.equal(store.getSnapshot().records.broadcasts.filter(({ id }) => id === requestId).length, 1);
  assert.equal(store.getSnapshot().records.broadcasts[0].attempted, 1);
});

test("product fixture requires review, verified PDF and criteria before publication", () => {
  const store = createAdministrationStore(admin, "populated");
  const lookup = () => store.getSnapshot().records.bundles.find(({ id }) => id === "academic-product-1")!;
  const base = () => ({ id: lookup().id, revision: lookup().revision });
  const submit = (command: AdministrationCommand) => store.commit(store.requestId(), command).status;
  const approve = () => submit({ ...base(), type: "bundle.decide", status: "approved", reason: "", criteria: [...productCriteria] });
  assert.equal(approve(), "invalid");
  for (const item of lookup().items) assert.equal(submit({ ...base(), type: "bundle.item", itemId: item.id, status: "approved", note: "" }), "saved");
  assert.equal(approve(), "invalid");
  assert.equal(submit({ ...base(), type: "bundle.pdf.request" }), "saved");
  assert.equal(lookup().pdf, "pending");
  assert.equal(submit({ ...base(), type: "bundle.pdf.poll" }), "saved");
  assert.equal(approve(), "saved");
  assert.equal(submit({ ...base(), type: "bundle.publish" }), "saved");
  assert.equal(lookup().status, "published");
});

function services(role: "admin" | "student" | null, seen: string[] = []): AdministrationReadServices {
  return {
    session: async () => role ? { user: { id: "signed-user" } } : null,
    hasAdmin: async (id) => id === "signed-user" && role === "admin",
    list: async (section, query) => {
      seen.push(`${section}:${query.page}:${query.role}:${query.search}`);
      return { type: "page", rows: [], nextPage: false };
    },
    bundle: async (kind, slug, id) => kind === "idea" && slug === "matched" && id === "one"
      ? { type: "page", rows: [{ id, title: "Bundle" }], nextPage: false } : null,
    pdfStatus: async (slug) => slug === "canonical" ? "pending" : null,
    courseSlug: async (id) => id === "legacy" ? "canonical" : null,
    bundleCourseSlug: async (kind, id) => kind === "product" && id === "one" ? "canonical" : null,
  };
}

test("authenticated handler dispatches only allowed reads and validates redirect destinations", async () => {
  const seen: string[] = [];
  const query = new URLSearchParams({ page: "2", role: "tutor", search: "Rara" });
  for (const [role, code] of [[null, 401], ["student", 403]] as const) {
    assert.equal((await handleAdministrationRead(["users"], query, services(role, seen))).status, code);
  }
  assert.deepEqual(seen, []);
  const scope = services("admin", seen);
  const get = (url: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    const parsed = new URL(url, "https://academic.invalid");
    return handleAdministrationRead(parsed.pathname.split("/").slice(4).map(decodeURIComponent), parsed.searchParams, scope);
  };
  const transport = { accountId: "signed-user", locale: "id", origin: "https://academic.invalid", get };
  const signal = new AbortController().signal;
  const uri = administrationReadPath("/admin/users", {}, { page: "2", role: "tutor", search: "Rara" });
  assert.deepEqual(await readAdministration(transport, uri, signal), { type: "page", rows: [], nextPage: false });
  assert.deepEqual(seen, ["users:2:tutor:Rara"]);
  const resolved = await handleAdministrationRead(["alias", "review"], new URLSearchParams({ courseId: "legacy", section: "product" }), scope);
  assert.equal(resolved.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await resolved.json(), { type: "redirect", target: "/admin/courses/canonical/review?tab=product" });
  assert.equal((await handleAdministrationRead(["bundle", "idea", "another", "one"], query, scope)).status, 404);
  assert.equal((await handleAdministrationRead(["bundle", "idea", "matched", "one"], query, scope)).status, 200);
  assert.equal((await handleAdministrationRead(["bundle", "idea", "a/b", "one"], query, scope)).status, 400);
  assert.equal(isLiveAdministrationRead({ type: "redirect", target: "//foreign.invalid" }), false);
  await assert.rejects(readAdministration({ ...transport, get: async () => Response.json({ invalid: true }) }, uri, signal), { status: 502 });
});

test("PDF retries re-submit the same actor-bound identity and evidence is matched to the accepted attempt", async () => {
  const request = {
    importId: "import-one", productId: "diktat-one", expectedRevision: "a".repeat(64),
    requestId: "00000000-0000-4000-8000-000000000001",
  };
  const sent: unknown[] = [];
  let pending = true;
  let attemptId = "attempt-one";
  const transport = {
    accountId: "signed-admin", origin: "https://academic.invalid", locale: "id",
    command: async (path: string, input: unknown) => {
      sent.push([path, input]);
      return pending ? Response.json({}, { status: 503 }) : Response.json({ outcome: "accepted", requestId: request.requestId, attemptId: "attempt-one" }, { status: 202 });
    },
    get: async (path: string) => {
      const url = new URL(path, "https://academic.invalid");
      if (url.searchParams.has("outcome")) {
        assert.equal(url.searchParams.get("requestId"), request.requestId);
        assert.equal(url.searchParams.get("expectedRevision"), request.expectedRevision);
        return Response.json({ requestId: request.requestId, outcome: "accepted", attemptId: "attempt-one" });
      }
      assert.equal(url.pathname, "/api/native/academic-administration/pdf-status/canonical/import-one");
      assert.equal(url.searchParams.get("productId"), request.productId);
      assert.equal(url.searchParams.get("expectedRevision"), request.expectedRevision);
      return Response.json({ status: attemptId === url.searchParams.get("attemptId") ? "ready" : "stale" });
    },
  };
  const signal = new AbortController().signal;
  assert.deepEqual(await requestDiktatPdf(transport, request, signal), { outcome: "unknown" });
  pending = false;
  assert.deepEqual(await requestDiktatPdf(transport, request, signal), { outcome: "accepted", queueUnavailable: false, superseded: false, attemptId: "attempt-one" });
  assert.deepEqual(sent[0], sent[1]);
  assert.equal((await checkDiktatPdfRequest(transport, request, signal)).outcome, "accepted");
  assert.equal(await checkDiktatPdfEvidence(transport, "canonical", request, "attempt-one", signal), "ready");
  attemptId = "attempt-two";
  assert.equal(await checkDiktatPdfEvidence(transport, "canonical", request, "attempt-one", signal), "stale");
});

test("URL-only PDF recovery cannot post and fresh server authorization must match an in-session draft", () => {
  const request = {
    importId: "bundle-a", productId: "diktat-a", expectedRevision: "a".repeat(64),
    requestId: "00000000-0000-4000-8000-000000000001",
  };
  assert.equal(canReplayDiktatPdfRequest(undefined, [request]), false);
  assert.equal(canReplayDiktatPdfRequest(request, []), false);
  assert.equal(canReplayDiktatPdfRequest(request, [{ ...request, expectedRevision: "b".repeat(64) }]), false);
  assert.equal(canReplayDiktatPdfRequest(request, [{ ...request, importId: "bundle-b" }]), false);
  assert.equal(canReplayDiktatPdfRequest(request, [request]), true);
});


test("the native PKA editor replays lost saves and exposes current text after a revision conflict", async () => {
  const id = "test-pka";
  const requestId = "00000000-0000-4000-8000-000000000001";
  const origin = "https://academic.invalid";
  let stored = { title: "Judul awal", body: "Isi awal" };
  let writes = 0;
  let lost = false;
  const receipt = new Map<string, Parameters<AnnouncementEditStore["writeReceipt"]>[0]>();
  const transport = {
    origin, accountId: "signed-admin", locale: "id",
    get: async () => Response.json({}),
    command: async (path: string, { method, requestId: key, body }: AcademicCommand) => {
      assert.equal(method, "PATCH");
      assert.equal(path, "/api/native/academic-administration/announcements/test-pka");
      const result = await handlePkaAnnouncementEdit(new Request(origin + path, { method, body: JSON.stringify(body),
        headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key } }),
      ["announcements", id], origin, {
        session: async () => ({ user: { id: "signed-admin" }, session: { id: "signed-session" } }),
        hasAdmin: async (actor) => actor === "signed-admin",
        update: async (target, draft, actorKey, viewer) => {
          assert.equal(viewer.session.id, "signed-session");
          return editAnnouncementInTransaction(target, draft, {
            lockCurrent: async () => stored,
            receipt: async () => receipt.get(actorKey) ?? null,
            update: async (next) => { writes++; stored = next; },
            writeReceipt: async (value) => { receipt.set(actorKey, value); },
          });
        },
      });
      if (key === requestId && receipt.size === 1 && !lost) {
        lost = true;
        return Response.json({}, { status: 503 });
      }
      return result;
    },
  };
  const original = announcementRevision(id, stored);
  const signal = new AbortController().signal;
  const draft = { title: "Judul terbaru", body: "Isi terbaru", expectedRevision: original.revision };
  assert.equal((await savePkaAnnouncement(transport, id, { ...draft, title: "" }, "invalid-request-key", signal)).status, "invalid");
  assert.equal((await savePkaAnnouncement(transport, id, draft, requestId, signal)).status, "uncertain");
  assert.equal((await savePkaAnnouncement(transport, id, draft, requestId, signal)).status, "saved");
  assert.equal(writes, 1);
  const conflict = await savePkaAnnouncement(transport, id, { ...draft, title: "Judul lain" }, "record-new-request-key", signal);
  assert.deepEqual(conflict, { status: "conflict", announcement: announcementRevision(id, stored) });
  assert.equal((await savePkaAnnouncement(transport, id, { ...draft, title: "Judul lain" }, requestId, signal)).status, "request_conflict");
  assert.equal(writes, 1);
});
