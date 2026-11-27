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

const frames = new Map();
let nextFrame = 0;
global.requestAnimationFrame = (callback) => {
  const frame = ++nextFrame;
  frames.set(frame, callback);
  return frame;
};
global.cancelAnimationFrame = (frame) => frames.delete(frame);

const platform = {
  OS: "web",
  select(options) { return options[this.OS] ?? options.default; },
};
const focusEvents = [];
let windowWidth = 380;
const nativeHost = {
  AccessibilityInfo: { sendAccessibilityEvent: (target, event) => focusEvents.push([target.testID, event]) },
  ActivityIndicator: "ActivityIndicator",
  I18nManager: { isRTL: false },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: ({ children, ...props }) => React.createElement("Modal", props, props.visible ? children : null),
  Platform: platform,
  Pressable: React.forwardRef(function Pressable({ children, ...props }, ref) {
    const content = typeof children === "function" ? children({ pressed: false }) : children;
    return React.createElement("Pressable", { ...props, ref }, content);
  }),
  ScrollView: "ScrollView",
  StyleSheet: {
    create: (styles) => styles,
    flatten: (styles) => Object.assign({}, ...[styles].flat(Infinity).filter(Boolean)),
  },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  useColorScheme: () => "light",
  useWindowDimensions: () => ({ width: windowWidth, height: 752, fontScale: 1 }),
};

const mobilePath = resolve(__dirname, "../../../apps/mobile-native/features/shared-ui");
const built = buildSync({
  stdin: {
    contents: `
      export * from "./controls";
      export * from "./ControlCases";
      export * from "./overlays";
      export { Button } from "../../components/Button";
    `,
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
  "react-native-safe-area-context": {
    SafeAreaListener: "SafeAreaListener",
    SafeAreaView: "SafeAreaView",
    useSafeAreaInsets: () => ({ left: 0, top: 24, right: 0, bottom: 24 }),
  },
  "react-native-svg": { __esModule: true, default: "svg", Path: "path" },
};
const entry = { exports: {} };
const execute = new Function("require", "module", "exports", built.outputFiles[0].text);
execute((id) => modules[id] ?? testRequire(id), entry, entry.exports);

const { Button, SharedDialog, SharedDialogFooter, SharedPopover, SharedPopoverAnchor, SharedUiComposer, SharedUiControlCase, SharedUiSearch } = entry.exports;
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

function flushAnimationFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => callbacks.forEach((callback) => callback()));
}

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  renderer = undefined;
  focusEvents.length = 0;
  platform.OS = "web";
  windowWidth = 380;
  frames.clear();
});

test("Dialog actions follow compact and wide reading order with focus on the same action", () => {
  function Example() {
    return h(SharedDialog, {
      open: true,
      onDismiss: () => {},
      title: "Permohonan",
      closeLabel: "Tutup",
      footer: h(SharedDialogFooter, null,
        h(Button, { testID: "cancel", variant: "outline" }, "Batal"),
        h(Button, { testID: "submit" }, "Ajukan permohonan"),
      ),
    }, "Alasan permohonan");
  }

  function actionOrder() {
    return renderer.root.findAllByType("Pressable")
      .map((node) => node.props.testID)
      .filter((id) => id === "cancel" || id === "submit");
  }

  function isFocused(id) {
    const style = host("Pressable", id).props.style({ pressed: false });
    return nativeHost.StyleSheet.flatten(style).outlineWidth === 2;
  }

  mount(h(Example));
  assert.deepEqual(actionOrder(), ["submit", "cancel"]);
  const compactFooter = renderer.root.findAllByType("View")
    .map((node) => nativeHost.StyleSheet.flatten(node.props.style))
    .find(({ flexDirection }) => flexDirection === "column");
  assert.equal(compactFooter?.alignItems, "stretch");
  act(() => host("Pressable", "submit").props.onFocus({}));

  windowWidth = 640;
  act(() => renderer.update(h(Example)));
  assert.deepEqual(actionOrder(), ["cancel", "submit"]);
  assert.equal(isFocused("submit"), true);
  assert.equal(isFocused("cancel"), false);
});

test("Ref-only popover remeasures after native show and restores focus after Android Back", () => {
  platform.OS = "android";
  let anchorY = 16;
  const anchorRef = { current: {
    testID: "trigger",
    measure: (callback) => callback(0, 0, 56, 32, 308, anchorY),
    focus: () => focusEvents.push(["trigger", "imperative"]),
  } };

  function Example() {
    const [open, setOpen] = useState(true);
    return h(SharedPopover, {
      open,
      onDismiss: () => setOpen(false),
      title: "Filter",
      closeLabel: "Tutup",
      anchorRef,
      align: "end",
      testID: "popover",
    }, "Semua kelas");
  }

  mount(h(Example));
  act(() => renderer.root.findByType("KeyboardAvoidingView").props.onLayout({
    nativeEvent: { layout: { width: 380, height: 800 } },
  }));
  flushAnimationFrame();
  assert.equal(nativeHost.StyleSheet.flatten(host("View", "popover").props.style).top, 52);
  anchorY = 40;
  const modal = renderer.root.findByType("Modal");
  act(() => modal.props.onShow());
  flushAnimationFrame();
  const position = nativeHost.StyleSheet.flatten(host("View", "popover").props.style);
  assert.equal(position.top, 76);
  assert.equal(position.left, 76);
  assert.equal(position.maxHeight, 688);

  assert.deepEqual(focusEvents.slice(-2), [["popover-close", "imperative"], ["popover-close", "focus"]]);
  act(() => modal.props.onRequestClose());
  flushAnimationFrame();
  assert.equal(host("View", "popover"), undefined);
  assert.deepEqual(focusEvents.slice(-2), [["trigger", "imperative"], ["trigger", "focus"]]);
});

