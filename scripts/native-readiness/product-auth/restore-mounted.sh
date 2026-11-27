#!/usr/bin/env bash
set -euo pipefail
if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_ENVIRONMENT:-} != github-hosted ||
  ${NATIVE_PRODUCT_AUTH_FIXTURE:-} != 1 || -z ${RUNNER_TEMP:-} ]]; then
  echo "Mounted authentication fixtures require the isolated GitHub-hosted job." >&2
  exit 2
fi

snapshot="$RUNNER_TEMP/product-source"
gzip -dc "$snapshot/changes.patch.gz" | git apply --allow-empty --binary --index --whitespace=nowarn
tree=$(git write-tree)
test "$tree" = "$(cat "$snapshot/tree")"
if [[ ${NATIVE_PRODUCT_AUTH_STAFF:-} == true ]]; then
  test "$tree" = "$(git rev-parse 'HEAD^{tree}')"
  git ls-tree -r --name-only HEAD -- apps/mobile-native/app/tutor.tsx apps/mobile-native/app/admin/forms.tsx |
    diff -u <(printf '%s\n' apps/mobile-native/app/admin/forms.tsx apps/mobile-native/app/tutor.tsx) -
fi
python3 - <<'PY'
from collections import Counter
from runpy import run_path

expected = {"academic": 54, "student": 50, "operations": 36, "public": 13}
routes = run_path("scripts/native-readiness/product/mount.py")["inventory"]()
if Counter(routes.values()) != expected:
    raise SystemExit("The mounted source differs from the reviewed route inventory")
PY
echo "Verified mounted product tree $tree (54 Academic, 50 Student, 36 Operations, 13 public browser handoffs)"
