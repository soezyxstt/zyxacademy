import { describe, expect, test } from "bun:test";
import { selectPythonRuntime } from "@/lib/coding/runtime-selection";

describe("article Python runtime and draft selection", () => {
  test("free article examples stay in the browser even on a remote-enabled deployment", () => {
    expect(selectPythonRuntime({ demo: false, browserOnly: true, remoteAvailable: true }))
      .toEqual({ localOnly: true, remote: false });
  });
  test("enrolled users retain remote execution and synced drafts", () => {
    expect(selectPythonRuntime({ demo: false, browserOnly: false, remoteAvailable: true }))
      .toEqual({ localOnly: false, remote: true });
  });
  test("demo stays local and non-remote environments still sync enrolled drafts", () => {
    expect(selectPythonRuntime({ demo: true, browserOnly: false, remoteAvailable: true }))
      .toEqual({ localOnly: true, remote: false });
    expect(selectPythonRuntime({ demo: false, browserOnly: false, remoteAvailable: false }))
      .toEqual({ localOnly: false, remote: false });
  });
});
