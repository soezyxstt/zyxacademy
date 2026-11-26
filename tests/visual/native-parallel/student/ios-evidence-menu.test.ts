import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const { code } = transformSync(readFileSync(new URL("./ios-evidence-menu.tsx.in", import.meta.url), "utf8"), {
  loader: "tsx", format: "cjs", jsx: "automatic",
});

type Element = { props: { testID?: string; children?: unknown; onChangeText?(value: string): void; onPress?(): void } };

function setup(platform = "ios") {
  const params = {
    scenario: "populated", path: "/courses/math/quiz/quiz-1?attemptId=active&tag=a&tag=b",
    locale: "en", theme: "dark", store: "disk", query_section: ["first", "second"],
  };
  const calls: unknown[] = [];
  let selected = "";
  const element = (_type: unknown, props: Element["props"]): Element => ({ props });
  const dependencies: Record<string, unknown> = {
    "expo-router": { useRouter: () => ({ replace: (target: unknown) => calls.push(target) }) },
    react: { useState: () => [selected, (value: string) => { selected = value; }] },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "react-native": { Keyboard: { dismiss: () => calls.push("dismiss") }, Platform: { OS: platform }, StyleSheet: { create: (styles: unknown) => styles } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "../features/student/ios-evidence-cases.json": { "001": { params } },
  };
  const module: { exports?: { default: () => Element | null } } = {};
  new Function("module", "require", code)(module, (name: string) => dependencies[name]);
  return { render: module.exports!.default, params, calls };
}

describe("iOS Student evidence menu", () => {
  test("opens the genuine fixture with the selected parameters intact", () => {
    const { render, params, calls } = setup();
    const first = render()!;
    expect(first.props.testID).toBe("student-ios-menu");
    const [, input, initialButton] = first.props.children as [Element, Element, unknown];
    expect(input.props.testID).toBe("student-ios-case-input");
    expect(initialButton).toBeUndefined();
    input.props.onChangeText!("001");
    const [, , button] = render()!.props.children as Element[];
    expect(button.props.testID).toBe("student-ios-case-001");
    button.props.onPress!();
    expect(calls).toEqual(["dismiss", { pathname: "/student-fixture", params }]);
  });

  test("does not render a menu for Android", () => {
    expect(setup("android").render()).toBeNull();
  });
});
