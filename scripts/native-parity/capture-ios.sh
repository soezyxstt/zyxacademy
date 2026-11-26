#!/usr/bin/env bash
set -euo pipefail
output=artifacts/native-parity/ios
mkdir -p "$output" "$HOME/.expo"
device=$(xcrun simctl list devices available -j | python -c 'import json,sys; print(next(d["udid"] for devices in reversed(list(json.load(sys.stdin)["devices"].values())) for d in devices if d["name"] == "iPhone 17 Pro"))')
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl spawn "$device" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true
cd apps/mobile-native
npx --no-install expo run:ios --configuration Release --device "$device" --no-bundler
cd ../..
status=0
python scripts/native-parity/capture-gallery.py ios "$device" || status=1
bash scripts/native-parity/check-interactions.sh ios "$device" || status=1
exit "$status"
