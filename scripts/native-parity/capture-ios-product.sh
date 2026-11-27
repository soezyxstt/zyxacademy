#!/usr/bin/env bash
set -euo pipefail

device=${1:?Expected an iOS simulator UDID}
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
output="$root/artifacts/native-integration/ios"
derived=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyx-product-ios.XXXXXX")
trap 'rm -rf -- "$derived"' EXIT
mkdir -p "$output"

phase() {
  local name=$1 result=0
  shift
  printf '%s %s started\n' "$(date -u +%FT%TZ)" "$name" | tee -a "$output/phases.txt"
  "$@" 2>&1 | tee "$output/$name.log" || result=$?
  printf '%s %s exited %s\n' "$(date -u +%FT%TZ)" "$name" "$result" | tee -a "$output/phases.txt"
  return "$result"
}

cd "$root/apps/mobile-native"
phase prebuild npx --no-install expo prebuild --platform ios --no-install
phase pods pod install --project-directory=ios
# The product test loads the embedded release bundle on one simulator architecture.
phase build xcrun xcodebuild -workspace ios/ZyxAcademyNative.xcworkspace -scheme ZyxAcademyNative \
  -configuration Release -destination "platform=iOS Simulator,id=$device" -derivedDataPath "$derived" \
  ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build
bundle="$derived/Build/Products/Release-iphonesimulator/ZyxAcademyNative.app"
if [[ ! -s "$bundle/main.jsbundle" ]]; then
  echo "The iOS product build is missing its embedded release bundle." >&2
  exit 1
fi
if [[ $(plutil -extract CFBundleIdentifier raw "$bundle/Info.plist") != com.zyx.academy.nativeparity ]]; then
  echo "The iOS product build has the wrong bundle identifier." >&2
  exit 1
fi
xcrun lipo -archs "$bundle/ZyxAcademyNative" | tee "$output/app-architectures.txt"

cd "$root"
phase boot xcrun simctl bootstatus "$device" -b
xcrun simctl spawn "$device" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true
phase install xcrun simctl install "$device" "$bundle"
bash scripts/native-parity/check-interactions.sh ios "$device" product
