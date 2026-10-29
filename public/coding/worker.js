/* Runs only inside an opaque-origin iframe or a trusted isolated browser. */
self.onmessage = async ({ data }) => {
  if (data.type !== "run") return;
  const control = data.control;
  const send = control ? control.postMessage.bind(control) : self.postMessage.bind(self);
  try {
    // Trusted Submit preloads fixed runtime bytes through the intercepted page
    // target. Keep its Worker offline even when remote CDP misses Worker routes.
    // Older clients can still use the fixed public-asset loading path.
    if (data.preloaded) {
      const base = new URL(data.assetBase);
      self.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input, data.assetBase);
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        const name = url.pathname.slice(base.pathname.length);
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || method !== "GET" || !Object.hasOwn(data.preloaded.files, name)) throw new TypeError("Network access denied");
        const file = data.preloaded.files[name];
        return new Response(file.body, { headers: { "Content-Type": file.contentType } });
      };
    }
    send({ type: "phase", phase: "module" });
    const { loadPyodide } = await import(data.preloaded?.loaderUrl ?? data.assetBase + "pyodide.mjs?v=" + data.revision);
    const createPyodideModule = data.preloaded ? (await import(data.preloaded.moduleUrl)).default : undefined;
    send({ type: "phase", phase: "wasm-stdlib" });
    const python = await loadPyodide({
      createPyodideModule,
      indexURL: data.assetBase,
      lockFileURL: data.assetBase + "pyodide-lock.json?v=" + data.revision,
      // Version query is added to every fixed asset request by locateFile.
      stdLibURL: data.assetBase + "python_stdlib.zip?v=" + data.revision,
      packages: [],
      stdout: () => {}, stderr: () => {},
    });
    let lines = data.stdin.split("\n");
    let line = 0, stdout = "", stderr = "", truncated = false;
    const append = (channel, value) => {
      const available = Math.max(0, data.maxOutputChars - stdout.length - stderr.length);
      if (value.length > available) truncated = true;
      if (channel === "stdout") stdout += value.slice(0, available);
      else stderr += value.slice(0, available);
      if (data.interactive && available > 0) send({ type: "output", text: value.slice(0, available) });
    };
    python.setStdin({ stdin: () => line < lines.length ? lines[line++] : null });
    const stdoutDecoder = new TextDecoder(), stderrDecoder = new TextDecoder();
    python.setStdout({ write: (bytes) => { append("stdout", stdoutDecoder.decode(bytes, { stream: true })); return bytes.length; } });
    python.setStderr({ write: (bytes) => { append("stderr", stderrDecoder.decode(bytes, { stream: true })); return bytes.length; } });
    if (data.interactive && control) {
      if (!data.inputBuffer) {
        send({ type: "result", result: { status: "unavailable", stdout: "", stderr: "Browser ini belum mendukung input interaktif.", truncated: false } });
        return;
      }
      const inputState = new Int32Array(data.inputBuffer, 0, 2);
      const inputBytes = new Uint8Array(data.inputBuffer, 8);
      const wait = Atomics.wait.bind(Atomics), store = Atomics.store.bind(Atomics), load = Atomics.load.bind(Atomics);
      const decoder = new TextDecoder();
      python.setStdin({ stdin: () => {
        store(inputState, 0, 0);
        send({ type: "input-request" });
        wait(inputState, 0, 0);
        return decoder.decode(inputBytes.slice(0, load(inputState, 1)));
      } });
      await python.runPythonAsync(`import sys
sys.stdout.reconfigure(line_buffering=True, write_through=True)`);
    }
    if (data.interactive && !control) {
      if (typeof WebAssembly.Suspending !== "function") {
        send({ type: "result", result: { status: "unavailable", stdout: "", stderr: "Browser ini belum mendukung input interaktif.", truncated: false } });
        return;
      }
      python.registerJsModule("zyx_terminal", { read: () => new Promise((resolve) => {
        send({ type: "input-request" });
        self.onmessage = (event) => { if (event.data.type === "input") resolve(event.data.value); };
      }) });
      await python.runPythonAsync(`import builtins, sys
from pyodide.ffi import run_sync
from zyx_terminal import read
sys.stdout.reconfigure(line_buffering=True, write_through=True)
def _zyx_input(prompt=""):
    print(prompt, end="", flush=True)
    return run_sync(read())
builtins.input = _zyx_input`);
    }
    // Runtime assets are loaded. Enforce offline CSP before any learner code.
    send({ type: "ready" });
    await new Promise((resolve) => { const receive = (event) => {
      if (event.data.type !== "execute") return;
      if (data.prepare) {
        data.code = event.data.code;
        data.stdin = event.data.stdin;
        data.maxOutputChars = event.data.maxOutputChars;
        lines = data.stdin.split("\n");
        line = 0;
      }
      resolve();
    };
      if (control) { control.onmessage = receive; control.start(); }
      else self.onmessage = receive;
    });
    if (control) {
      self.onmessage = null;
      Object.defineProperty(self, "Worker", { value: undefined, writable: false, configurable: false });
      Object.defineProperty(self, "SharedWorker", { value: undefined, writable: false, configurable: false });
    }
    let status = "completed";
    try {
      const result = await python.runPythonAsync(data.code, { filename: "main.py" });
      if (result && typeof result.destroy === "function") result.destroy();
    } catch (error) {
      const message = String(error);
      status = /SyntaxError|IndentationError|TabError/.test(message) ? "syntax_error" : "runtime_error";
      const userFrame = message.indexOf('File "main.py"');
      append("stderr", userFrame >= 0 ? message.slice(userFrame) : message.split("\n").slice(-8).join("\n"));
    }
    append("stdout", stdoutDecoder.decode());
    append("stderr", stderrDecoder.decode());
    send({ type: "result", result: { status, stdout, stderr, truncated } });
  } catch {
    send({ type: "result", result: { status: "unavailable", stdout: "", stderr: "Python belum dapat dimuat. Coba lagi.", truncated: false } });
  }
};
