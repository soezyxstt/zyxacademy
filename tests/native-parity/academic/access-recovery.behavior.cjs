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
      export { createTutorSupportClient } from "./tutor/support-client";
      export { AdministrationLiveScreen } from "./administration/live-screen";
      export { LivePdfTitleEdit } from "./courses/live-material";
      export { createAcademicClient } from "./client";`,
    resolveDir: resolve(__dirname, "../../../apps/mobile-native/features/academic"),
  },
  bundle: true, packages: "external", format: "cjs", jsx: "automatic", loader: { ".ttf": "empty" }, write: false,
});
const entry = { exports: {} };
new Function("require", "module", "exports", built.outputFiles[0].text)((id) => dependencies[id] ?? testRequire(id), entry, entry.exports);
const { ConnectedSchedule, createTutorSupportClient, AdministrationLiveScreen, LivePdfTitleEdit, createAcademicClient } = entry.exports;

const noop = () => {};
const navigation = { theme: "light", back: noop, navigate: noop, replace: noop, query: {} };
let renderer;
async function mount(Component, props) {
  await act(() => { renderer = create(h(Component, { ...navigation, ...props })); });
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
