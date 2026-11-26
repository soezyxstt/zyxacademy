#!/usr/bin/env bash
set -euo pipefail
if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_ENVIRONMENT:-} != github-hosted ||
  ${NATIVE_PRODUCT_AUTH_FIXTURE:-} != 1 || -z ${RUNNER_TEMP:-} ]]; then
  echo "Authenticated emulator builds require the isolated GitHub-hosted job." >&2
  exit 2
fi

root=$(git rev-parse --show-toplevel)
app="$root/apps/mobile-native"
private="$RUNNER_TEMP/native-auth-preview"
umask 077
mkdir "$private"
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 \
  -keyout "$private/key.pem" -out "$private/cert.pem" 2>/dev/null

sources=(session-api.ts browser-login.ts auth-entry.tsx)
for source in "${sources[@]}"; do cp "$app/auth/$source" "$private/$source"; done
restore_sources() {
  for source in "${sources[@]}"; do mv "$private/$source" "$app/auth/$source"; done
}
trap restore_sources EXIT
(cd "$app" && npx --no-install expo prebuild --platform android --no-install)
python3 "$root/scripts/native-readiness/product-auth/android-overlay.py" "$private/cert.pem"
assemble() {
  (cd "$app/android" && ./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64 --max-workers=2)
}
if ! assemble 2>&1 | tee "$private/gradle.log"; then
  if ! grep -Fq "could not resolve plugin artifact" "$private/gradle.log"; then exit 1; fi
  echo "Retrying one Gradle plugin resolution failure."
  sleep 5
  assemble
fi
rm -f "$private/gradle.log"
mv "$app/android/app/build/outputs/apk/release/app-release.apk" "$private/preview.apk"
python3 - "$private/preview.apk" <<'PYTHON'
from sys import argv
from zipfile import ZipFile

with ZipFile(argv[1]) as archive:
    binary = archive.read("assets/index.android.bundle")
if b"https://127.0.0.1:9443" not in binary or b"ZYX_AUTH_PREVIEW_BROWSER_OPEN" not in binary:
    raise SystemExit("Auth fixture did not compile the loopback origin and Chrome browser target")
PYTHON
(cd "$app/android" && ./gradlew --stop)
rm -rf -- "$app/android/app/build" "$app/android/build" "${GRADLE_USER_HOME:-$HOME/.gradle}/caches"
