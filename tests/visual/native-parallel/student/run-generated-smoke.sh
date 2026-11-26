#!/usr/bin/env bash
set -uo pipefail
platform=$1
device=$2
root=$(git rev-parse --show-toplevel)
generated="$root/artifacts/student-evidence/generated"
output="$root/artifacts/student-evidence/$platform/smoke"
mkdir -p "$output"
install_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyx-student-smoke.XXXXXX")
trap 'rm -rf "$install_dir"' EXIT
version=2.12.1
sha256=54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7
status=0
curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 --max-time 300 \
  --output "$install_dir/maestro.zip" "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$version/maestro.zip" || exit 1
printf '%s  %s\n' "$sha256" "$install_dir/maestro.zip" | shasum -a 256 -c - || exit 1
unzip -q "$install_dir/maestro.zip" -d "$install_dir" || exit 1
export MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
for area in courses assessment learning community; do
  mkdir -p "$output/$area"
  files=("$generated/$area"/*.yaml)
  if [[ ! -e "${files[0]}" ]]; then
    printf 'No runnable cases for %s\n' "$area" > "$output/$area/missing.txt"
    continue
  fi
  (cd "$output/$area" && "$install_dir/maestro/bin/maestro" --platform "$platform" --device "$device" test \
    --format junit --output "$output/$area/report.xml" --test-output-dir "$output/$area/results" \
    --debug-output "$output/$area/logs" "${files[@]}") || status=1
done
python "$root/tests/visual/native-parallel/student/summarize-smoke.py" --manifest "$generated/manifest.json" --output "$output" || status=1
exit "$status"
