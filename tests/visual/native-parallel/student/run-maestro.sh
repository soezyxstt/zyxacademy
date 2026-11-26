#!/usr/bin/env bash
set -euo pipefail
platform=$1
device=$2
root=$(git rev-parse --show-toplevel)
output="$root/artifacts/student-evidence/$platform"
mkdir -p "$output"
version=2.12.1
sha256=54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7
install_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyx-student-maestro.XXXXXX")
trap 'rm -rf "$install_dir"' EXIT
curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 --max-time 300 \
  --output "$install_dir/maestro.zip" "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$version/maestro.zip"
printf '%s  %s\n' "$sha256" "$install_dir/maestro.zip" | shasum -a 256 -c -
unzip -q "$install_dir/maestro.zip" -d "$install_dir"
export MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
cd "$output"
maestro="$install_dir/maestro/bin/maestro"
if [[ $platform == ios ]]; then
  # A fresh simulator can require consent before the app opens its own fixture URLs.
  bootstrap="$output/ios-bootstrap"
  mkdir -p "$bootstrap"
  xcrun simctl openurl "$device" zyx-native-parity://gallery/separator
  "$maestro" --platform ios --device "$device" test \
    --format junit --output "$bootstrap/report.xml" --test-output-dir "$bootstrap/results" \
    --debug-output "$bootstrap/logs" "$root/.maestro/native-parity/helpers/confirm-ios-gallery.yaml"
  if [[ -n ${GITHUB_OUTPUT:-} ]]; then
    printf '%s\n' 'bootstrap=success' >> "$GITHUB_OUTPUT"
  fi
fi
flows=("$root"/.maestro/native-parallel/student/*.yaml)
if "$maestro" --platform "$platform" --device "$device" test \
  --format junit --output "$output/report.xml" --test-output-dir "$output/results" \
  --debug-output "$output/logs" "${flows[@]}"; then
  exit 0
else
  status=$?
fi
if [[ $platform == android ]]; then
  python "$root/tests/visual/native-parallel/student/retry-android-standalone.py" "$maestro" "$device" "$output" "${flows[@]}"
else
  exit "$status"
fi
