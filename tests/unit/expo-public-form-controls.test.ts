import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { nativeColors, nativeRadii } from "../../packages/design-tokens/native-colors";
import * as fileTypes from "../../packages/forms/file-types";
import * as presentation from "../../packages/forms/presentation";
import * as responsePolicy from "../../packages/forms/response-policy";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import * as copy from "../../apps/mobile-native/features/public-forms/copy";
import * as model from "../../apps/mobile-native/features/public-forms/model";

type Node = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Node["props"]) => ({ type, props });

function find(tree: unknown, predicate: (node: Node) => boolean): Node | undefined {
  if (Array.isArray(tree)) return tree.map(item => find(item, predicate)).find(Boolean);
  if (!tree || typeof tree !== "object" || !("type" in tree) || !("props" in tree)) return undefined;
  const node = tree as Node;
  return predicate(node) ? node : find(node.props.children, predicate);
}

const byId = (root: unknown, id: string) => find(root, node => node.props.testID === id);

async function harness(file: "response" | "fields", OS: "android" | "ios" = "android") {
  const compiled = await Bun.build({ entrypoints: [`./apps/mobile-native/features/public-forms/${file}.tsx`], format: "cjs", external: ["*"] });
  const module = { exports: {} as Record<string, (props: Record<string, unknown>) => Node> };
  const hooks: unknown[] = [];
  const dialogs: { text: string; onPress(): void }[][] = [];
  let index = 0;
  const dependencies: Record<string, unknown> = {
    react: {
      useEffect() {}, useMemo: (run: () => unknown) => run(),
      useRef(initial: unknown) { const slot = index++; return hooks[slot] ??= { current: initial }; },
      useState(initial: unknown) {
        const slot = index++;
        if (!(slot in hooks)) hooks[slot] = typeof initial === "function" ? initial() : initial;
        return [hooks[slot], (next: unknown) => { hooks[slot] = typeof next === "function" ? next(hooks[slot]) : next; }];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx }, "react/jsx-dev-runtime": { jsxDEV: jsx, Fragment: "fragment" },
    "react-native": { Platform: { OS }, StyleSheet: { create: (value: unknown) => value }, View: "view", Text: "text",
      Pressable: "pressable", ScrollView: "scroll", useColorScheme: () => "light", useWindowDimensions: () => ({ fontScale: 1 }),
      Alert: { alert: (_title: string, _message: string, buttons: (typeof dialogs)[number]) => { dialogs.push(buttons); } } },
    "react-native-svg": {},
    "../../../../packages/design-tokens/native-colors": { nativeColors, nativeRadii },
    "../../../../packages/forms/file-types": fileTypes, "../../../../packages/forms/presentation": presentation,
    "../../../../packages/forms/response-policy": responsePolicy,
    "../../auth/session-api": { NATIVE_STAGING_ORIGIN },
    "../../components/Input": { Input: "input", Textarea: "textarea" }, "../../components/Button": { Button: "button" },
    "../../typography": { nativeTypography: {} }, "../../device/haptics": { hapticSuccess() {}, hapticError() {} },
    "../shared-ui/layout": {}, "./copy": copy, "./model": model, "./fields": { FormField: "field", formStyles: {} },
  };
  runInNewContext(await compiled.outputs[0].text(), { module, exports: module.exports, require: (name: string) => dependencies[name] });
  return { dialogs, render(props: Record<string, unknown>) {
    index = 0;
    return module.exports[file === "response" ? "PublicFormResponse" : "FormField"](props);
  } };
}

function form(displayMode: "question" | "section") {
  return { id: "fixture", slug: "fixture", title: "Pendaftaran", settings: { displayMode, collectEmail: "input" }, questions: [
    { type: "SECTION", title: "Bagian" }, { type: "STATEMENT", title: "Informasi" }, { type: "TEXT", title: "Nama", required: true },
    { type: "STATEMENT", title: "Tinjau" },
  ] };
}

test("question mode puts Back outside the scroller and keeps the advance inside only for non-question steps", async () => {
  const { render, dialogs } = await harness("response");
  const submit = Promise.withResolvers<{ status: "sent" }>();
  let submitted = 0;
  const props = { form: form("question"), locale: "id", onSubmit: () => { submitted += 1; return submit.promise; } };
  let tree = render(props);
  const tap = (id: string) => { (byId(tree, id)?.props.onPress as () => void)(); tree = render(props); };
  const footer = () => byId(tree, "public-form-footer");
  const scroll = () => find(tree, node => node.type === "scroll");
  const assertControls = (inFooter: boolean) => {
    expect(byId(footer(), "public-form-back")?.props).toMatchObject({ size: "lg", variant: "ghost" });
    expect(byId(inFooter ? footer() : scroll(), "public-form-next")?.props.size).toBe("lg");
    expect(byId(inFooter ? scroll() : footer(), "public-form-next")).toBeUndefined();
  };
  expect(footer()).toBeUndefined();
  expect(byId(tree, "public-form-exit")).toBeUndefined();
  expect(byId(scroll(), "public-form-next")?.props.accessibilityLabel).toBe(copy.publicFormCopy("id").start);
  tap("public-form-next");
  assertControls(false);
  (byId(tree, "public-form-email")?.props.onChangeText as (text: string) => void)("person@example.test");
  tree = render(props);
  tap("public-form-next"); // section
  assertControls(false);
  tap("public-form-next"); // statement
  assertControls(false);
  tap("public-form-next"); // question
  assertControls(true);
  (find(tree, node => node.type === "field")?.props.onValue as (text: string) => void)("Ari");
  tap("public-form-next"); // final statement
  assertControls(false);
  tap("public-form-next");
  expect(dialogs.length).toBe(1);
  expect(submitted).toBe(0);
  dialogs[0][0].onPress();
  tap("public-form-next");
  dialogs[1][1].onPress();
  tree = render(props);
  expect(submitted).toBe(1);
  expect(byId(scroll(), "public-form-next")?.props).toMatchObject({ disabled: true, isLoading: true });
  expect(byId(footer(), "public-form-back")?.props.disabled).toBe(true);
  submit.resolve({ status: "sent" });
  await submit.promise;
});

test("section navigation stays inline and the iOS header offers the existing exit action", async () => {
  const { render } = await harness("response", "ios");
  let exited = false;
  const tree = render({ form: form("section"), locale: "id", onDone: () => { exited = true; } });
  const controls = find(tree, node => node.type === "scroll");
  expect(byId(controls, "public-form-back")?.props).toMatchObject({ size: "default", variant: "outline", disabled: true });
  expect(byId(controls, "public-form-next")?.props.size).toBe("default");
  expect(byId(tree, "public-form-footer")).toBeUndefined();
  const exit = byId(tree, "public-form-exit");
  expect(exit?.props).toMatchObject({ accessibilityLabel: "Keluar dari formulir", style: { width: 44, height: 44 } });
  (exit?.props.onPress as () => void)();
  expect(exited).toBe(true);
});

test("iOS keeps the form mounted until a confirmed submission returns", async () => {
  const { render, dialogs } = await harness("response", "ios");
  const submit = Promise.withResolvers<{ status: "sent" }>();
  let exited = false;
  const props = {
    form: { ...form("section"), questions: [{ type: "TEXT", title: "Nama", required: false }],
      settings: { displayMode: "section", collectEmail: "none" } },
    locale: "id", onSubmit: () => submit.promise, onDone: () => { exited = true; },
  };
  const tree = render(props);
  const exit = byId(tree, "public-form-exit")?.props.onPress as () => void;
  (byId(tree, "public-form-next")?.props.onPress as () => void)();
  dialogs[0][1].onPress();
  exit();
  expect(exited).toBe(false);
  expect(byId(render(props), "public-form-exit")?.props.disabled).toBe(true);
  submit.resolve({ status: "sent" });
  await submit.promise;
});

test("a 36-point underline sits inside a 44-point non-duplicate touch target", async () => {
  const { render } = await harness("fields");
  const tree = render({ index: 0, question: { type: "TEXT", title: "Nama" }, locale: "id", colors: nativeColors.light });
  const wrapper = find(tree, node => node.type === "pressable");
  expect(wrapper?.props).toMatchObject({ accessible: false, focusable: false, style: { minHeight: 44 } });
  const input = byId(wrapper, "public-form-field-0");
  expect(input?.props.style).toMatchObject([{}, { height: 36 }]);
  let focused = false;
  (input?.props.ref as { current: unknown }).current = { focus: () => { focused = true; } };
  (wrapper?.props.onPress as () => void)();
  expect(focused).toBe(true);
});