test("Android popover uses native anchor and modal frames in dp for both opening orders", () => {
  platform.OS = "android";
  const triggerRef = React.createRef();
  const triggerFrame = { x: 308, y: 40, width: 56, height: 32 };

  function Example({ initiallyOpen }) {
    const [open, setOpen] = useState(initiallyOpen);
    return h(SharedPopoverAnchor, null,
      h(Button, { ref: triggerRef, testID: "trigger", onPress: () => setOpen(true) }, "Filter"),
      h(SharedPopover, {
        open,
        onDismiss: () => setOpen(false),
        title: "Filter",
        closeLabel: "Tutup",
        anchorRef: triggerRef,
        align: "end",
        testID: "popover",
      }, "Semua kelas"),
    );
  }

  function reportFrame(listener, frame, insets) {
    const view = renderer.root.findAllByType("SafeAreaListener")[listener];
    act(() => view.props.onChange({ frame, insets }));
  }

  function position() {
    return nativeHost.StyleSheet.flatten(host("View", "popover").props.style);
  }

  const screenInsets = { top: 24, left: 0, right: 0, bottom: 24 };
  mount(h(Example, { initiallyOpen: true }));
  const modal = renderer.root.findByType("Modal");
  act(() => modal.props.onShow());
  reportFrame(1, { x: 0, y: 0, width: 380, height: 800 }, screenInsets);
  flushAnimationFrame();
  assert.equal(host("View", "popover"), undefined);
  assert.deepEqual(focusEvents, []);
  reportFrame(0, triggerFrame, screenInsets);
  flushAnimationFrame();
  assert.equal(position().top, 76);
  assert.equal(position().left, 76);
  assert.deepEqual(focusEvents.at(-1), ["popover-close", "focus"]);
  act(() => modal.props.onRequestClose());
  flushAnimationFrame();
  assert.equal(host("View", "popover"), undefined);
  assert.deepEqual(focusEvents.at(-1), ["trigger", "focus"]);

  click("trigger");
  assert.equal(host("View", "popover"), undefined);
  const modalInsets = { ...screenInsets, top: 0 };
  const shiftedModal = { x: 20, y: 24, width: 360, height: 776 };
  reportFrame(1, shiftedModal, modalInsets);
  assert.equal(shiftedModal.y + position().top, 76);
  assert.equal(shiftedModal.x + position().left, 76);

  reportFrame(0, { ...triggerFrame, y: 140 }, screenInsets);
  reportFrame(1, { ...shiftedModal, height: 212 }, modalInsets);
  assert.equal(position().bottom, 100);
  assert.equal(position().maxHeight, 100);
});

test("Popovers stay usable when a measured anchor is unavailable", (context) => {
  platform.OS = "android";
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const triggerRef = React.createRef();
  const dismissals = [];

  function Example({ tracked, dismissDisabled }) {
    const [open, setOpen] = useState(true);
    const popover = h(SharedPopover, {
      open,
      onDismiss: (reason) => { dismissals.push(reason); setOpen(false); },
      title: "Filter",
      closeLabel: "Tutup",
      anchorRef: triggerRef,
      dismissDisabled,
      testID: "popover",
    }, "Semua kelas");
    return tracked ? h(SharedPopoverAnchor, null, popover) : popover;
  }

  function assertCentered() {
    const viewport = renderer.root.findByType("KeyboardAvoidingView");
    const panel = host("View", "popover");
    assert.equal(nativeHost.StyleSheet.flatten(viewport.props.style).justifyContent, "center");
    assert.equal(nativeHost.StyleSheet.flatten(panel.props.style).position, undefined);
  }

  mount(h(Example, { key: "ref-only" }));
  assertCentered();
  click("popover-close");
  flushAnimationFrame();
  assert.deepEqual(dismissals, ["close-button"]);

  act(() => renderer.update(h(Example, { key: "tracked", tracked: true, dismissDisabled: true })));
  act(() => renderer.root.findByType("Modal").props.onShow());
  assert.equal(host("View", "popover"), undefined);
  act(() => context.mock.timers.tick(300));
  flushAnimationFrame();
  assertCentered();
  assert.equal(host("Pressable", "popover-close").props.disabled, true);

  const focusBeforeLateFrames = [...focusEvents];
  const [trigger, viewport] = renderer.root.findAllByType("SafeAreaListener");
  const insets = { left: 0, top: 24, right: 0, bottom: 24 };
  act(() => trigger.props.onChange({ insets, frame: { x: 308, y: 40, width: 56, height: 32 } }));
  act(() => viewport.props.onChange({ insets, frame: { x: 0, y: 0, width: 380, height: 800 } }));
  flushAnimationFrame();
  const panelStyle = nativeHost.StyleSheet.flatten(host("View", "popover").props.style);
  assert.equal(panelStyle.top, 76);
  assert.deepEqual(focusEvents, focusBeforeLateFrames);

  act(() => renderer.update(h(Example, { key: "tracked", tracked: true })));
  click("popover-close");
  flushAnimationFrame();
  assert.deepEqual(dismissals, ["close-button", "close-button"]);
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
