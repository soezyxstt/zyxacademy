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
  # Check the isolated launcher reaches a real Student fixture before running the suites.
  bootstrap="$output/ios-bootstrap"
  mkdir -p "$bootstrap"
  "$maestro" --platform ios --device "$device" test \
    --format junit --output "$bootstrap/report.xml" --test-output-dir "$bootstrap/results" \
    --debug-output "$bootstrap/logs" "$output/launcher/verify-menu.yaml"
  if [[ -n ${GITHUB_OUTPUT:-} ]]; then
    printf '%s\n' 'bootstrap=success' >> "$GITHUB_OUTPUT"
  fi
fi
if [[ $platform == android ]]; then
  flows=("$root"/.maestro/native-parallel/student/*.yaml)
  if [[ ${STUDENT_CANVAS_ONLY:-0} == 1 ]]; then
    flows=("$root/.maestro/native-parallel/student/zyra-course.yaml")
  fi
  python "$root/tests/visual/native-parallel/student/retry-android-standalone.py" "$maestro" "$device" "$output" "${flows[@]}"
else
  suite="$output/launcher/standalone"
  flows=("$suite"/catalog-parity.yaml "$suite"/course-material-{enrolled,unenrolled,revoked}.yaml "$suite"/long-content.yaml)
  for flow in "$suite"/*.yaml; do
    case ${flow##*/} in
      catalog-parity.yaml|course-material-enrolled.yaml|course-material-unenrolled.yaml|course-material-revoked.yaml|long-content.yaml) ;;
      *) flows+=("$flow") ;;
    esac
  done
  "$maestro" --platform "$platform" --device "$device" test \
    --format junit --output "$output/report.xml" --test-output-dir "$output/results" \
    --debug-output "$output/logs" "${flows[@]}"
fi
