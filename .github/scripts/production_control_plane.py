"""Read only the exact production writer control planes; never emit credentials."""
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PROJECT = "prj_9wDdc36VFIH5wJT45jEXIHGst2pb"
TEAM = "team_rMFT8hSTCTObKzXirjJcbMFc"
ENVIRONMENT = "production-1bedaa8a"


def request(origin, path, token, headers=None):
    try:
        with urlopen(Request(origin + path, headers={"Authorization": "Bearer " + token, **(headers or {})}), timeout=20) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        payload = json.load(error)
        return error.code, {"errorCode": payload.get("error", {}).get("code") or payload.get("code")}


def inngest_pages(path, token, params=None):
    rows, cursor = [], None
    for _ in range(10):
        query = {"limit": 100, **(params or {}), **({"cursor": cursor} if cursor else {})}
        status, payload = request("https://api.inngest.com", path + "?" + urlencode(query, doseq=True), token, {"X-Inngest-Env": ENVIRONMENT})
        if status != 200 or not isinstance(payload.get("data"), list):
            raise ValueError("INNGEST_INVENTORY_UNAVAILABLE")
        rows.extend(payload["data"])
        pagination = payload.get("page", {})
        if not isinstance(pagination.get("hasMore"), bool):
            raise ValueError("INNGEST_PAGINATION_UNVERIFIED")
        if not pagination.get("hasMore"):
            return rows
        next_cursor = pagination.get("cursor")
        if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor:
            raise ValueError("INNGEST_PAGINATION_UNVERIFIED")
        cursor = next_cursor
    raise ValueError("INNGEST_INVENTORY_INCOMPLETE")


def inventory():
    if (os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_REF")) != ("soezyxstt/zyxacademy", "refs/heads/main"):
        raise ValueError("PRODUCTION_BRANCH_REQUIRED")
    token = os.environ.get("INNGEST_API_KEY", "")
    if not token:
        raise ValueError("INNGEST_API_KEY_REQUIRED")
    environments = inngest_pages("/v2/envs", token)
    production = [row for row in environments if row.get("type") == "PRODUCTION"]
    if len(production) != 1:
        raise ValueError("PRODUCTION_INNGEST_ENVIRONMENT_UNVERIFIED")
    functions = inngest_pages("/v2/apps/zyx-academy/functions", token)
    runs = inngest_pages("/v2/runs", token, {"appId": "zyx-academy", "from": "2020-01-01T00:00:00Z", "status": ["RUNNING", "QUEUED", "PAUSED"]})
    if any(row.get("app", {}).get("id") != "zyx-academy" for row in functions + runs):
        raise ValueError("INNGEST_RESOURCE_SCOPE_MISMATCH")
    result = {"environment": ENVIRONMENT, "environmentId": production[0]["id"],
        "functions": [{"id": row.get("id"), "slug": row.get("slug"), "paused": row.get("isPaused"),
                       "triggerTypes": [trigger.get("type") for trigger in row.get("triggers", [])]} for row in functions],
        "runs": [{"id": row.get("id"), "status": row.get("status"), "functionId": row.get("function", {}).get("id")} for row in runs],
        "runCounts": {status: sum(row.get("status") == status for row in runs) for status in ("RUNNING", "QUEUED", "PAUSED")},
        "runTimeRange": "Since 2020-01-01 within provider retention; sleeping steps require independent verification"}
    vercel_token = os.environ.get("VERCEL_TOKEN", "")
    status, project = request("https://api.vercel.com", f"/v9/projects/{PROJECT}?teamId={TEAM}", vercel_token)
    if status != 200 or project.get("id") != PROJECT:
        raise ValueError("VERCEL_PRODUCTION_PROJECT_UNVERIFIED")
    status, firewall = request("https://api.vercel.com", f"/v1/security/firewall/config/active?projectId={PROJECT}&teamId={TEAM}", vercel_token)
    result["vercel"] = {"projectId": PROJECT, "firewallStatus": status,
        "configured": firewall.get("configured"), "version": firewall.get("version"),
        "rules": [{"id": row.get("id"), "name": row.get("name"), "active": row.get("active")} for row in firewall.get("rules", [])]}
    Path("artifacts/cloud-run-production").mkdir(parents=True, exist_ok=True)
    Path("artifacts/cloud-run-production/control-plane-inventory.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        inventory()
    except (ValueError, KeyError, OSError):
        raise SystemExit("PRODUCTION_CONTROL_PLANE_INVENTORY_FAILED")
