#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 || ( "$1" != android && "$1" != ios ) || -z "$2" ]]; then
  echo "Usage: $0 <android|ios> <device-id> [product]" >&2
  exit 2
fi

platform=$1
device=$2
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
output="$root/artifacts/native-parity/$platform/interactions"
flows="$root/.maestro/native-parity"
case ${3:-parity} in
  parity) ;;
  product)
    flows="$root/.maestro/native-integration"
    output="$root/artifacts/native-integration/$platform"
    ;;
  *) exit 2 ;;
esac
mkdir -p "$output"

maestro=${NATIVE_PARITY_MAESTRO:-}
if [[ -z $maestro ]]; then
  install_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyx-maestro.XXXXXX")
  trap 'rm -rf "$install_dir"' EXIT
  bash "$root/scripts/native-parity/install-maestro.sh" "$install_dir"
  maestro="$install_dir/maestro/bin/maestro"
fi

export MAESTRO_CLI_NO_ANALYTICS=true
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

run_cold_entry() {
  local app=com.zyx.academy.nativeparity termination
  if [[ $platform == ios ]]; then
    if ! termination=$(xcrun simctl terminate "$device" "$app" 2>&1); then
      printf '%s\n' "$termination" | tee "$output/cold-terminate.txt"
      if ! grep -Eqi 'found nothing to terminate|is not running' <<< "$termination"; then return 1; fi
    fi
    xcrun simctl openurl "$device" zyx-native-parity://admin 2>&1 | tee "$output/cold-start.txt" || return
  else
    adb -s "$device" shell am force-stop "$app" || return
    adb -s "$device" shell am start -W -a android.intent.action.VIEW -d zyx-native-parity://admin "$app" | tee "$output/cold-start.txt" || return
  fi
  "$maestro" --platform "$platform" --device "$device" test \
    --format junit --output "$output/cold-entry.xml" --test-output-dir "$output/cold-results" \
    --debug-output "$output/cold-logs" "$flows/helpers/cold-private-entry.yaml" || return
  if [[ $platform == android ]]; then
    adb -s "$device" shell dumpsys meminfo "$app" > "$output/sign-in-meminfo.txt"
    # Keep raw emulator measurements next to the route assertion and source
    # tree. The activity launch timing ends before the Maestro assertion.
    {
      echo "### Android emulator, cold guest entry"
      echo
      echo '```text'
      grep -E '^(LaunchState|TotalTime|WaitTime):' "$output/cold-start.txt" || true
      grep -E 'TOTAL PSS:|TOTAL RSS:' "$output/sign-in-meminfo.txt" || true
      echo '```'
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

status=0
targets=()
for flow in "$flows"/*.yaml; do
  if [[ ${3:-parity} == parity && ${NATIVE_PARITY_PUBLIC_FIXTURES:-} != 1 ]]; then
    case "${flow##*/}" in
      meet.yaml|public-directory.yaml|public-forms.yaml) continue ;;
    esac
  fi
  targets+=("$flow")
done
if [[ ${3:-parity} == product ]]; then
  if [[ $platform == ios ]]; then
    run_cold_entry || status=1
  else
    run_cold_entry
  fi
fi
"$maestro" --platform "$platform" --device "$device" test \
  --format junit --output "$output/report.xml" \
  --test-output-dir "$output/results" --debug-output "$output/logs" \
  "${targets[@]}" || status=1
exit "$status"
