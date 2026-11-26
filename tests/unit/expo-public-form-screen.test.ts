import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { nativeColors } from "../../packages/design-tokens/native-colors";
import { plansGlowOffsets, plansOrnaments } from "../../packages/design-tokens/plans-ornaments";
import { publicFormFixtureClosure, publicFormFixtureEnvelope, publicFormFixtureTitle } from "../../packages/forms/parity-cases";
import * as copy from "../../apps/mobile-native/features/public-forms/copy";
import { parsePublicForm, type PublicFormLoad } from "../../apps/mobile-native/features/public-forms/model";

type Fixture = { state: PublicFormLoad; children?: string; browserFailed?: boolean; insideSafeArea?: boolean };
type Element = { type: string; props: Record<string, unknown> };
const node = (type: string, props: Record<string, unknown>): Element => ({ type, props });

async function testScreen() {
  const compiled = await Bun.build({ entrypoints: ["./apps/mobile-native/features/public-forms/screen.tsx"], format: "cjs", external: ["*"] });
  const module = { exports: {} as { PublicFormScreen(props: Record<string, unknown>): Element } };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": { jsx: node, jsxs: node },
    "react/jsx-dev-runtime": { jsxDEV: node },
    "react-native": { StyleSheet: { create: (value: unknown) => value }, Text: "text", View: "view", useColorScheme: () => "light" },
    "../../../../packages/design-tokens/native-colors": { nativeColors },
    "../shared-ui/layout": { NativeCompactShell: "shell", NativeStatusPanel: "panel" },
    "./copy": copy,
    "./fields": { formStyles: {} },
    "./status": { PublicFormPageFrame: "page", PublicFormStatus: "status" },
  };
  runInNewContext(await compiled.outputs[0].text(), { module, exports: module.exports, require: (name: string) => dependencies[name] });
  const onRetry = () => {};
  const onHome = () => {};
  const props = { onRetry, onHome, onBack: () => {}, onLogin: () => {}, onWeb: () => {}, onMeet: () => {} };
  return { render: (args: Fixture) => module.exports.PublicFormScreen({ ...props, locale: "id", access: "anonymous", ...args }), onRetry, onHome };
}

test("missing and closed forms use the full page and retain distinct home and recheck actions", async () => {
  const { render, onRetry, onHome } = await testScreen();
  const missing = render({ state: { status: "missing" } });
  const closed = render({ state: parsePublicForm(publicFormFixtureEnvelope("forms-closed"), "full") });
  expect(missing.type).toBe("page");
  expect(missing.props.children).toMatchObject({ type: "status", props: { kind: "missing", onHome } });
  expect(closed.type).toBe("page");
  expect(closed.props.children).toMatchObject({ type: "status", props: {
    kind: "closed", title: publicFormFixtureTitle, label: "Formulir ditutup", description: publicFormFixtureClosure.message, onHome,
  } });
  expect((closed.props.children as Element).props.recheck).toBeUndefined();
  const scheduled = render({ state: { status: "closed", title: "Jadwal", closure: { kind: "scheduled", opensAt: "2026-11-30T08:00:00Z" } } });
  expect(scheduled.props.children).toMatchObject({ props: { title: "Jadwal", recheck: { label: "Periksa status", run: onRetry }, onHome } });
});

test("the ready response gets full-bleed ornaments and keeps browser and login state", async () => {
  const { render } = await testScreen();
  const state = parsePublicForm(publicFormFixtureEnvelope("forms-ready"), "full");
  if (state.status !== "ready") throw new Error("Expected a ready form fixture.");
  const page = render({ state, children: "response", browserFailed: true, insideSafeArea: true });
  expect(page).toMatchObject({ type: "page", props: { ornamentOpacity: 0.3, insideSafeArea: true } });
  expect(page.props.children).toMatchObject([
    { type: "view", props: { children: { type: "text", props: { accessibilityRole: "alert" } } } }, "response",
  ]);
  const restricted = { ...state, form: { ...state.form, settings: { ...state.form.settings, requireLogin: true } } };
  expect(render({ state: restricted, children: "response" })).toMatchObject({ type: "shell", props: { children: [
    undefined, { type: "panel", props: { title: copy.publicFormCopy("id").loginRequired } },
  ] } });
});

test("plans ornament placement keeps the same rem and percent coordinates on web and native", () => {
  const positions = plansOrnaments.glows.map(glow => plansGlowOffsets(glow.position, value => value * 16));
  expect(positions).toEqual([{ top: -224, left: -192 }, { bottom: -208, right: -176 }, { top: "33.333333%", right: -224 }]);
  expect(plansGlowOffsets(plansOrnaments.glows[0].position, value => `${value}rem`)).toEqual({ top: "-14rem", left: "-12rem" });
});
