from pathlib import Path
import subprocess

# Reuse the already-reviewed patch implementation from the parent commit, then
# correct the generated regression matcher. The parent script intentionally
# normalizes en/em dashes in touched source files, but that same normalization
# also changed its own test regex from [–—] into [--].
parent_script = subprocess.run(
    ["git", "show", "HEAD^:.github/scripts/pr39_gap_fixes.py"],
    check=True,
    capture_output=True,
    text=True,
).stdout

exec(compile(parent_script, ".github/scripts/pr39_gap_fixes.py@HEAD^", "exec"), {"__name__": "__main__"})

test_path = Path("tests/contracts/schedule-review-fixes.test.ts")
test_text = test_path.read_text()
broken = 'expect(read(file)).not.toMatch(/[--]/);'
fixed = r'expect(read(file)).not.toMatch(/[\u2013\u2014]/);'
if test_text.count(broken) != 1:
    raise SystemExit(f"Expected one normalized dash matcher, found {test_text.count(broken)}")
test_path.write_text(test_text.replace(broken, fixed, 1))
