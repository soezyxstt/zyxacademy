#!/usr/bin/env bash
set -euo pipefail
platform=${1:?Specify android or ios}
phase=${2:-full}
output_dir="$PWD/artifacts/native-parity/operations/$platform"
app=apps/mobile-native
case "$platform" in
  android)
    mkdir -p "$output_dir"
    device=$(adb get-serialno)
    adb shell wm density 160
    adb shell wm size 380x844
    adb shell settings put system font_scale 1
    adb shell getprop persist.sys.timezone | tr -d '\r' > "$output_dir/timezone.txt"
    adb shell input keyevent KEYCODE_WAKEUP
    adb shell wm dismiss-keyguard
    adb install "${PARITY_APK_PATH:-$app/android/app/build/outputs/apk/release/app-release.apk}"
    ;;
  ios)
    device_file="$output_dir/ios-simulator.txt"
    if [[ "$phase" == build || ! -s "$device_file" ]]; then
      mkdir -p "$output_dir" "$HOME/.expo"
      device=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; print(next(d["udid"] for group in reversed(list(json.load(sys.stdin)["devices"].values())) for d in group if d["name"] == "iPhone 17 Pro"))')
      echo "Booting iPhone 17 Pro simulator"
      xcrun simctl boot "$device"
      xcrun simctl bootstatus "$device" -b
      echo "Building and installing the iOS release fixture"
      (cd "$app" && npx --no-install expo run:ios --configuration Release --device "$device" --no-bundler)
      printf '%s\n' "$device" > "$device_file"
    fi
    if [[ "$phase" == build ]]; then exit 0; fi
    device=$(cat "$device_file")
    if [[ "$phase" == smoke ]]; then output_dir="$output_dir-smoke"; fi
    ;;
  *) exit 2 ;;
esac
mkdir -p "$output_dir"

# Pin the same device test CLI archive as the native parity runner.
maestro_dir=$(mktemp -d)
trap 'rm -rf "$maestro_dir"' EXIT
(
  cd "$maestro_dir"
  curl -fsSL --retry 3 --max-time 300 -o maestro.zip https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.12.1/maestro.zip
  echo '54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7  maestro.zip' | shasum -a 256 -c -
  unzip -q maestro.zip
)
export MAESTRO_CLI_NO_ANALYTICS=true
fixture_flows="$maestro_dir/operations"
if [[ "$phase" == smoke ]]; then
  bun scripts/native-parity/operations/capture-cases.ts "$fixture_flows" "$output_dir/cases" \
    operations-public-blog-list-open-back operations-public-blog-detail-content operations-public-blog-list-empty
else
  bun scripts/native-parity/operations/capture-cases.ts "$fixture_flows" "$output_dir/cases"
  cp .maestro/native-parallel/operations/*.yaml "$fixture_flows/"
fi
run_flows() {
  local report=$1 results=$2 logs=$3
  shift 3
  "$maestro_dir/maestro/bin/maestro" --platform "$platform" --device "$device" test \
    --format junit --output "$report" --test-output-dir "$results" --debug-output "$logs" "$@"
}

run_android_batch() {
  local batch=$1 report
  shift
  report="$output_dir/reports/$batch.xml"
  if run_flows "$report" "$output_dir/results/$batch" "$output_dir/logs/$batch" "$@"; then
    return
  fi

  # Retain every attempt. Retry only flows whose Maestro log records a lost ADB transport.
  local retry_flows
  retry_flows=$(python3 scripts/native-parity/operations/device-reports.py retry "$report" "$output_dir/results/$batch")
  if [[ -z "$retry_flows" ]]; then return; fi
  local targets=()
  mapfile -t targets <<< "$retry_flows"
  adb reconnect offline || true
  if timeout 45 adb -s "$device" wait-for-device; then
    run_flows "$output_dir/reports/$batch-retry.xml" "$output_dir/results/$batch-retry" "$output_dir/logs/$batch-retry" "${targets[@]}" || true
  fi
}

status=0
if [[ "$platform" == android ]]; then
  export LC_ALL=C
  mkdir -p "$output_dir/reports"
  journeys=()
  for flow in .maestro/native-parallel/operations/*.yaml; do journeys+=("$fixture_flows/${flow##*/}"); done
  run_android_batch 00-journeys "${journeys[@]}"
  cases=("$fixture_flows"/operations-*.yaml)
  batch_size=36
  for ((offset = 0; offset < ${#cases[@]}; offset += batch_size)); do
    printf -v batch '%02d-cases' "$((offset / batch_size + 1))"
    run_android_batch "$batch" "${cases[@]:offset:batch_size}"
  done
  python3 scripts/native-parity/operations/device-reports.py merge "$output_dir" "$fixture_flows" || status=$?
else
  run_flows "$output_dir/report.xml" "$output_dir/results" "$output_dir/logs" "$fixture_flows" || status=$?
fi
python3 scripts/native-parity/operations/collect.py "$output_dir" "$fixture_flows"
exit "$status"
