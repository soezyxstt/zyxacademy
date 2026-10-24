// Exact filenames only. No arbitrary path, package installation or upstream URL.
export const PYTHON_RUNTIME_ASSETS = {
  "pyodide.js": "text/javascript",
  "pyodide.mjs": "text/javascript",
  "pyodide.asm.mjs": "text/javascript",
  "pyodide.asm.wasm": "application/wasm",
  "python_stdlib.zip": "application/zip",
  "pyodide-lock.json": "application/json",
} as const;
export const PYTHON_RUNTIME_REVISION = "314.0.7";
