import assert from "node:assert/strict";
import { createTrustedPythonRuntime } from "../../lib/coding/server-runtime";

// Explicit opt-in, real provider and real Python. No DB or application API mocks.
if (process.env.RUN_CODING_RUNTIME_PROBE !== "1") throw new Error("CODING_RUNTIME_PROBE_OPT_IN_REQUIRED");
const runtime = await createTrustedPythonRuntime();
const limits = { timeoutMs: 1000, maxOutputChars: 1000 };
try {
  for (const [name, code, stdin, status, stdout] of [
    ["stdin", "secret = 42\nprint(int(input()) + 1)", "5", "completed", "6\n"],
    ["isolation", "print(secret)", "", "runtime_error", ""],
    ["filesystem-isolation", "open('/tmp/canary', 'w').write('secret')", "", "completed", ""],
    ["filesystem-reset", "print(open('/tmp/canary').read())", "", "runtime_error", ""],
    ["syntax", "for :", "", "syntax_error", ""],
    ["runtime", "print(1 / 0)", "", "runtime_error", ""],
    ["timeout", "while True: pass", "", "timeout", ""],
    ["fetch-blocked", 'import js\nawait js.fetch("https://example.com/coding-network-canary")', "", "runtime_error", ""],
    ["socket-blocked", 'import js\njs.WebSocket.new("wss://example.com/coding-network-canary")', "", "runtime_error", ""],
    ["after-timeout", "print(7)", "", "completed", "7\n"],
  ]) {
    const result = await runtime.execute({ code, stdin, limits });
    // Emit only synthetic result categories. Never log provider exceptions or connection URLs.
    console.log(JSON.stringify({ name, status: result.status }));
    assert.equal(result.status, status, name);
    assert.equal(result.stdout, stdout, name);
  }
  const output = await runtime.execute({ code: 'print("x" * 10000)', stdin: "", limits });
  assert.equal(output.status, "completed"); assert.equal(output.truncated, true); assert.equal(output.stdout.length, 1000);
  console.log(JSON.stringify({ name: "output-limit", passed: true }));
  const controller = new AbortController();
  const pending = runtime.execute({ code: "while True: pass", stdin: "", limits: { ...limits, timeoutMs: 10000 }, signal: controller.signal });
  setTimeout(() => controller.abort(), 250);
  assert.equal((await pending).status, "stopped");
  console.log(JSON.stringify({ name: "abort", passed: true }));
} finally {
  await runtime.close();
  console.log(JSON.stringify({ name: "provider-release", passed: true }));
}
