/* Runs only inside an opaque-origin iframe or a trusted isolated browser. */
self.onmessage = async ({ data }) => {
  if (data.type !== "run") return;
  const send = self.postMessage.bind(self);
  try {
    const { loadPyodide } = await import(data.assetBase + "pyodide.mjs?v=" + data.revision);
    const python = await loadPyodide({
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
