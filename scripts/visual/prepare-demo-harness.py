#!/usr/bin/env python3
"""Prepare an ignored, credential-free copy. Run only on the designated test machine."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
target = root / 'artifacts/visual-quality/demo-harness'
if target.exists():
    raise SystemExit(f'Remove the old harness explicitly first: {target}')
# Git enumerates tracked sources plus non-ignored additions, including concurrent work.
tracked = set(subprocess.check_output(['git', 'ls-files', '-z', '--cached'], cwd=root).decode().split('\0'))
untracked = set(subprocess.check_output(['git', 'ls-files', '-z', '--others', '--exclude-standard'], cwd=root).decode().split('\0'))
paths = tracked | untracked
allowed_roots = {'app', 'components', 'lib', 'db', 'public', 'messages', 'i18n', 'hooks', 'types', 'prompts', 'jobs', 'workers', 'scripts', 'tests'}
root_files = {'package.json', 'bun.lock', 'bun.lockb', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs', 'components.json', 'proxy.ts', 'instrumentation.ts', 'playwright.config.ts', 'deno.json', 'sentry.client.config.ts', 'sentry.server.config.ts', 'sentry.edge.config.ts'}
for name in set(paths):
    if not name:
        continue
    rel = Path(name)
    if rel.parts[0] not in allowed_roots and name not in root_files:
        continue
    if any(part.startswith('.') for part in rel.parts):
        continue
    if rel.suffix.lower() in {'.env', '.pem', '.key', '.p12', '.pfx', '.keystore', '.jks', '.sqlite', '.db', '.csv', '.log'}:
        continue
    # Reviewed tracked source such as lib/auth-secret.ts is application code.
    # Do not accept secret-named untracked additions as source.
    if name not in tracked and any('secret' in part.lower() or 'credential' in part.lower() for part in rel.parts):
        continue
    source = root / rel
    if any((root.joinpath(*rel.parts[:index])).is_symlink() for index in range(1, len(rel.parts) + 1)):
        raise SystemExit(f'Refusing symlink in source path: {rel}')
    if not source.is_file():
        continue
    dest = target / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
for fixture, destination in [
    ('demo-data.ts', 'app/(marketing)/demo/demo-data.ts'),
    ('summary-repository.ts', 'lib/demo/summary-repository.ts'),
    ('mastery-repository.ts', 'lib/demo/mastery-repository.ts'),
]:
    shutil.copy2(root / 'tests/visual/demo-harness' / fixture, target / destination)
# Keep Tailwind's source scan inside the credential-free copy.
(target / 'postcss.config.mjs').write_text('export default { plugins: { "@tailwindcss/postcss": { base: import.meta.dirname } } };\n')
css = target / 'app/globals.css'
css.write_text(css.read_text(encoding='utf-8').replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "../app";\n@source "../components";\n@source "../lib";\n@source "../hooks";'), encoding='utf-8')
(target / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
print(f'Prepared isolated harness at {target}')
