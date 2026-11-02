import json
import unittest
from inspect_production_deno import summarize_revision


class ProductionDenoInspectionTest(unittest.TestCase):
    def test_report_keeps_identity_and_discards_credentials(self):
        report = summarize_revision({"id": "revision-test", "status": "succeeded", "env_vars": [
            {"key": "DATABASE_URL", "value": "postgresql://private-user:private-password@db.example/neondb"},
            {"key": "INNGEST_SIGNING_KEY", "value": "private-signing-key"}],
            "timelines": [{"hostnames": ["zyx-background.soezyxst.deno.net"]}]})
        self.assertEqual(report["databaseHost"], "db.example")
        for secret in ("private-user", "private-password", "private-signing-key"):
            self.assertNotIn(secret, json.dumps(report))


if __name__ == "__main__":
    unittest.main()
