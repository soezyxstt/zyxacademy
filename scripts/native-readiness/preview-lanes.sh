#!/usr/bin/env bash
# Combine the four external lanes on a disposable GitHub Actions runner.
set -euo pipefail
if [[ ${GITHUB_ACTIONS:-} != true || -z ${GITHUB_STEP_SUMMARY:-} ]]; then
  echo "Run this script in the integration preview workflow." >&2
  exit 2
fi
git config user.name "Zyx integration preview"
git config user.email "ci@users.noreply.github.com"
host=$(git rev-parse HEAD)
printf '### Native integration preview\n\nHost commit: `%s`\n\n| Lane | Commit | Merge |\n| --- | --- | --- |\n' \
  "$host" >> "$GITHUB_STEP_SUMMARY"

keep_reviewed_host_files() {
  local path incoming
  for path in apps/mobile-native/app/+native-intent.tsx apps/mobile-native/routing/consent-intent.ts apps/mobile-native/features/shared-ui/layout.tsx; do
    if git diff --cached --quiet "$host" -- "$path"; then
      continue
    fi
    incoming=$(git rev-parse "$revision:$path" 2>/dev/null || true)
    case "$path:$incoming" in
      apps/mobile-native/app/+native-intent.tsx:97b48fb2327c46b2b31013f0aa6f6bbc00f1cdd1|\
      apps/mobile-native/app/+native-intent.tsx:b873c1d2bc89c3bdcf00c97e70f5c995b9634b7d|\
      apps/mobile-native/app/+native-intent.tsx:28298c6eef93cc1b905457ef31c82304882c2b94|\
      apps/mobile-native/app/+native-intent.tsx:7151e0048d95fbf372ec1f4732dee44e76642c47|\
      apps/mobile-native/app/+native-intent.tsx:0531f6f0f421dac2147168a2b86ca4ac83e43afd|\
      apps/mobile-native/app/+native-intent.tsx:db2e069c63d05cc1df136702d6b3fffc0d01020c|\
      apps/mobile-native/routing/consent-intent.ts:e3cc5a864ff1f229fd28e9e31e087cfc6a1cea73|\
      apps/mobile-native/routing/consent-intent.ts:23b07316c4f3aefc94cfe9f79914696719705d0b|\
      apps/mobile-native/routing/consent-intent.ts:d33af995ad91cf13b260432eadbeffc5d7af89e0|\
      apps/mobile-native/features/shared-ui/layout.tsx:93171b46f91c6d058687d241bc0d81418f8016bb|\
      apps/mobile-native/features/shared-ui/layout.tsx:5ae05129ef3821a80a50f8f2aaed59a1799e6ed3)
        # Preserve the composed host file even when the partial copy merged cleanly.
        git checkout "$host" -- "$path"
        result='Reviewed merge resolution'
        ;;
      *)
        printf '| %s | `%s` | Host file requires review |\n\n`%s` incoming blob `%s`\n' \
          "$lane" "$revision" "$path" "$incoming" | tee -a "$GITHUB_STEP_SUMMARY"
        return 1
        ;;
    esac
  done
}

for lane in shared-ui student academic operations; do
  ref="refs/remotes/origin/native-migration/$lane"
  revision=$(git rev-parse --verify "$ref^{commit}")
  merge_status=0
  git merge --no-edit --no-ff --no-commit "$revision" || merge_status=$?
  result=clean
  if ((merge_status)); then
    result='Reviewed merge resolution'
    # These exact sibling blobs contain earlier, partial copies of the same
    # host wiring, or of a fixture from the already merged shared-ui owner.
    while IFS= read -r -d '' conflict; do
      theirs=$(git rev-parse ":3:$conflict" 2>/dev/null || true)
      case "$conflict:$theirs" in
        apps/mobile-native/app/_layout.tsx:8536adcfff81d47112b964c33142a4aead04e368|\
        apps/mobile-native/metro.config.js:37a0da32595bcda45c8d4225e5f460d2be3f9dc0|\
        apps/mobile-native/metro.config.js:716939b01771f080c0a2f83cb166bf5d53eaecc9|\
        apps/mobile-native/metro.config.js:e14f0a444329b687525c5c6c0041828537f0f2fe|\
        apps/mobile-native/metro.config.js:f173791ee1b71704e9f05c6f9b4097c7df330e49|\
        apps/mobile-native/features/shared-ui/SharedUiCase.tsx:0c862d99b40168da5acd8ee6d6642d3fe430eb43|\
        apps/mobile-native/auth/session-provider.tsx:46e789eebb13c65f86d88a21b39b026751ac5d4f)
          git checkout --ours -- "$conflict"
          git add -- "$conflict"
          ;;
        tests/unit/expo-offline-reading-packages.test.ts:5eab0fc27151af0a5440c336858b113dad4bc9d4|\
        tests/unit/expo-offline-reading-packages.test.ts:b8c9db1601762a4cb67caeeac5cd5da3018670da)
          # Both lanes only typed the same example. The host retains the
          # typed fixture and the newer cross-locale and stale-response cases.
          if git show ":2:$conflict" | grep -F 'satisfies OfflineReadingData;' >/dev/null; then
            git checkout --ours -- "$conflict"
            git add -- "$conflict"
          fi
          ;;
        lib/admin-mcp/operations-catalog.ts:*)
          python3 scripts/native-readiness/merge-catalog-preview.py
          git add -- "$conflict"
          ;;
        app/actions/tutor-management.ts:12f2cf10a8aa9689c4b1cecd00ee789905bb4430|\
        tests/gamification/question-disclosure-calls.test.ts:4885627aaf0124bedf92991befcc551bf05fbb58|\
        apps/mobile-native/offline/library-view.tsx:e5effb595b5d85823a8ac9973d6c1549b9a64b35|\
        tests/contracts/admin-mcp-catalog.test.ts:*)
          if python3 scripts/native-readiness/merge_reviewed_preview.py "$conflict"; then
            git add -- "$conflict"
          fi
          ;;
      esac
    done < <(git diff --name-only --diff-filter=U -z)
  fi
  keep_reviewed_host_files
  unresolved=$(git diff --name-only --diff-filter=U)
  if [[ -n $unresolved ]]; then
    printf '| %s | `%s` | Conflict |\n\nUnresolved files:\n\n' "$lane" "$revision" >> "$GITHUB_STEP_SUMMARY"
    printf '%s\n' "$unresolved" | tee -a "$GITHUB_STEP_SUMMARY"
    exit 1
  fi
  if git rev-parse --verify --quiet MERGE_HEAD >/dev/null; then
    git commit --no-edit
  elif ((merge_status)); then
    exit "$merge_status"
  fi
  printf '| %s | `%s` | %s |\n' "$lane" "$revision" "$result" >> "$GITHUB_STEP_SUMMARY"
done
