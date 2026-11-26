#!/usr/bin/env bash
set -euo pipefail

platform=$1
device=$2
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"
scripts="$root/scripts/native-parity/academic"
output="$root/${ACADEMIC_OUTPUT:-artifacts/native-parity/academic/$platform}"
mkdir -p "$output"
app_id=com.zyx.academy.nativeparity

case "$platform" in
  android)
    adb -s "$device" shell wm density 160
    adb -s "$device" shell wm size 380x900
    adb -s "$device" shell settings put system font_scale 1
    adb -s "$device" shell input keyevent KEYCODE_WAKEUP
    adb -s "$device" shell wm dismiss-keyguard
    {
      adb -s "$device" shell getprop ro.product.model
      adb -s "$device" shell getprop ro.build.version.release
      adb -s "$device" shell wm size
      adb -s "$device" shell wm density
      adb -s "$device" shell settings get system font_scale
    } > "$output/device.txt"
    adb -s "$device" install -r apps/mobile-native/android/app/build/outputs/apk/release/app-release.apk 2>&1 | tee "$output/install.log"
    adb -s "$device" shell am start -W -n "$app_id/.MainActivity"
    ;;
  ios)
    xcrun simctl spawn "$device" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true
    xcrun simctl list devices booted > "$output/device.txt"
    xcrun simctl status_bar "$device" override --time '09:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState unplugged --batteryLevel 100
    xcrun simctl launch "$device" "$app_id" 2>&1 | tee "$output/install.log"
    ;;
  *)
    echo "Expected android or ios." >&2
    exit 2
    ;;
esac

version=2.12.1
sha256=54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7
maestro_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyx-academic-maestro.XXXXXX")"
trap 'rm -rf "$maestro_dir"' EXIT

maestro_status=0
if (
  cd "$maestro_dir" &&
  curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 --max-time 180 \
    --output maestro.zip "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$version/maestro.zip" &&
  printf '%s  maestro.zip\n' "$sha256" | shasum -a 256 -c - &&
  unzip -q maestro.zip
) > "$output/maestro-install.log" 2>&1; then
  python "$scripts/interactions.py" "$platform" "$device" "$maestro_dir/maestro/bin/maestro" "$output/interactions" || maestro_status=$?
else
  maestro_status=1
fi

capture_status=0
python "$scripts/capture.py" "$platform" "$device" "$output/cases.json" "$output/routes" || capture_status=$?
compare_status=0
python "$scripts/evaluate.py" "$output" || compare_status=$?
printf '{"interactionExitCode":%s,"captureExitCode":%s,"comparisonExitCode":%s}\n' \
  "$maestro_status" "$capture_status" "$compare_status" > "$output/status.json"
if (( maestro_status || capture_status || compare_status )); then
  exit 1
fi
