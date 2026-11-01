import { afterEach, describe, expect, test } from "bun:test";
import { getPlaygroundBridge, registerPlaygroundBridge, subscribePlaygroundBridge } from "../../components/coding/playground-bridge";

describe("Playground bridge", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => dispose?.());

  test("captures current context and protects edits until explicitly applied", () => {
    let code = "print(1)", revision = 0;
    const setCode = (next: string) => { code = next; revision++; };
    dispose = registerPlaygroundBridge("course", () => ({ kind: "playground", code, stdin: "input", execution: null, intent: "review" }), () => revision, setCode);
    const request = getPlaygroundBridge()!.capture();
    expect(request.context.code).toBe("print(1)");
    expect(request.context.stdin).toBe("input");
    setCode("print(2)");
    setCode("print(1)");
    expect(request.apply("print(3)")).toBe("changed");
    expect(code).toBe("print(1)");
    expect(request.apply("print(3)", true)).toBe("applied");
    expect(code).toBe("print(3)");
    expect(getPlaygroundBridge()!.capture().apply("print(4)")).toBe("applied");
    expect(code).toBe("print(4)");
  });

  test("rejects invalid code and stale editor registrations", () => {
    let notifications = 0;
    const unsubscribe = subscribePlaygroundBridge(() => notifications++);
    const context = () => ({ kind: "playground" as const, code: "", stdin: "", execution: null, intent: "review" as const });
    const oldDispose = registerPlaygroundBridge("old", context, () => 0, () => { throw new Error("stale editor"); });
    const stale = getPlaygroundBridge()!.capture();
    dispose = registerPlaygroundBridge("new", context, () => 0, () => {});
    oldDispose();
    expect(stale.apply("print(1)", true)).toBe("inactive");
    expect(getPlaygroundBridge()!.capture().apply(" ")).toBe("invalid");
    expect(getPlaygroundBridge()!.capture().apply("x".repeat(64_001))).toBe("invalid");
    dispose();
    expect(getPlaygroundBridge()).toBeNull();
    expect(notifications).toBe(3);
    unsubscribe();
  });
});
