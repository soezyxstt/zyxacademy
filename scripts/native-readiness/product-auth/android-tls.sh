#!/usr/bin/env bash
set -euo pipefail
if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_ENVIRONMENT:-} != github-hosted ||
  ${NATIVE_PRODUCT_AUTH_FIXTURE:-} != 1 || -z ${RUNNER_TEMP:-} ]]; then
  echo "Authenticated emulator TLS requires the isolated GitHub-hosted job." >&2
  exit 2
fi

private="$RUNNER_TEMP/native-auth-preview"
umask 077
mkdir "$private"
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 \
  -keyout "$private/key.pem" -out "$private/cert.pem" 2>/dev/null
