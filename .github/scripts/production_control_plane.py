"""Inspect exact production writers and explicitly pause legacy Inngest functions."""
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PROJECT = "prj_9wDdc36VFIH5wJT45jEXIHGst2pb"
TEAM = "team_rMFT8hSTCTObKzXirjJcbMFc"
ENVIRONMENT = "production-1bedaa8a"


def request(origin, path, token, headers=None, body=None):
    try:
        with urlopen(Request(origin + path, data=json.dumps(body).encode() if body is not None else None,
                             headers={"Authorization": "Bearer " + token, **({"Content-Type": "application/json"} if body is not None else {}), **(headers or {})}), timeout=20) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, {}


def inngest_pages(path, token, params=None):
    rows, cursor, seen = [], None, set()
    print(json.dumps({"phase": "inngest", "resource": path}), flush=True)
    for _ in range(10):
        query = {"limit": 100, **(params or {}), **({"cursor": cursor} if cursor else {})}
        status, payload = request("https://api.inngest.com", path + "?" + urlencode(query, doseq=True), token, {"X-Inngest-Env": ENVIRONMENT})
        if (status != 200 or not isinstance(payload, dict) or set(payload) - {"data", "metadata", "page"}
                or ("data" in payload and not isinstance(payload["data"], list))
                or ("data" not in payload and not isinstance(payload.get("metadata"), dict))):
            print(json.dumps({"status": status, "dataList": isinstance(payload, dict) and isinstance(payload.get("data"), list)}), flush=True)
            raise ValueError("INNGEST_INVENTORY_UNAVAILABLE")
        data, pagination = payload.get("data", []), payload.get("page")
        # Inngest protobuf JSON omits false hasMore and empty repeated data.
        if (len(data) > query["limit"] or not isinstance(pagination, dict)
                or set(pagination) - {"hasMore", "cursor", "limit"}
                or ("hasMore" in pagination and type(pagination["hasMore"]) is not bool)
                or ("limit" in pagination and (type(pagination["limit"]) is not int or not 1 <= pagination["limit"] <= 250))
                or (pagination.get("cursor") not in (None, "") and not valid_cursor(pagination["cursor"]))):
            print(json.dumps({"status": status, "pagePresent": "page" in payload, "paginationPresent": "pagination" in payload}), flush=True)
            raise ValueError("INNGEST_PAGINATION_UNVERIFIED")
        rows.extend(data)
        if not pagination.get("hasMore", False):
            return rows
        next_cursor = pagination.get("cursor")
        if not valid_cursor(next_cursor) or next_cursor in seen:
            raise ValueError("INNGEST_PAGINATION_UNVERIFIED")
        seen.add(next_cursor)
        cursor = next_cursor
    raise ValueError("INNGEST_INVENTORY_INCOMPLETE")


def valid_cursor(value):
    return isinstance(value, str) and 0 < len(value) <= 1024 and all(32 < ord(char) < 127 for char in value)


