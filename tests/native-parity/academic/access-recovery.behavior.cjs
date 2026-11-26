const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { afterEach, test } = require("node:test");
const { buildSync } = require("esbuild");

assert.ok(process.env.ZYX_CONTROL_TEST_DEPS, "Set ZYX_CONTROL_TEST_DEPS as described in shared-ui/CONTRACTS.md.");
const testRequire = createRequire(resolve(process.env.ZYX_CONTROL_TEST_DEPS, "package.json"));
const { createElement: h } = testRequire("react");
const { act, create } = testRequire("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = setTimeout;
global.cancelAnimationFrame = clearTimeout;

const native = {
  AccessibilityInfo: { sendAccessibilityEvent() {}, isReduceMotionEnabled: () => new Promise(() => {}), addEventListener: () => ({ remove() {} }) },
  Platform: { OS: "web", select: (choices) => choices.web ?? choices.default },
  StyleSheet: { create: (styles) => styles, flatten: (styles) => Object.assign({}, ...[styles].flat(Infinity)), hairlineWidth: 1 },
  useColorScheme: () => "light",
  useWindowDimensions: () => ({ width: 380, height: 800, fontScale: 1 }),
  Pressable: ({ children, ...props }) => h("Pressable", props, typeof children === "function" ? children({ pressed: false }) : children),
  Modal: ({ visible = true, children }) => visible ? h("Modal", null, children) : null,
  ActivityIndicator: "ActivityIndicator", I18nManager: { isRTL: false }, KeyboardAvoidingView: "KeyboardAvoidingView",
  ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View",
  FlatList: ({ data, keyExtractor, renderItem, ListEmptyComponent }) => h("FlatList", null,
    data.length ? data.map((item, index) => h("ListItem", { key: keyExtractor(item) }, renderItem({ item, index }))) : ListEmptyComponent),
  Easing: { bezier: () => (value) => value },
  Animated: { View: "AnimatedView", Value: class {}, timing() {}, loop: () => ({ start() {}, stop() {}, reset() {} }) },
};
const dependencies = {
  "react-native": native,
  "react-native-safe-area-context": { SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
  "react-native-svg": { __esModule: true, default: "svg", Path: "path", Circle: "circle" },
  "expo-crypto": { randomUUID },
  "expo-haptics": {},
  "expo-sqlite/kv-store": {},
  "expo-web-browser": {},
};
const built = buildSync({
  stdin: {
    contents: `export { ConnectedSchedule } from "./tutor/connected";
      export { TutorScreen } from "./tutor";
      export { createTutorSupportClient } from "./tutor/support-client";
      export { AdministrationLiveScreen } from "./administration/live-screen";
      export { StudyGroupMembersEditor } from "./administration/study-group-members-editor";
      export { LivePdfTitleEdit } from "./courses/live-material";
      export { Tryouts } from "./assessment/tryouts";
      export { createAssessmentReadGateway } from "./assessment/client";
      export { CourseScreen, AdminCourseFixtureProvider } from "./courses";
      export { createAcademicClient } from "./client";`,
    resolveDir: resolve(__dirname, "../../../apps/mobile-native/features/academic"),
  },
  bundle: true, packages: "external", format: "cjs", jsx: "automatic", loader: { ".ttf": "empty" }, write: false,
});
const entry = { exports: {} };
new Function("require", "module", "exports", built.outputFiles[0].text)((id) => dependencies[id] ?? testRequire(id), entry, entry.exports);
const { ConnectedSchedule, TutorScreen, createTutorSupportClient, AdministrationLiveScreen, LivePdfTitleEdit, createAcademicClient,
  CourseScreen, AdminCourseFixtureProvider, StudyGroupMembersEditor, Tryouts, createAssessmentReadGateway } = entry.exports;

const noop = () => {};
const navigation = { theme: "light", back: noop, navigate: noop, replace: noop, query: {} };
let renderer;
async function mount(Component, props) {
  await act(async () => { renderer = create(h(Component, { ...navigation, ...props })); });
}
function unmount() {
  if (renderer) act(() => renderer.unmount());
  renderer = undefined;
}
afterEach(unmount);
function screenContains(value) {
  return JSON.stringify(renderer.toJSON()).includes(value);
}
async function press(label) {
  const control = renderer.root.findAllByType("Pressable").find((node) => node.props.testID === label
    || node.props.accessibilityLabel === label || node.findAllByType("Text").some((text) => text.children.includes(label)));
  assert.ok(control && !control.props.disabled, label);
  await act(async () => { await control.props.onPress(); });
}

function tutorRoster(course, overrides = {}) {
  return { path: `/tutor/${course}/participants`, params: { courseId: course }, scenario: "populated",
    actor: { id: "academic-tutor", role: "tutor" }, ...overrides };
}

test("Tutor roster recovers from a load error and retains filter and detail navigation", async () => {
  let backs = 0;
  await mount(TutorScreen, tutorRoster("academic-course-1", { scenario: "error", back: () => backs++ }));
  assert.ok(screenContains("Data gagal dimuat"));
  await press("Coba lagi");
  assert.ok(screenContains("Peserta dan kelompok, Biologi Dasar"));
  const visibleCourse = () => renderer.root.findAllByType("Text").find((node) => node.props.testID === "tutor-roster-course")?.children;
  assert.deepEqual(visibleCourse(), ["Biologi Dasar"]);
  assert.ok(screenContains("Semua tipe"));
  assert.ok(screenContains("Kelompok Sel (Ketua)"));
  assert.ok(screenContains("Masa berlaku 31 Jan 2027"));
  assert.equal(screenContains("tutor-roster-search-input"), false);
  await press("tutor-roster-access");
  await press("tutor-roster-access-group");
  assert.ok(screenContains("Rafi Ananda"));
  assert.equal(screenContains("Nadia Lestari"), false);
  await press("tutor-roster-search-trigger");
  assert.deepEqual(visibleCourse(), ["Biologi Dasar"]);
  const input = renderer.root.findAllByType("TextInput").find((node) => node.props.testID === "tutor-roster-search-input");
  assert.ok(input);
  act(() => input.props.onChangeText("nadia"));
  assert.ok(screenContains("Peserta tidak ditemukan"));
  assert.ok(screenContains("Ubah kata kunci atau filter akses."));
  await press("tutor-roster-search-clear");
  await press("tutor-roster-search-close");
  await press("tutor-participant-academic-student-2");
  const detail = renderer.root.findAllByType("SafeAreaView").find((node) => node.props.testID === "tutor-detail");
  assert.ok(detail);
  assert.match(JSON.stringify(detail.findAllByType("Text").map((node) => node.children)), /Terdaftar sejak/);
  const close = detail.findAllByType("Pressable").find((node) => node.props.testID === "tutor-back");
  await act(() => close.props.onPress());
  assert.equal(screenContains("tutor-detail"), false);
  assert.ok(screenContains("Filter jenis akses, Kelompok"));
  await press("Kelompok belajar (1)");
  assert.ok(screenContains("sesi digunakan"));
  await press("tutor-back");
  assert.equal(backs, 1);
});

test("Tutor sees an empty assigned roster and a denied unassigned roster as distinct states", async () => {
  await mount(TutorScreen, tutorRoster("academic-course-2", { theme: "dark" }));
  assert.ok(screenContains("Peserta dan kelompok, Fisika Dasar"));
  assert.deepEqual(renderer.root.findAllByType("Text").find((node) => node.props.testID === "tutor-roster-course")?.children, ["Fisika Dasar"]);
  assert.ok(screenContains("Peserta tidak ditemukan"));
  assert.ok(screenContains("Belum ada peserta aktif untuk kelas ini."));
  assert.equal(screenContains("tutor-participant-academic-student-1"), false);
  unmount();
  await mount(TutorScreen, tutorRoster("academic-course-3", { theme: "dark" }));
  assert.ok(screenContains("Akses ditolak"));
  assert.equal(screenContains("tutor-roster-course"), false);
  assert.equal(screenContains("Semua tipe"), false);
  assert.equal(screenContains("tutor-participant-academic-student-1"), false);
});

const date = "2026-11-28";
const schedule = {
  from: "2026-11-23", to: "2026-11-29", groups: [], tickets: [],
  slots: [{ id: "slot-private", date, start: "09:00", end: "10:30", mode: "offline", location: "Ruang privat", booked: false, notes: "Catatan privat", revision: "a".repeat(64) }],
  sessions: [{ id: "session-private", date: null, topic: "Topik privat", status: "scheduled" }],
};

test("Tutor slot write hides the schedule and draft on denial or a missing slot until an authorized reload", async () => {
  for (const status of [401, 403, 404]) {
    let readStatus = 503;
    const service = createTutorSupportClient({
      get: async () => readStatus === 200 ? Response.json({ ...schedule, slots: [], sessions: [] }) : new Response(null, { status: readStatus }),
      command: async () => new Response(null, { status }),
    });
    await mount(ConnectedSchedule, { data: schedule, week: 0, query: { date }, editor: service.slotEditor, reload: (signal) => service.schedule(0, signal) });
    assert.ok(screenContains("Ruang privat"));
    await press("tutor-schedule-calendar-event-slot-slot-private");
    assert.ok(screenContains("Catatan privat"));
    await press("Simpan slot");
    for (const value of ["Ruang privat", "Topik privat", "Catatan privat", "Tambah slot"]) assert.equal(screenContains(value), false, value);
    await press("Coba lagi");
    assert.equal(screenContains("Topik privat"), false);
    readStatus = 200;
    await press("Coba lagi");
    assert.ok(screenContains("Tambah slot"));
    assert.equal(screenContains("Catatan privat"), false);
    unmount();
  }
});

test("Tutor schedule retains rows after a transient reload and removes them after access ends", async () => {
  let readStatus = 503;
  const service = createTutorSupportClient({
    get: async () => new Response(null, { status: readStatus }),
    command: async (_path, { requestId }) => Response.json({ slotId: "slot-private", date, requestId }),
  });
  await mount(ConnectedSchedule, { data: schedule, week: 0, query: { date }, editor: service.slotEditor, reload: (signal) => service.schedule(0, signal) });
  await press("tutor-schedule-calendar-event-slot-slot-private");
  await press("Simpan slot");
  assert.ok(screenContains("Topik privat"));
  assert.ok(screenContains("Jadwal perlu diperbarui"));
  readStatus = 403;
  await press("Coba lagi");
  assert.equal(screenContains("Topik privat"), false);
  assert.equal(screenContains("Ruang privat"), false);
  assert.ok(screenContains("Jadwal tidak dapat diakses."));
});

test("Enrollment token lookup and command denials clear codes and details until the list is authorized again", async () => {
  const code = "Zyx-A1B2C3D4-15-1";
  const token = { id: "token-private", status: "active", capacity: 15, used: 1, expiresAt: "2027-01-01T00:00:00Z",
    courses: [{ id: "course", title: "Mata kuliah privat" }], revision: "a".repeat(64) };
  const list = { type: "page", rows: [{ id: token.id, title: code, tokenActive: true }], nextPage: false };
  for (const [editorStatus, commandStatus] of [[200, 401], [200, 403], [200, 404], [403, 200]]) {
    let listStatus = 200;
    let listReads = 0;
    const calls = [];
    const transport = {
      accountId: "admin",
      async get(path) {
        if (path.includes("/token-editor/")) return editorStatus === 200 ? Response.json({ type: "token", token }) : new Response(null, { status: editorStatus });
        listReads++;
        return listStatus === 200 ? Response.json(list) : new Response(null, { status: listStatus });
      },
      async command(_path, payload) {
        calls.push(payload);
        return new Response(null, { status: calls.length === 1 ? 503 : commandStatus });
      },
    };
    await mount(AdministrationLiveScreen, { path: "/admin/tokens", params: {}, transport, actor: { id: "admin", role: "admin" } });
    assert.ok(screenContains(code));
    await press("Cabut token");
    if (editorStatus === 200) {
      assert.ok(screenContains("Mata kuliah privat"));
      await press("academic-live-token-revoke-confirm");
      assert.ok(screenContains("Hasil permintaan belum diketahui."));
      assert.ok(screenContains(code));
      await press("Periksa dengan percobaan ulang");
      assert.deepEqual(calls[0], calls[1]);
    }
    assert.equal(screenContains(code), false);
    assert.equal(screenContains("Mata kuliah privat"), false);
    assert.equal(listReads, 1);
    listStatus = 403;
    await press("Coba lagi");
    assert.equal(screenContains(code), false);
    listStatus = 200;
    await press("Coba lagi");
    assert.ok(screenContains(code));
    assert.equal(screenContains("Mata kuliah privat"), false);
    if (editorStatus === 200) {
      await press("Cabut token");
      assert.equal(screenContains("Hasil permintaan belum diketahui."), commandStatus !== 404);
    }
    unmount();
  }
});

test("Group membership recovery hides the target and retry until a fresh read authorizes the exact pending action", async () => {
  const retry = "Periksa dengan percobaan ulang";
  const id = "private-group";
  const old = { id: "person", name: "Nama privat lama", email: "lama@fixture.test" };
  const fresh = { ...old, name: "Nama privat baru", email: "baru@fixture.test" };
  const group = { id, name: "Kelompok privat", revision: "a".repeat(64), canAdd: true,
    members: [{ ...old, membershipId: "membership", role: "member" }], candidates: [], nextPage: false };
  for (const status of [401, 403, 404, 503]) {
    let read;
    let defer = false;
    let deniedCount = 0;
    const requests = [];
    const transport = {
      accountId: "admin",
      async get(path) {
        const url = new URL(path, "https://fixture.test");
        if (!requests.length) return Response.json(group);
        const { body, requestId } = requests[0];
        assert.equal(url.searchParams.get("retryRequestId"), requestId);
        assert.equal(url.searchParams.get("retryUserId"), body.userId);
        assert.equal(url.searchParams.get("retryAction"), body.action);
        assert.equal(url.searchParams.get("retryRevision"), body.expectedRevision);
        if (defer) return new Promise((resolve) => { read = resolve; });
        return Response.json({ ...group, members: [], recoveryTarget: fresh });
      },
      async command(_path, payload) {
        requests.push(payload);
        return new Response(null, { status: 503 });
      },
    };
    const props = { id, transport, close: noop, denied: () => deniedCount++, saved: noop };
    await mount(StudyGroupMembersEditor, props);
    await press("Keluarkan");
    assert.ok(screenContains(old.email));
    await press("Keluarkan");
    assert.ok(screenContains(fresh.email));
    assert.equal(screenContains(old.email), false);
    unmount();

    defer = true;
    await mount(StudyGroupMembersEditor, props);
    function assertNoRecoveryDetails() {
      for (const value of [old.email, fresh.email, old.name, fresh.name, retry]) assert.equal(screenContains(value), false, value);
    }
    assertNoRecoveryDetails();
    assert.ok(screenContains("Memuat anggota…"));
    await act(async () => { read(new Response(null, { status })); });
    assertNoRecoveryDetails();
    assert.equal(requests.length, 1);
    assert.equal(deniedCount, status === 401 || status === 403 ? 1 : 0);
    if (status === 503) {
      await press("Muat ulang anggota");
    } else {
      unmount();
      await mount(StudyGroupMembersEditor, props);
    }
    assertNoRecoveryDetails();
    await act(async () => { read(Response.json({ ...group, members: [], recoveryTarget: fresh })); });
    assert.ok(screenContains(fresh.email));
    assert.ok(screenContains(retry));
    assert.equal(screenContains(old.email), false);
    defer = false;
    await press(retry);
    assert.deepEqual(requests[0], requests[1]);
    unmount();
  }
});

test("The native PDF title form rejects NUL without sending a command and accepts a correction", async () => {
  const calls = [];
  let refreshes = 0;
  const client = createAcademicClient({
    async command(path, command) {
      calls.push({ path, command });
      return Response.json({ status: "saved", requestId: command.requestId });
    },
  });
  const target = client.updateMaterial("course-one", "material-one");
  const revision = "a".repeat(64);
  await mount(LivePdfTitleEdit, { target, initial: { title: "Judul awal", revision }, refresh: () => refreshes++ });
  await press("course-material-edit-title");
  const input = renderer.root.findAllByType("TextInput").find((node) => node.props.testID === "course-material-title");
  assert.ok(input);
  act(() => input.props.onChangeText("Mo\0dul"));
  await press("course-material-save-title");
  assert.ok(screenContains("Periksa judul dokumen."));
  assert.deepEqual(calls, []);
  assert.equal(target.pending(), null);
  act(() => input.props.onChangeText("  Modul kegiatan  "));
  await press("course-material-save-title");
  assert.equal(refreshes, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].command.body, { title: "Modul kegiatan", expectedRevision: revision });
});

function CourseFixture(props) {
  return h(AdminCourseFixtureProvider, { scenario: props.scenario }, h(CourseScreen, {
    actor: { id: "academic-admin", role: "admin" }, ...props,
  }));
}

test("Admin fixture course list shows metadata and keeps category and search filters actionable", async () => {
  const paths = [];
  await mount(CourseFixture, { scenario: "populated", path: "/admin/courses", params: {}, navigate: (path) => paths.push(path) });
  assert.ok(screenContains("Semua (3)"));
  assert.ok(screenContains("academic-course-1"));
  assert.ok(screenContains("Premium"));
  assert.ok(screenContains("2 bab · 3 dokumen · 3 kuis"));
  assert.equal(screenContains("course-search-input"), false);
  await press("course-category");
  await press("course-category-Biologi");
  await press("course-search-trigger");
  const input = renderer.root.findAllByType("TextInput").find((node) => node.props.testID === "course-search-input");
  assert.ok(input);
  act(() => input.props.onChangeText("biologi"));
  assert.ok(screenContains("Biologi Dasar"));
  assert.equal(screenContains("Fisika Dasar"), false);
  await press("course-row-biologi-dasar");
  assert.deepEqual(paths, ["/admin/courses/biologi-dasar"]);
  await press("course-search-clear");
  await press("course-search-close");
  assert.equal(screenContains("course-search-input"), false);
  assert.equal(screenContains("Fisika Dasar"), false);
  await press("course-clear-filters");
  assert.ok(screenContains("Fisika Dasar"));
});

test("Admin course detail recovers to the chapter list and retains its chapter and section actions", async () => {
  const paths = [];
  await mount(CourseFixture, { scenario: "error", path: "/admin/courses/biologi-dasar", params: { slug: "biologi-dasar" },
    navigate: (path) => paths.push(path), theme: "dark" });
  assert.ok(screenContains("Data mata kuliah gagal dimuat."));
  await press("course-retry");
  assert.ok(screenContains("2 bab"));
  assert.ok(screenContains("Fungsi organel dan membran sel."));
  for (const [number, title] of [[1, "Struktur sel"], [2, "Genetika dasar"]]) {
    const chapter = renderer.root.findAllByType("Pressable")
      .find((node) => node.props.testID === `course-chapter-academic-chapter-${number}`);
    assert.ok(chapter?.props.accessibilityLabel.startsWith(`${number}. ${title},`));
    assert.ok(chapter.findAllByType("Text").some((label) => label.children.includes(`Bab ${number}`)));
  }
  assert.equal(screenContains("course-link-analytics"), false);
  await press("course-chapter-create");
  await press("course-chapter-save");
  assert.ok(screenContains("Judul bab wajib diisi."));
  await press("course-chapter-cancel");
  await press("course-chapter-edit-academic-chapter-1");
  assert.ok(screenContains("course-chapter-dialog"));
  await press("course-chapter-cancel");
  await press("course-menu");
  await press("course-link-analytics");
  assert.deepEqual(paths, ["/admin/courses/biologi-dasar/analytics"]);
  assert.equal(screenContains("course-link-analytics"), false);
});

const pkaScheduleId = "pka-schedule-protected";
const pkaSchedulePath = "/admin/tutorial-pka/schedules";
const pkaInitial = {
  title: "Judul jadwal PKA privat", sessionAt: "2026-11-29T06:00:37.543Z",
  meetLink: "https://meet.google.com/pka-private-old", revision: "a".repeat(64),
};
const pkaLatest = {
  title: "Judul jadwal PKA terbaru", sessionAt: "2026-11-30T07:15:45.321Z",
  meetLink: "https://meet.google.com/pka-private-new", revision: "b".repeat(64),
};

function pkaSchedulePage(schedule) {
  return { type: "page", rows: schedule ? [{
    id: pkaScheduleId, title: schedule.title, fields: [{ label: "Tautan Meet", value: schedule.meetLink }],
    pkaScheduleEdit: schedule,
  }] : [], nextPage: false };
}

test("PKA schedule terminal write responses hide the schedule and discard the uncertain draft", async () => {
  for (const status of [401, 403, 404]) {
    let schedule = pkaInitial;
    const calls = [];
    const transport = {
      accountId: "admin",
      async get() { return Response.json(pkaSchedulePage(schedule)); },
      async command(_path, command) {
        calls.push(command);
        return new Response(null, { status: calls.length === 1 ? 503 : status });
      },
    };
    await mount(AdministrationLiveScreen, { path: pkaSchedulePath, params: {}, transport, actor: { id: "admin", role: "admin" } });
    await press("Edit jadwal");
    assert.ok(screenContains(pkaInitial.meetLink));
    await press("academic-admin-save");
    assert.ok(screenContains("Hasil penyimpanan belum diketahui."));
    await press("Periksa dengan percobaan ulang");
    assert.deepEqual(calls[0], calls[1]);
    for (const stale of [pkaInitial.title, pkaInitial.meetLink, "Edit jadwal PKA", "Periksa dengan percobaan ulang"]) {
      assert.equal(screenContains(stale), false, stale);
    }
    assert.ok(screenContains(status === 404 ? "Jadwal tidak ditemukan." : "Akses admin diperlukan."));
    schedule = status === 404 ? undefined : pkaLatest;
    await press("Coba lagi");
    assert.equal(screenContains(pkaInitial.title), false);
    if (schedule) {
      await press("Edit jadwal");
      assert.ok(screenContains(pkaLatest.meetLink));
      assert.equal(screenContains("Periksa dengan percobaan ulang"), false);
    }
    unmount();
  }
});

test("PKA rejects NUL before sending and rebases disjoint fields without losing the precise instant", async () => {
  const calls = [];
  const transport = {
    accountId: "admin",
    async get() { return Response.json(pkaSchedulePage(calls.length === 2 ? { ...pkaLatest, title: "Judul lokal" } : pkaInitial)); },
    async command(_path, command) {
      calls.push(command);
      return calls.length === 1
        ? Response.json({ status: "conflict", id: pkaScheduleId, requestId: command.requestId, schedule: pkaLatest }, { status: 409 })
        : Response.json({ status: "saved", id: pkaScheduleId, requestId: command.requestId, schedule: { ...pkaLatest, title: "Judul lokal" } });
    },
  };
  await mount(AdministrationLiveScreen, { path: pkaSchedulePath, params: {}, transport, actor: { id: "admin", role: "admin" } });
  await press("Edit jadwal");
  const input = renderer.root.findAllByType("TextInput").find((node) => node.props.testID === "academic-live-pka-schedule-title");
  assert.ok(input);
  act(() => input.props.onChangeText("Judul\0invalid"));
  await press("academic-admin-save");
  assert.equal(calls.length, 0);
  assert.ok(screenContains("Isi judul, tanggal dan jam (WIB)."));
  act(() => input.props.onChangeText("Judul lokal"));
  const meetInput = renderer.root.findAllByType("TextInput").find((node) => node.props.testID === "academic-live-pka-schedule-meet");
  assert.ok(meetInput);
  act(() => meetInput.props.onChangeText(`${pkaInitial.meetLink}\0`));
  await press("academic-admin-save");
  assert.equal(calls.length, 0);
  assert.ok(screenContains("Periksa tautan HTTPS."));
  act(() => meetInput.props.onChangeText(pkaInitial.meetLink));
  await press("academic-admin-save");
  assert.equal(calls[0].body.sessionAt, pkaInitial.sessionAt);
  assert.ok(screenContains("Jadwal sudah diubah."));
  await press("Gunakan revisi terbaru");
  assert.ok(screenContains("Judul lokal"));
  assert.ok(screenContains(pkaLatest.meetLink));
  assert.equal(screenContains(pkaInitial.meetLink), false);
  await press("academic-admin-save");
  assert.deepEqual(calls[1].body, { title: "Judul lokal", sessionAt: pkaLatest.sessionAt,
    meetLink: pkaLatest.meetLink, expectedRevision: pkaLatest.revision });
  assert.notEqual(calls[0].requestId, calls[1].requestId);
});

test("Admin tryout bank denial hides the draft, saved questions and picker until a successful GET", async () => {
  const exam = {
    id: "tryout-private", title: "Tryout privat", status: "draft", timeLimitMinutes: 45, maxAttempts: 1, revision: 0,
    questionSetRevision: "a".repeat(64), openAt: null, closeAt: null,
    questions: [{ id: "tryout-saved", prompt: "Soal rahasia tersimpan", type: "essay", options: [], correctIndices: [],
      acceptableAnswers: [], revision: 0, order: 1, acceptsFile: false }],
  };
  const course = { id: "academic-course", slug: "biologi", title: "Mata kuliah privat" };
  const bank = [{ id: "tryout-bank-choice", prompt: "Soal bank rahasia", type: "essay", tags: [], difficulty: "easy" }];
  const context = { actor: { id: "admin", role: "admin" }, scope: { kind: "admin", slug: course.slug }, scenario: "populated" };
  for (const status of [401, 403]) {
    let readStatus = 200;
    const gateway = createAssessmentReadGateway({
      accountId: "admin",
      get: async () => readStatus === 200 ? Response.json({ course, tryouts: [exam], bank }) : new Response(null, { status: readStatus }),
      command: async () => new Response(null, { status }),
    });
    await mount(Tryouts, { gateway, context, base: "/admin/courses/biologi" });
    await press("academic-tryout-questions-tryout-private");
    assert.ok(screenContains("Soal rahasia tersimpan"));
    await press("academic-tryout-import");
    await press("academic-picker-tryout-bank-choice");
    assert.ok(screenContains("Soal bank rahasia"));
    await press("academic-tryout-import-confirm");
    for (const value of [course.title, exam.title, exam.questions[0].prompt, bank[0].prompt]) {
      assert.equal(screenContains(value), false);
    }
    readStatus = 403;
    await press("academic-tryout-access-reload");
    assert.equal(screenContains(exam.title), false);
    readStatus = 200;
    await press("academic-tryout-access-reload");
    assert.equal(screenContains(exam.title), true);
    assert.equal(screenContains(bank[0].prompt), false);
    unmount();
  }
});

test("Admin Idea review exposes scoped evidence, supports cancel and exact retry, and reloads conflicts", async () => {
  const params = { slug: "fisika", bundleId: "idea-import" };
  const ideaId = "idea-velocity";
  const routePath = "/admin/courses/fisika/review/idea/idea-import";
  const itemPath = "/api/native/academic-administration/bundle/idea/fisika/idea-import/item/idea-velocity";
  const page = { type: "page", rows: [{ id: "row-idea", title: ideaId, ideaReviewId: ideaId }], nextPage: false };
  const target = { courseId: "course", importId: params.bundleId, ideaId, code: "KIN-VELOCITY",
    statement: "Kecepatan adalah perubahan posisi.", explanation: "Hubungkan posisi dan waktu.", latex: null,
    editable: true, sources: [{ title: "Kinematika", excerpt: "Kutipan bahan sumber", locator: "Halaman 1" }],
    review: { status: "pending", notes: "", expectedRevision: "a".repeat(64), expectedReviewRevision: "b".repeat(64) } };
  const calls = [];
  const transport = {
    accountId: "admin",
    get: async (path) => Response.json(path === itemPath ? target : page),
    command: async (path, init) => {
      assert.equal(path, itemPath);
      calls.push(init);
      if (calls.length === 1) return new Response(null, { status: 503 });
      if (calls.length === 3) return new Response(null, { status: 409 });
      return Response.json({ importId: params.bundleId, ideaId, requestId: init.requestId, status: init.body.status });
    },
  };
  async function changeNotes(notes) {
    const input = renderer.root.findAllByType("TextInput").find((node) => node.props.testID === "academic-idea-review-notes");
    assert.ok(input);
    await act(() => input.props.onChangeText(notes));
  }
  await mount(AdministrationLiveScreen, { path: routePath, params, transport, actor: { id: "admin", role: "admin" } });
  await press("Review Idea");
  assert.ok(screenContains("Kutipan bahan sumber"));
  await changeNotes("Catatan yang dibatalkan");
  await press("Batal");
  assert.equal(calls.length, 0);
  await press("Review Idea");
  assert.equal(screenContains("Catatan yang dibatalkan"), false);
  await changeNotes("Perjelas kaitan dengan sumber.");
  await press("academic-admin-save");
  assert.equal(calls.length, 1);
  await press("Tutup");
  await press("Review Idea");
  assert.ok(screenContains("Perjelas kaitan dengan sumber."));
  await press("academic-idea-review-retry");
  assert.deepEqual(calls[0], calls[1]);
  assert.ok(screenContains("Review Idea tersimpan."));
  await press("Review Idea");
  await changeNotes("Keputusan lama");
  await press("academic-admin-save");
  assert.ok(screenContains("Idea atau keputusan review telah berubah."));
  target.review.notes = "Catatan dari server";
  await press("Coba lagi");
  assert.ok(screenContains("Catatan dari server"));
  assert.equal(screenContains("Keputusan lama"), false);
});
