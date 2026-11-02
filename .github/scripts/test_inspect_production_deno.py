import json
import unittest
from inspect_production_deno import summarize_revision, rollback_changes, ROLLBACK_REVISION


class ProductionDenoInspectionTest(unittest.TestCase):
    def test_rollback_changes_only_the_verified_database_and_owned_storage_settings(self):
        app = {"id": "b9601da7-4854-457a-b30e-0bffdf30420c", "env_vars": [
            {"id": "db", "key": "DATABASE_URL", "contexts": "all"},
            {"id": "s3", "key": "AWS_SECRET_ACCESS_KEY"},
            {"id": "keep", "key": "BETTER_AUTH_SECRET"}]}
        revisions = [{"id": ROLLBACK_REVISION, "status": "succeeded"}]
        updates = rollback_changes(app, revisions)
        self.assertEqual({item["id"] for item in updates}, {"db", "s3"})
        self.assertEqual(updates[1], {"id": "s3", "delete": True})
        with self.assertRaises(RuntimeError):
            rollback_changes({**app, "id": "different-app"}, revisions)
        with self.assertRaises(RuntimeError):
            rollback_changes(app, [])

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
