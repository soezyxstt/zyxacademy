"""Inspect the production Vercel control plane without mutation."""
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PROJECT = "prj_9wDdc36VFIH5wJT45jEXIHGst2pb"
TEAM = "team_rMFT8hSTCTObKzXirjJcbMFc"


def request(origin, path, token, headers=None, body=None):
    try:
        with urlopen(Request(origin + path, data=json.dumps(body).encode() if body is not None else None,
                             headers={"Authorization": "Bearer " + token, **({"Content-Type": "application/json"} if body is not None else {}), **(headers or {})}), timeout=20) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, {}


def inventory():
    if (os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_REF")) != ("soezyxstt/zyxacademy", "refs/heads/main"):
        raise ValueError("PRODUCTION_BRANCH_REQUIRED")
    vercel_token = os.environ.get("VERCEL_TOKEN", "")
    if not vercel_token:
        raise ValueError("VERCEL_TOKEN_REQUIRED")
    print(json.dumps({"phase": "vercel project"}), flush=True)
    status, project = request("https://api.vercel.com", f"/v9/projects/{PROJECT}?teamId={TEAM}", vercel_token)
    if status != 200 or not isinstance(project, dict) or project.get("id") != PROJECT:
        print(json.dumps({"status": status, "projectMatches": isinstance(project, dict) and project.get("id") == PROJECT}), flush=True)
        raise ValueError("VERCEL_PRODUCTION_PROJECT_UNVERIFIED")
    status, firewall = request("https://api.vercel.com", f"/v1/security/firewall/config/active?projectId={PROJECT}&teamId={TEAM}", vercel_token)
    firewall_data = firewall if isinstance(firewall, dict) else {}
    rules = firewall_data.get("rules", [])
    result = {
        "vercel": {
            "projectId": PROJECT,
            "firewallStatus": status,
            "configured": firewall_data.get("configured"),
            "version": firewall_data.get("version"),
            "rules": [
                {"id": row.get("id"), "name": row.get("name"), "active": row.get("active")}
                for row in rules if isinstance(row, dict)
            ] if isinstance(rules, list) else [],
        },
    }
    Path("artifacts/cloud-run-production").mkdir(parents=True, exist_ok=True)
    Path("artifacts/cloud-run-production/control-plane-inventory.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
    return result


def main():
    try:
        operation = os.environ.get("CONTROL_PLANE_OPERATION", "inventory")
        if operation != "inventory":
            raise ValueError("CONTROL_PLANE_OPERATION_INVALID")
        inventory()
    except (ValueError, KeyError, OSError) as error:
        code = str(error) if type(error) is ValueError and re.fullmatch(r"[A-Z_]+", str(error)) else "PRODUCTION_CONTROL_PLANE_INVENTORY_FAILED"
        raise SystemExit(code) from None


if __name__ == "__main__":
    main()
