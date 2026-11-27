#!/usr/bin/env bash
set -euo pipefail
if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_OS:-} != Linux || -z ${RUNNER_TEMP:-} ]]; then
  echo "Android emulator preparation runs on the hosted build runner." >&2
  exit 2
fi

project=apps/mobile-native/android
apk="$RUNNER_TEMP/zyx-native-emulator.apk"
test -s "$project/app/build/outputs/apk/release/app-release.apk"
mv "$project/app/build/outputs/apk/release/app-release.apk" "$apk"
echo "PARITY_APK_PATH=$apk" >> "$GITHUB_ENV"
# The compiled APK is all the emulator needs. Reclaim space before the SDK
# expands the system image alongside its download.
(cd "$project" && ./gradlew --stop)
rm -rf -- "$project/app/build" "$project/build" "${GRADLE_USER_HOME:-$HOME/.gradle}/caches"
df -h "$RUNNER_TEMP"
package='system-images;android-35;google_apis;x86_64'
image="$ANDROID_HOME/system-images/android-35/google_apis/x86_64"
manager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
for attempt in 1 2; do
  if "$manager" --install "$package" && [[ -s $image/system.img && -s $image/package.xml ]]; then
    exit 0
  fi
  if (( attempt == 1 )); then
    "$manager" --uninstall "$package" || true
  fi
done
echo "Android API 35 x86_64 system image is incomplete." >&2
exit 1
