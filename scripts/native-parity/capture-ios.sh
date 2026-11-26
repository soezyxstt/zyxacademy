#!/usr/bin/env bash
set -euo pipefail
output=artifacts/native-parity/ios
device=$(xcrun simctl list devices available -j | python -c 'import json,sys; print(next(d["udid"] for devices in reversed(list(json.load(sys.stdin)["devices"].values())) for d in devices if d["name"] == "iPhone 17 Pro"))')
if [[ ${1:-} == product ]]; then
  exec bash scripts/native-parity/capture-ios-product.sh "$device"
fi
mkdir -p "$output" "$HOME/.expo"
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl spawn "$device" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true
export EXPO_PUBLIC_PARITY_CAPTURE_NAVIGATION=1
cd apps/mobile-native
npx --no-install expo run:ios --configuration Release --device "$device" --no-bundler
cd ../..
install_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyx-maestro.XXXXXX")
trap 'rm -rf "$install_dir"' EXIT
bash scripts/native-parity/install-maestro.sh "$install_dir"
export NATIVE_PARITY_MAESTRO="$install_dir/maestro/bin/maestro"
export MAESTRO_CLI_NO_ANALYTICS=true
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
status=0
python scripts/native-parity/capture-gallery.py ios "$device" || status=1
xcrun simctl ui "$device" appearance light
if [[ ${NATIVE_PARITY_PUBLIC_FIXTURES:-} == 1 ]]; then
  python scripts/native-parity/compare-pages.py ios "$device" || status=1
fi
if [[ ${EXPO_PUBLIC_PARITY_WEBVIEW:-} == 1 ]]; then
  python scripts/native-parity/capture-webview.py ios "$device" || status=1
fi
bash scripts/native-parity/check-interactions.sh ios "$device" || status=1
exit "$status"
