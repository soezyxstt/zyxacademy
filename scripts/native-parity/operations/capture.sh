#!/usr/bin/env bash
set -euo pipefail
platform=${1:?Specify android or ios}
output_dir="$PWD/artifacts/native-parity/operations/$platform"
mkdir -p "$output_dir"
app=apps/mobile-native
case "$platform" in
  android)
    device=$(adb get-serialno)
    adb shell wm density 160
    adb shell wm size 380x844
    adb shell settings put system font_scale 1
    adb shell input keyevent KEYCODE_WAKEUP
    adb shell wm dismiss-keyguard
    adb install "$app/android/app/build/outputs/apk/release/app-release.apk"
    ;;
  ios)
    mkdir -p "$HOME/.expo"
    device=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; print(next(d["udid"] for group in reversed(list(json.load(sys.stdin)["devices"].values())) for d in group if d["name"] == "iPhone 17 Pro"))')
    xcrun simctl boot "$device"
    xcrun simctl bootstatus "$device" -b
    (cd "$app" && npx --no-install expo run:ios --configuration Release --device "$device" --no-bundler)
    ;;
  *) exit 2 ;;
esac

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
bun scripts/native-parity/operations/capture-cases.ts "$fixture_flows" "$output_dir/cases"
cp .maestro/native-parallel/operations/*.yaml "$fixture_flows/"
"$maestro_dir/maestro/bin/maestro" --platform "$platform" --device "$device" test \
  --format junit --output "$output_dir/report.xml" --test-output-dir "$output_dir/results" \
  --debug-output "$output_dir/logs" -e SCREENSHOT_DIR="$output_dir" "$fixture_flows"
