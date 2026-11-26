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
if [[ $platform == ios && ${3:-parity} == product ]]; then
  xcrun simctl openurl "$device" zyx-native-parity://gallery/separator
  "$maestro" --platform ios --device "$device" test \
    "$root/.maestro/native-parity/helpers/confirm-ios-gallery.yaml"
fi
if [[ ${3:-parity} == product ]]; then
  app=com.zyx.academy.nativeparity
  if [[ $platform == ios ]]; then
    xcrun simctl terminate "$device" "$app"
    xcrun simctl openurl "$device" zyx-native-parity://admin
  else
    adb -s "$device" shell am force-stop "$app"
    adb -s "$device" shell am start -W -a android.intent.action.VIEW -d zyx-native-parity://admin "$app" | tee "$output/cold-start.txt"
  fi
  "$maestro" --platform "$platform" --device "$device" test \
    --format junit --output "$output/cold-entry.xml" --test-output-dir "$output/cold-results" \
    --debug-output "$output/cold-logs" "$flows/helpers/cold-private-entry.yaml"
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
fi
"$maestro" --platform "$platform" --device "$device" test \
  --format junit --output "$output/report.xml" \
  --test-output-dir "$output/results" --debug-output "$output/logs" \
  "$flows"/*.yaml
