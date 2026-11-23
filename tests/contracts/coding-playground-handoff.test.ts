import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { readPlaygroundHandoff, writePlaygroundHandoff } from "@/lib/coding/playground-handoff";

const firstOwner = { learnerId: "first", courseId: "course" };
const privateCode = { code: 'print("first account")', stdin: "private input" };

function memoryStorage(entries: Array<[string, string]> = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

type Slot = { value?: unknown; set?: (next: unknown) => void; deps?: unknown[] };
type Element = { type: unknown; key?: string; props: Record<string, any> };

// Run the real component with retained hook state and separately flushed effects.
// This checks the render before an owner change's effect, without a browser.
function playgroundHarness(storage: Pick<Storage, "getItem">) {
  const slots: Slot[] = [], effects: Array<() => void> = [];
  let cursor = 0, handoff: string | null = "entry";
  const slot = () => slots[cursor++] ?? (slots[cursor - 1] = {});
  const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => ({ type, props, key });
  const dependencies: Record<string, unknown> = {
    "react": {
      useState: (initial: unknown) => {
        const entry = slot();
        if (!entry.set) {
          entry.value = initial;
          entry.set = (next) => { entry.value = typeof next === "function" ? next(entry.value) : next; };
        }
        return [entry.value, entry.set];
      },
      useEffect: (effect: () => void, deps: unknown[]) => {
        const entry = slot();
        if (entry.deps?.length === deps.length && entry.deps.every((value, index) => value === deps[index])) return;
        entry.deps = deps;
        effects.push(effect);
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useSearchParams: () => ({ get: () => handoff }) },
    "./coding-workspace": { CodingWorkspace: "workspace" },
    "@/lib/coding/playground-handoff": { readPlaygroundHandoff },
  };
  const output = ts.transpileModule(readFileSync("components/coding/playground.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { Playground?: (props: typeof firstOwner) => Element } = {};
  runInNewContext(output, { exports, sessionStorage: storage, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return {
    render(owner = firstOwner, key: string | null = "entry") {
      cursor = 0; handoff = key;
      return exports.Playground!(owner);
    },
    flushEffects() { while (effects.length) effects.shift()!(); },
  };
}

function workspace(element: Element): Element {
  expect(element.type).toBe("div");
  expect(element.props.children.type).toBe("workspace");
  return element.props.children;
}

describe("Playground handoff ownership", () => {
  it("restores only the writer's account and course from the persisted payload", () => {
    const storage = memoryStorage();
    writePlaygroundHandoff(storage, "entry", { ...firstOwner, ...privateCode });
    expect(JSON.parse(storage.getItem("zyx-python-handoff:entry")!).learnerId).toBe("first");
    expect(readPlaygroundHandoff(storage, "entry", firstOwner)).toEqual(privateCode);
    expect(readPlaygroundHandoff(storage, "entry", { ...firstOwner, learnerId: "second" })).toBeNull();
    expect(readPlaygroundHandoff(storage, "entry", { ...firstOwner, courseId: "another-course" })).toBeNull();
    expect(() => writePlaygroundHandoff(storage, "unowned", { ...firstOwner, learnerId: "", ...privateCode })).toThrow();
    expect(storage.getItem("zyx-python-handoff:unowned")).toBeNull();
  });

  it("rejects legacy unowned entries, malformed data and oversized code or input", () => {
    for (const value of [
      { courseId: firstOwner.courseId, ...privateCode },
      { ...firstOwner, ...privateCode, code: "x".repeat(64_001) },
      { ...firstOwner, ...privateCode, stdin: "x".repeat(8001) },
      { ...firstOwner, ...privateCode, stdin: null },
      null,
    ]) {
      const storage = memoryStorage([["zyx-python-handoff:entry", JSON.stringify(value)]]);
      expect(readPlaygroundHandoff(storage, "entry", firstOwner)).toBeNull();
    }
    expect(readPlaygroundHandoff(memoryStorage([["zyx-python-handoff:entry", "not-json"]]), "entry", firstOwner)).toBeNull();
    expect(readPlaygroundHandoff({ getItem: () => { throw new Error("Storage unavailable"); } }, "entry", firstOwner)).toBeNull();
  });

  it("keeps history and receiving-tab reloads empty when the session belongs to another account", () => {
    const storage = memoryStorage();
    writePlaygroundHandoff(storage, "entry", { ...firstOwner, ...privateCode });
    for (const owner of [firstOwner, { ...firstOwner, learnerId: "second" }]) {
      // A fresh component reuses the tab's sessionStorage after the hard reload.
      const page = playgroundHarness(memoryStorage([...storage.values]));
      expect(page.render(owner).props.role).toBe("status");
      page.flushEffects();
      const editor = workspace(page.render(owner));
      expect(editor.props.initialCode).toBe(owner.learnerId === firstOwner.learnerId ? privateCode.code : "");
      expect(editor.props.initialStdin).toBe(owner.learnerId === firstOwner.learnerId ? privateCode.stdin : "");
    }
    const legacy = playgroundHarness(memoryStorage([["zyx-python-handoff:entry", JSON.stringify({ courseId: firstOwner.courseId, ...privateCode })]]));
    legacy.render(); legacy.flushEffects();
    expect(workspace(legacy.render()).props).toMatchObject({ initialCode: "", initialStdin: "" });
  });

  it("hides old code before the next effect and changes the workspace key when props reuse the page for another account", () => {
    const storage = memoryStorage();
    writePlaygroundHandoff(storage, "entry", { ...firstOwner, ...privateCode });
    const page = playgroundHarness(storage);
    page.render(); page.flushEffects();
    const first = workspace(page.render());
    expect(first.props.initialCode).toBe(privateCode.code);

    const secondOwner = { ...firstOwner, learnerId: "second" };
    const beforeEffect = page.render(secondOwner);
    expect(beforeEffect.props.role).toBe("status");
    expect(JSON.stringify(beforeEffect)).not.toContain(privateCode.code);
    expect(JSON.stringify(beforeEffect)).not.toContain(privateCode.stdin);
    page.flushEffects();
    const second = workspace(page.render(secondOwner));
    expect(second.props).toMatchObject({ learnerId: "second", initialCode: "", initialStdin: "" });
    expect(second.key).not.toBe(first.key);
  });

  it("clears the prior handoff when the URL or course changes", () => {
    const storage = memoryStorage();
    writePlaygroundHandoff(storage, "entry", { ...firstOwner, ...privateCode });
    const page = playgroundHarness(storage);
    page.render(); page.flushEffects();
    const first = workspace(page.render());
    expect(page.render(firstOwner, null).props.role).toBe("status");
    page.flushEffects();
    const empty = workspace(page.render(firstOwner, null));
    expect(empty.props).toMatchObject({ initialCode: "", initialStdin: "" });
    expect(empty.key).not.toBe(first.key);

    const otherCourse = { ...firstOwner, courseId: "another-course" };
    expect(page.render(otherCourse).props.role).toBe("status");
    page.flushEffects();
    expect(workspace(page.render(otherCourse)).props).toMatchObject({ initialCode: "", initialStdin: "" });
  });
});
