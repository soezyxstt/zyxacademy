const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { afterEach, test } = require("node:test");
const { buildSync } = require("esbuild");

const dependencyPrefix = process.env.ZYX_CONTROL_TEST_DEPS;
assert.ok(dependencyPrefix, "Set ZYX_CONTROL_TEST_DEPS to the test dependency prefix in CONTRACTS.md.");
const testRequire = createRequire(resolve(dependencyPrefix, "package.json"));
const React = testRequire("react");
const { act, create } = testRequire("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: "web" };
const focusEvents = [];
const nativeHost = {
  AccessibilityInfo: { sendAccessibilityEvent: (target, event) => focusEvents.push([target.testID, event]) },
  ActivityIndicator: "ActivityIndicator",
  I18nManager: { isRTL: false },
  Platform: platform,
  Pressable: "Pressable",
  StyleSheet: { create: (styles) => styles },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  useColorScheme: () => "light",
  useWindowDimensions: () => ({ width: 380, fontScale: 1 }),
};

const mobilePath = resolve(__dirname, "../../../apps/mobile-native/features/shared-ui");
const built = buildSync({
  stdin: {
    contents: 'export * from "./controls"; export * from "./ControlCases";',
    resolveDir: mobilePath,
  },
  bundle: true,
  external: ["react", "react/jsx-runtime", "react-native", "react-native-safe-area-context", "react-native-svg"],
  format: "cjs",
  jsx: "automatic",
  loader: { ".ttf": "empty" },
  write: false,
});

const modules = {
  "react-native": nativeHost,
  "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
  "react-native-svg": { __esModule: true, default: "svg", Path: "path" },
};
const entry = { exports: {} };
const execute = new Function("require", "module", "exports", built.outputFiles[0].text);
execute((id) => modules[id] ?? testRequire(id), entry, entry.exports);

const { SharedUiComposer, SharedUiControlCase, SharedUiSearch } = entry.exports;
const { createElement: h, useState } = React;
let renderer;

function mount(element) {
  act(() => {
    renderer = create(element, {
      createNodeMock: ({ props: { testID } }) => ({
        testID,
        focus: () => focusEvents.push([testID, "imperative"]),
      }),
    });
  });
}

function host(type, testID) {
  return renderer.root.findAllByType(type).find((node) => node.props.testID === testID);
}

function click(testID) {
  const button = host("Pressable", testID);
  assert.ok(button && !button.props.disabled, testID);
  act(() => button.props.onPress());
}

function type(testID, value) {
  const input = host("TextInput", testID);
  assert.ok(input?.props.editable, testID);
  act(() => input.props.onChangeText(value));
}

function key(testID, nativeEvent) {
  const input = host("TextInput", testID);
  const call = { prevented: false, stopped: false };
  act(() => input.props.onKeyPress({
    nativeEvent,
    preventDefault() { call.prevented = true; },
    stopPropagation() { call.stopped = true; },
  }));
  return call;
}

function visibleText(text) {
  return renderer.root.findAllByType("Text").some((node) => node.children.includes(text));
}

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  renderer = undefined;
  focusEvents.length = 0;
  platform.OS = "web";
});

test("Search opens, clears once in controlled mode, and restores trigger focus on Escape", () => {
  const queries = [];
  const expansions = [];
  const submissions = [];
  platform.OS = "android";

  function Example() {
    const [value, setValue] = useState("");
    const [expanded, setExpanded] = useState(false);
    return h(SharedUiSearch, {
      label: "Cari pertanyaan",
      clearLabel: "Hapus pencarian",
      value,
      onValueChange: (query) => { queries.push(query); setValue(query); },
      expansion: {
        expanded,
        closeLabel: "Tutup pencarian",
        onExpandedChange: (next) => { expansions.push(next); setExpanded(next); },
      },
      onSubmit: (query) => submissions.push(query),
      testID: "search",
    });
  }

  mount(h(Example));
  click("search-trigger");
  assert.deepEqual(focusEvents.at(-1), ["search-input", "imperative"]);
  type("search-input", "Gelombang");
  assert.equal(host("TextInput", "search-input").props.value, "Gelombang");
  assert.equal(host("Pressable", "search-clear").props.accessibilityLabel, "Hapus pencarian");
  act(() => host("TextInput", "search-input").props.onSubmitEditing({ nativeEvent: { text: "Gelombang" } }));
  assert.deepEqual(submissions, ["Gelombang"]);
  assert.deepEqual(key("search-input", { key: "Escape", isComposing: true }), { prevented: false, stopped: false });
  click("search-clear");
  assert.equal(host("TextInput", "search-input").props.value, "");
  assert.deepEqual(queries, ["Gelombang", ""]);
  assert.deepEqual(focusEvents.at(-1), ["search-input", "imperative"]);
  assert.deepEqual(key("search-input", { key: "Escape" }), { prevented: true, stopped: true });
  assert.deepEqual(expansions, [true, false]);
  assert.deepEqual(focusEvents.slice(-2), [["search-trigger", "imperative"], ["search-trigger", "focus"]]);
});

