import unittest
from unittest.mock import patch

import production_control_plane as control


class InventoryTest(unittest.TestCase):
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
