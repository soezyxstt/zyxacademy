/* Runs only inside an opaque-origin iframe or a trusted isolated browser. */
self.onmessage = async ({ data }) => {
  if (data.type !== "run") return;
  const send = self.postMessage.bind(self);
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
    const lines = data.stdin.split("\n");
    let line = 0, stdout = "", stderr = "", truncated = false;
    const append = (channel, value) => {
      const available = Math.max(0, data.maxOutputChars - stdout.length - stderr.length);
      if (value.length > available) truncated = true;
      if (channel === "stdout") stdout += value.slice(0, available);
      else stderr += value.slice(0, available);
    };
    python.setStdin({ stdin: () => line < lines.length ? lines[line++] : null });
    python.setStdout({ write: (bytes) => { append("stdout", new TextDecoder().decode(bytes)); return bytes.length; } });
    python.setStderr({ write: (bytes) => { append("stderr", new TextDecoder().decode(bytes)); return bytes.length; } });
    // Runtime assets are loaded. Enforce offline CSP before any learner code.
    send({ type: "ready" });
    await new Promise((resolve) => { self.onmessage = (event) => { if (event.data.type === "execute") resolve(); }; });
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
    send({ type: "result", result: { status, stdout, stderr, truncated } });
  } catch {
    send({ type: "result", result: { status: "unavailable", stdout: "", stderr: "Python belum dapat dimuat. Coba lagi.", truncated: false } });
  }
};
