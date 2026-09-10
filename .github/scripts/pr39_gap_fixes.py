from pathlib import Path
import subprocess

# Reuse the reviewed full patch from the known pre-run commit. Pinning the
# source commit keeps this runner deterministic even when follow-up commits
# retrigger the temporary workflow.
PATCH_SOURCE_COMMIT = "6a929faea65fe3e4795d7f34d407a8061a6f17d1"
parent_script = subprocess.run(
    ["git", "show", f"{PATCH_SOURCE_COMMIT}:.github/scripts/pr39_gap_fixes.py"],
    check=True,
    capture_output=True,
    text=True,
).stdout
exec(compile(parent_script, f".github/scripts/pr39_gap_fixes.py@{PATCH_SOURCE_COMMIT}", "exec"), {"__name__": "__main__"})

# The source patch normalizes en/em dashes in touched files, including its own
# generated contract. Restore the contract using unicode escapes so ordinary
# ASCII hyphens are not rejected.
test_path = Path("tests/contracts/schedule-review-fixes.test.ts")
test_text = test_path.read_text()
broken = 'expect(read(file)).not.toMatch(/[--]/);'
fixed = r'expect(read(file)).not.toMatch(/[\u2013\u2014]/);'
if test_text.count(broken) != 1:
    raise SystemExit(f"Expected one normalized dash matcher, found {test_text.count(broken)}")
test_path.write_text(test_text.replace(broken, fixed, 1))

# Full typecheck exposed an existing mismatch between browser DOM constructors
# and @napi-rs/canvas constructors. These globals are installed dynamically for
# PDF.js at runtime, so keep the registry intentionally unknown-typed instead of
# claiming the native constructors structurally implement browser DOM classes.
pdf_path = Path("lib/compute/pdf-thumbnail.ts")
pdf_text = pdf_path.read_text()
old = '''function installPdfCanvasGlobals() {
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  if (!globals.DOMMatrix && "DOMMatrix" in canvas) globals.DOMMatrix = canvas.DOMMatrix;
  if (!globals.ImageData && "ImageData" in canvas) globals.ImageData = canvas.ImageData;
  if (!globals.Path2D && "Path2D" in canvas) globals.Path2D = canvas.Path2D;
}'''
new = '''function installPdfCanvasGlobals() {
  const globals = globalThis as unknown as Record<string, unknown>;
  const canvasExports = canvas as unknown as Record<string, unknown>;
  for (const name of ["DOMMatrix", "ImageData", "Path2D"] as const) {
    if (!globals[name] && canvasExports[name]) globals[name] = canvasExports[name];
  }
}'''
if pdf_text.count(old) != 1:
    raise SystemExit(f"Expected one PDF canvas globals block, found {pdf_text.count(old)}")
pdf_path.write_text(pdf_text.replace(old, new, 1))