def inventory():
    if (os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_REF")) != ("soezyxstt/zyxacademy", "refs/heads/main"):
        raise ValueError("PRODUCTION_BRANCH_REQUIRED")
    token = os.environ.get("INNGEST_API_KEY", "")
    if not token:
        raise ValueError("INNGEST_API_KEY_REQUIRED")
    environments = inngest_pages("/v2/envs", token)
    if any(not isinstance(row, dict) for row in environments):
        raise ValueError("PRODUCTION_INNGEST_ENVIRONMENT_UNVERIFIED")
    production = [row for row in environments if row.get("id") == ENVIRONMENT
                  and row.get("type") in ("PRODUCTION", "TEST") and not row.get("isArchived", False)]
    print(json.dumps({"phase": "environment identity", "environments": [
        {"id": row.get("id"), "name": row.get("name"), "type": row.get("type")} for row in environments]}), flush=True)
    if len(production) != 1:
        raise ValueError("PRODUCTION_INNGEST_ENVIRONMENT_UNVERIFIED")
    functions = inngest_pages("/v2/apps/zyx-academy/functions", token)
    runs = inngest_pages("/v2/runs", token, {"appId": "zyx-academy", "from": "2020-01-01T00:00:00Z", "status": ["RUNNING", "QUEUED", "PAUSED"]})
    if (any(not isinstance(row, dict) or row.get("app", {}).get("id") != "zyx-academy" for row in functions + runs)
            or any(type(row.get("isPaused", False)) is not bool for row in functions)):
        raise ValueError("INNGEST_RESOURCE_SCOPE_MISMATCH")
    result = {"environment": ENVIRONMENT, "environmentId": production[0]["id"],
        "functions": [{"id": row.get("id"), "slug": row.get("slug"), "paused": row.get("isPaused", False),
                       "triggerTypes": [trigger.get("type") for trigger in row.get("triggers", [])]} for row in functions],
        "runs": [{"id": row.get("id"), "status": row.get("status"), "functionId": row.get("function", {}).get("id")} for row in runs],
        "runCounts": {status: sum(row.get("status") == status for row in runs) for status in ("RUNNING", "QUEUED", "PAUSED")},
        "runTimeRange": "Since 2020-01-01 within provider retention; sleeping steps require independent verification"}
    vercel_token = os.environ.get("VERCEL_TOKEN", "")
    print(json.dumps({"phase": "vercel project"}), flush=True)
    status, project = request("https://api.vercel.com", f"/v9/projects/{PROJECT}?teamId={TEAM}", vercel_token)
    if status != 200 or project.get("id") != PROJECT:
        print(json.dumps({"status": status, "projectMatches": project.get("id") == PROJECT}), flush=True)
        raise ValueError("VERCEL_PRODUCTION_PROJECT_UNVERIFIED")
    status, firewall = request("https://api.vercel.com", f"/v1/security/firewall/config/active?projectId={PROJECT}&teamId={TEAM}", vercel_token)
    result["vercel"] = {"projectId": PROJECT, "firewallStatus": status,
        "configured": firewall.get("configured"), "version": firewall.get("version"),
        "rules": [{"id": row.get("id"), "name": row.get("name"), "active": row.get("active")} for row in firewall.get("rules", [])]}
    Path("artifacts/cloud-run-production").mkdir(parents=True, exist_ok=True)
    Path("artifacts/cloud-run-production/control-plane-inventory.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
    return result


def pause_legacy(result):
    if os.environ.get("CONTROL_PLANE_REVIEWED") != "true" or result.get("environmentId") != ENVIRONMENT:
        raise ValueError("INNGEST_PAUSE_REQUIRES_REVIEWED_PRODUCTION")
    ids = [row["id"] for row in result["functions"] if not row["paused"]]
    if not ids:
        print("INNGEST_FUNCTIONS_ALREADY_PAUSED")
        return
    if len(ids) > 500 or len(set(ids)) != len(ids) or any(not isinstance(value, str) or not 0 < len(value.encode()) <= 256 for value in ids):
        raise ValueError("INNGEST_FUNCTION_IDS_UNVERIFIED")
    status, payload = request("https://api.inngest.com", "/v2/apps/zyx-academy/functions/pause",
                              os.environ["INNGEST_API_KEY"], {"X-Inngest-Env": ENVIRONMENT}, {"functionIds": ids})
    rows = payload.get("data", [])
    if (status != 200 or len(rows) != len(ids) or {row.get("functionId") for row in rows} != set(ids)
            or any(row.get("error") or row.get("function", {}).get("app", {}).get("id") != "zyx-academy"
                   or row.get("function", {}).get("id") != row.get("functionId")
                   or row.get("function", {}).get("isPaused") is not True for row in rows)):
        raise ValueError("INNGEST_PAUSE_OUTCOME_UNVERIFIED_REINSPECT_BEFORE_RETRY")
    report = {"environmentId": ENVIRONMENT, "pausedFunctionIds": ids, "drainVerified": False}
    Path("artifacts/cloud-run-production/control-plane-pause.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


def main():
    try:
        operation = os.environ.get("CONTROL_PLANE_OPERATION", "inventory")
        if operation not in ("inventory", "pause-inngest"):
            raise ValueError("CONTROL_PLANE_OPERATION_INVALID")
        result = inventory()
        if operation == "pause-inngest":
            pause_legacy(result)
    except (ValueError, KeyError, OSError) as error:
        code = str(error) if type(error) is ValueError and re.fullmatch(r"[A-Z_]+", str(error)) else "PRODUCTION_CONTROL_PLANE_INVENTORY_FAILED"
        raise SystemExit(code) from None


if __name__ == "__main__":
    main()
