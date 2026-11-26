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

# Use the official release archive without modifying the runner's shell profiles.
version=2.12.1
sha256=54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7
install_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyx-maestro.XXXXXX")
trap 'rm -rf "$install_dir"' EXIT
(
  cd "$install_dir"
  curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 --max-time 300 \
    --output maestro.zip "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$version/maestro.zip"
  printf '%s  maestro.zip\n' "$sha256" | shasum -a 256 -c -
  unzip -q maestro.zip
)

export MAESTRO_CLI_NO_ANALYTICS=true
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
if [[ $platform == ios ]]; then
  xcrun simctl openurl "$device" zyx-native-parity://gallery/separator
  "$install_dir/maestro/bin/maestro" --platform ios --device "$device" test \
    "$root/.maestro/native-parity/helpers/confirm-ios-gallery.yaml"
fi
if [[ ${3:-parity} == product ]]; then
  app=com.zyx.academy.nativeparity
  if [[ $platform == ios ]]; then
    xcrun simctl terminate "$device" "$app"
    xcrun simctl openurl "$device" zyx-native-parity://admin
  else
    adb -s "$device" shell am force-stop "$app"
    adb -s "$device" shell am start -W -a android.intent.action.VIEW -d zyx-native-parity://admin "$app"
  fi
  "$install_dir/maestro/bin/maestro" --platform "$platform" --device "$device" test \
    --format junit --output "$output/cold-entry.xml" --test-output-dir "$output/cold-results" \
    --debug-output "$output/cold-logs" "$flows/helpers/cold-private-entry.yaml"
fi
"$install_dir/maestro/bin/maestro" --platform "$platform" --device "$device" test \
  --format junit --output "$output/report.xml" \
  --test-output-dir "$output/results" --debug-output "$output/logs" \
  "$flows"/*.yaml
