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

source="$app/auth/session-api.ts"
cp "$source" "$private/session-api.ts"
trap 'mv "$private/session-api.ts" "$source"' EXIT
(cd "$app" && npx --no-install expo prebuild --platform android --no-install)
python3 "$root/scripts/native-readiness/product-auth/android-overlay.py" "$private/cert.pem"
(cd "$app/android" && ./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64 --max-workers=2)
mv "$app/android/app/build/outputs/apk/release/app-release.apk" "$private/preview.apk"
(cd "$app/android" && ./gradlew --stop)
rm -rf -- "$app/android/app/build" "$app/android/build" "${GRADLE_USER_HOME:-$HOME/.gradle}/caches"
