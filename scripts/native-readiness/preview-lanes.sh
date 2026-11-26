#!/usr/bin/env bash
# Combine the four external lanes on a disposable GitHub Actions runner.
set -euo pipefail
if [[ ${GITHUB_ACTIONS:-} != true || -z ${GITHUB_STEP_SUMMARY:-} ]]; then
  echo "Run this script in the integration preview workflow." >&2
  exit 2
fi
git config user.name "Zyx integration preview"
git config user.email "ci@users.noreply.github.com"
printf '### Native integration preview\n\nHost commit: `%s`\n\n| Lane | Commit | Merge |\n| --- | --- | --- |\n' \
  "$(git rev-parse HEAD)" >> "$GITHUB_STEP_SUMMARY"
for lane in shared-ui student academic operations; do
  ref="refs/remotes/origin/native-migration/$lane"
  revision=$(git rev-parse --verify "$ref^{commit}")
  if git merge --no-edit --no-ff "$revision"; then
    result=clean
  else
    # These exact sibling blobs contain earlier, partial copies of the same
    # host wiring, or of a fixture from the already merged shared-ui owner.
    while IFS= read -r -d '' conflict; do
      theirs=$(git rev-parse ":3:$conflict" 2>/dev/null || true)
      case "$conflict:$theirs" in
        apps/mobile-native/metro.config.js:37a0da32595bcda45c8d4225e5f460d2be3f9dc0|\
        apps/mobile-native/metro.config.js:e14f0a444329b687525c5c6c0041828537f0f2fe|\
        apps/mobile-native/metro.config.js:f173791ee1b71704e9f05c6f9b4097c7df330e49|\
        apps/mobile-native/features/shared-ui/SharedUiCase.tsx:0c862d99b40168da5acd8ee6d6642d3fe430eb43|\
        apps/mobile-native/auth/session-provider.tsx:46e789eebb13c65f86d88a21b39b026751ac5d4f)
          git checkout --ours -- "$conflict"
          git add -- "$conflict"
          ;;
      esac
    done < <(git diff --name-only --diff-filter=U -z)
    unresolved=$(git diff --name-only --diff-filter=U)
    if [[ -n $unresolved ]]; then
      printf '| %s | `%s` | Conflict |\n\nUnresolved files:\n\n' "$lane" "$revision" >> "$GITHUB_STEP_SUMMARY"
      printf '%s\n' "$unresolved" >> "$GITHUB_STEP_SUMMARY"
      exit 1
    fi
    git commit --no-edit
    result='Reviewed host configuration retained'
  fi
  printf '| %s | `%s` | %s |\n' "$lane" "$revision" "$result" >> "$GITHUB_STEP_SUMMARY"
done
