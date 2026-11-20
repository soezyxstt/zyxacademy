import unittest
from unittest.mock import patch
from pathlib import Path

import production_control_plane as control


class InventoryTest(unittest.TestCase):
    def test_protobuf_terminal_pages_omit_false_and_empty_data(self):
        for payload, expected in [({"metadata": {}, "page": {"limit": 100}}, []),
                                  ({"data": [{"id": "last"}], "page": {"cursor": "retained", "limit": 100}}, [{"id": "last"}])]:
            with patch.object(control, "request", return_value=(200, payload)):
                self.assertEqual(control.inngest_pages("/v2/runs", "synthetic"), expected)
        for payload in [{"data": []}, {"data": [], "page": {"hasMore": "false"}},
                        {"data": [], "page": {"unexpected": True}}, {"data": [], "page": {"hasMore": True}}]:
            with patch.object(control, "request", return_value=(200, payload)):
                with self.assertRaisesRegex(ValueError, "PAGINATION_UNVERIFIED"):
                    control.inngest_pages("/v2/runs", "synthetic")

    def test_inventory_pins_the_configured_environment_not_builtin_production(self):
        pages = [[{"id": "other", "type": "PRODUCTION"}, {"id": control.ENVIRONMENT, "type": "TEST", "name": "Production"}],
                 [{"id": "owned", "app": {"id": "zyx-academy"}}], []]
        with patch.dict(control.os.environ, {"GITHUB_REPOSITORY": "soezyxstt/zyxacademy", "GITHUB_REF": "refs/heads/main", "INNGEST_API_KEY": "synthetic"}), \
             patch.object(control, "inngest_pages", side_effect=pages), \
             patch.object(control, "request", side_effect=[(200, {"id": control.PROJECT}), (404, {})]), \
             patch.object(Path, "mkdir"), patch.object(Path, "write_text"):
            result = control.inventory()
            self.assertEqual(result["environmentId"], control.ENVIRONMENT)
            self.assertFalse(result["functions"][0]["paused"])

    def test_pause_requires_review_and_verifies_each_result_without_claiming_drain(self):
        result = {"environmentId": control.ENVIRONMENT, "functions": [{"id": "owned", "paused": False}, {"id": "already", "paused": True}]}
        with patch.dict(control.os.environ, {"CONTROL_PLANE_REVIEWED": "false"}):
            with self.assertRaisesRegex(ValueError, "REQUIRES_REVIEWED_PRODUCTION"):
                control.pause_legacy(result)
        response = {"data": [{"functionId": "owned", "function": {"id": "owned", "app": {"id": "zyx-academy"}, "isPaused": True}}]}
        with patch.dict(control.os.environ, {"CONTROL_PLANE_REVIEWED": "true", "INNGEST_API_KEY": "synthetic"}), \
             patch.object(control, "request", return_value=(200, response)) as call, patch.object(Path, "write_text") as write:
            control.pause_legacy(result)
            self.assertEqual(call.call_args.args[-1], {"functionIds": ["owned"]})
            self.assertIn('"drainVerified": false', write.call_args.args[0])
        response["data"][0]["function"]["isPaused"] = False
        with patch.dict(control.os.environ, {"CONTROL_PLANE_REVIEWED": "true", "INNGEST_API_KEY": "synthetic"}), \
             patch.object(control, "request", return_value=(200, response)):
            with self.assertRaisesRegex(ValueError, "OUTCOME_UNVERIFIED"):
                control.pause_legacy(result)

    def test_failure_reports_only_fixed_codes_without_raw_credentials(self):
        for error, expected in [(ValueError("INNGEST_API_KEY_REQUIRED"), "INNGEST_API_KEY_REQUIRED"),
                                (ValueError("token=synthetic-secret"), "PRODUCTION_CONTROL_PLANE_INVENTORY_FAILED"),
                                (OSError("synthetic-secret"), "PRODUCTION_CONTROL_PLANE_INVENTORY_FAILED")]:
            with patch.object(control, "inventory", side_effect=error):
                with self.assertRaises(SystemExit) as result:
                    control.main()
                self.assertEqual(result.exception.code, expected)

    def test_pagination_cannot_silently_truncate_writer_inventory(self):
        page = {"data": [{"id": "owned"}], "page": {"hasMore": True, "cursor": "same"}}
        with patch.object(control, "request", return_value=(200, page)):
            with self.assertRaisesRegex(ValueError, "PAGINATION_UNVERIFIED"):
                control.inngest_pages("/v2/runs", "synthetic")
        with patch.object(control, "request", return_value=(401, {})):
            with self.assertRaisesRegex(ValueError, "INVENTORY_UNAVAILABLE"):
                control.inngest_pages("/v2/runs", "synthetic")

    def test_inventory_requires_exact_main_repository(self):
        with patch.dict(control.os.environ, {"GITHUB_REPOSITORY": "soezyxstt/zyxacademy", "GITHUB_REF": "refs/heads/staging"}):
            with self.assertRaisesRegex(ValueError, "PRODUCTION_BRANCH_REQUIRED"):
                control.inventory()


if __name__ == "__main__":
    unittest.main()
