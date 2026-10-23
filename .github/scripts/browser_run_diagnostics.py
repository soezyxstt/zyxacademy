"""Inspect capacity and acquire/release one empty browser. Never print identities or credentials."""
import json
import os
import re
import sys
import urllib.error
import urllib.request

account = os.environ.get("CF_ACCOUNT_ID", "")
token = os.environ.get("CF_API_TOKEN", "")
if not re.fullmatch(r"[a-fA-F0-9]{32}", account) or not token:
    sys.exit("VERIFICATION_BROWSER_CONFIGURATION_REQUIRED")
base = f"https://api.cloudflare.com/client/v4/accounts/{account}/browser-run/devtools"


def request(path, method="GET"):
    req = urllib.request.Request(base + path, method=method, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.headers, json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            pass
        return error.code, error.headers, body


def sessions():
    status, _, body = request("/session")
    result = body.get("result", body) if isinstance(body, dict) else body
    items = result if isinstance(result, list) else result.get("sessions") if isinstance(result, dict) else None
    print(json.dumps({"probe": "sessions", "httpStatus": status, "activeSessions": len(items) if isinstance(items, list) else None}))


sessions()
status, headers, body = request("/browser?keep_alive=60000", "POST")
result = body.get("result", body) if isinstance(body, dict) else {}
print(json.dumps({"probe": "acquire-shape", "fields": sorted(body.keys()) if isinstance(body, dict) else [], "sessionFields": sorted(result.keys()) if isinstance(result, dict) else []}))
print(json.dumps({"probe": "acquire", "httpStatus": status,
                  "retryAfter": headers.get("Retry-After") if re.fullmatch(r"[0-9]+", headers.get("Retry-After", "")) else None,
                  "dailyQuotaExceeded": bool(re.search(r"browser time limit exceeded|daily.*(?:limit|quota)|(?:limit|quota).*today", json.dumps(body), re.I)),
                  "rateLimited": status == 429}))
if not 200 <= status < 300:
    sys.exit(1)
session = result.get("sessionId")
if not isinstance(session, str) or not re.fullmatch(r"[a-fA-F0-9-]{36}", session):
    sys.exit("VERIFICATION_BROWSER_SESSION_INVALID")
try:
    version_status, _, version = request(f"/browser/{session}/json/version")
    browser = version.get("Browser", "") if isinstance(version, dict) else ""
    print(json.dumps({"probe": "version", "httpStatus": version_status,
                      "browserVersion": browser if re.fullmatch(r"(?:Chrome|HeadlessChrome)/[0-9.]+", browser) else None}))
finally:
    close_status, _, _ = request(f"/browser/{session}", "DELETE")
    print(json.dumps({"probe": "release", "httpStatus": close_status}))
    if not 200 <= close_status < 300 and close_status != 404:
        sys.exit(1)
sessions()
