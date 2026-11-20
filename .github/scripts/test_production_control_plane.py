import json
import unittest
from pathlib import Path
from unittest.mock import patch

import production_control_plane as control


class InventoryTest(unittest.TestCase):
    def test_inventory_inspects_vercel_without_inngest(self):
        firewall = {
            "configured": True,
            "version": 3,
            "rules": [{"id": "rule-1", "name": "Fence API", "active": True}],
        }
        with patch.dict(control.os.environ, {"GITHUB_REPOSITORY": "soezyxstt/zyxacademy", "GITHUB_REF": "refs/heads/main", "VERCEL_TOKEN": "synthetic"}, clear=True), \
             patch.object(control, "request", side_effect=[(200, {"id": control.PROJECT}), (200, firewall)]) as call, \
             patch.object(Path, "mkdir"), patch.object(Path, "write_text") as write:
            result = control.inventory()
            self.assertEqual(call.call_count, 2)
            self.assertEqual(result["vercel"]["projectId"], control.PROJECT)
            self.assertEqual(result["vercel"]["firewallStatus"], 200)
            self.assertEqual(result["vercel"]["rules"], [{"id": "rule-1", "name": "Fence API", "active": True}])
            self.assertEqual(json.loads(write.call_args.args[0]), result)

    def test_inventory_tolerates_missing_vercel_firewall_config(self):
        with patch.dict(control.os.environ, {"GITHUB_REPOSITORY": "soezyxstt/zyxacademy", "GITHUB_REF": "refs/heads/main", "VERCEL_TOKEN": "synthetic"}, clear=True), \
             patch.object(control, "request", side_effect=[(200, {"id": control.PROJECT}), (404, {})]), \
             patch.object(Path, "mkdir"), patch.object(Path, "write_text"):
            result = control.inventory()
            self.assertEqual(result["vercel"]["firewallStatus"], 404)
            self.assertEqual(result["vercel"]["rules"], [])

    def test_inventory_requires_vercel_token_and_exact_project(self):
        with patch.dict(control.os.environ, {"GITHUB_REPOSITORY": "soezyxstt/zyxacademy", "GITHUB_REF": "refs/heads/main"}, clear=True):
            with self.assertRaisesRegex(ValueError, "VERCEL_TOKEN_REQUIRED"):
                control.inventory()
        with patch.dict(control.os.environ, {"GITHUB_REPOSITORY": "soezyxstt/zyxacademy", "GITHUB_REF": "refs/heads/main", "VERCEL_TOKEN": "synthetic"}, clear=True), \
             patch.object(control, "request", return_value=(200, {"id": "other"})):
            with self.assertRaisesRegex(ValueError, "VERCEL_PRODUCTION_PROJECT_UNVERIFIED"):
                control.inventory()

    def test_failure_reports_only_fixed_codes_without_raw_credentials(self):
        for error, expected in [(ValueError("VERCEL_TOKEN_REQUIRED"), "VERCEL_TOKEN_REQUIRED"),
                                (ValueError("token=synthetic-secret"), "PRODUCTION_CONTROL_PLANE_INVENTORY_FAILED"),
                                (OSError("synthetic-secret"), "PRODUCTION_CONTROL_PLANE_INVENTORY_FAILED")]:
            with patch.object(control, "inventory", side_effect=error):
                with self.assertRaises(SystemExit) as result:
                    control.main()
                self.assertEqual(result.exception.code, expected)

    def test_inventory_requires_exact_main_repository(self):
        with patch.dict(control.os.environ, {"GITHUB_REPOSITORY": "soezyxstt/zyxacademy", "GITHUB_REF": "refs/heads/staging", "VERCEL_TOKEN": "synthetic"}, clear=True):
            with self.assertRaisesRegex(ValueError, "PRODUCTION_BRANCH_REQUIRED"):
                control.inventory()

    def test_rejects_legacy_pause_inngest_operation(self):
        with patch.dict(control.os.environ, {"CONTROL_PLANE_OPERATION": "pause-inngest"}, clear=True):
            with self.assertRaises(SystemExit) as result:
                control.main()
            self.assertEqual(result.exception.code, "CONTROL_PLANE_OPERATION_INVALID")


if __name__ == "__main__":
    unittest.main()