test("Status retries into a result and toolbar preserves search focus and dispatches action IDs", () => {
  mount(h(SharedUiControlCase, { id: "shared-ui-status-recovery" }));
  click("shared-ui-status-recovery-action");
  assert.equal(visibleText("3 pertanyaan dimuat"), true);
  assert.equal(visibleText("Pertanyaan gagal dimuat"), false);
  act(() => renderer.update(h(SharedUiControlCase, { id: "shared-ui-toolbar-compact" })));
  click("shared-ui-toolbar-compact-channel");
  assert.equal(visibleText("Kanal Fisika"), true);
  click("shared-ui-toolbar-compact-search-trigger");
  assert.deepEqual(focusEvents.at(-1), ["shared-ui-toolbar-compact-search-input", "imperative"]);
  assert.equal(host("Pressable", "shared-ui-toolbar-compact-create"), undefined);
  click("shared-ui-toolbar-compact-search-close");
  click("shared-ui-toolbar-compact-create");
  assert.equal(visibleText("Siap membuat pertanyaan"), true);
});

test("Composer sends the edited controlled draft, retains it on failure and makes retry explicit", () => {
  const requests = [];
  const selections = [];

  function Example() {
    const [draft, setDraft] = useState("");
    const [failed, setFailed] = useState(false);
    return h(SharedUiComposer, {
      label: "Tulis balasan",
      submitLabel: "Kirim",
      draft,
      onDraftChange: setDraft,
      onSelectionChange: (selection) => selections.push(selection),
      onSubmit: (text) => { requests.push(["submit", text]); setFailed(true); },
      recovery: failed ? {
        message: "Balasan belum terkirim.",
        retry: { label: "Coba lagi", onRetry: () => { requests.push(["retry", draft]); setFailed(false); } },
      } : undefined,
      testID: "composer",
    });
  }

  mount(h(Example));
  assert.equal(host("Pressable", "composer-submit").props.disabled, true);
  type("composer-input", "Jawaban");
  act(() => host("TextInput", "composer-input").props.onSelectionChange({ nativeEvent: { selection: { start: 4, end: 6 } } }));
  assert.deepEqual(selections, [{ start: 4, end: 6 }]);
  assert.deepEqual(key("composer-input", { key: "Enter", ctrlKey: true, isComposing: true }), { prevented: false, stopped: false });
  assert.deepEqual(requests, []);
  assert.deepEqual(key("composer-input", { key: "Enter", ctrlKey: true }), { prevented: true, stopped: false });
  assert.equal(host("TextInput", "composer-input").props.value, "Jawaban");
  assert.equal(visibleText("Balasan belum terkirim."), true);
  type("composer-input", "Jawaban revisi");
  click("composer-submit");
  assert.deepEqual(requests, [["submit", "Jawaban"], ["retry", "Jawaban revisi"]]);
  assert.equal(visibleText("Balasan belum terkirim."), false);
});

test("Composer supports a locked uncertain replay through the caller's original request", () => {
  const original = { id: "request-1", text: "Jawaban" };
  const requests = [];
  mount(h(SharedUiComposer, {
    label: "Tulis balasan",
    submitLabel: "Kirim",
    draft: original.text,
    editingDisabled: true,
    onDraftChange: assert.fail,
    onSubmit: assert.fail,
    recovery: {
      message: "Status kirim belum pasti.",
      retry: { label: "Coba lagi", onRetry: () => requests.push(original) },
    },
    testID: "composer",
  }));
  assert.equal(host("TextInput", "composer-input").props.editable, false);
  click("composer-submit");
  assert.equal(requests[0], original);
});
