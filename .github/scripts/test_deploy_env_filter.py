"""Exercise the deployment's actual filter using dummy values only."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class DeployEnvFilterTest(unittest.TestCase):
    def filter_env(self, content):
        workflow = Path(__file__).resolve().parents[1] / "workflows" / "deploy.yml"
        command = next(
            line.strip()
            for line in workflow.read_text().splitlines()
            if ".env.deploy > .env.deploy.filtered" in line
        )
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / ".env.deploy"
            source.write_text(content)
            subprocess.run(
                ["bash", "-e", "-c", command],
                cwd=directory,
                env={"PATH": os.defpath},
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(source.read_text(), content)
            return (Path(directory) / ".env.deploy.filtered").read_text()

    def test_staging_sync_includes_neon_and_optional_runtime_settings(self):
        workflow = (Path(__file__).resolve().parents[1] / "workflows" / "deploy.yml").read_text()
        staging = workflow.split('if [ "${{ github.ref_name }}" = staging ]; then', 1)[1].split("          fi", 1)[0]
        for key in ("STORAGE_PROVIDER_MODE", "NEON_STORAGE_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_REGION",
                    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "INNGEST_ENV", "CF_BROWSER_API_TOKEN",
                    "AUTHORING_VERIFICATION_ACCESS_URL"):
            with self.subTest(key=key):
                self.assertIn(f"{key}=${{STAGING_{key}}}", staging)

    def test_preserves_padded_secrets_and_embedded_equals(self):
        values = (
            "BETTER_AUTH_SECRET=ZHVtbXktdmFsdWU=\n"
            "R2_SECRET_ACCESS_KEY=ZHVtbXk=\n"
            "OTHER_SECRET=YQ==\n"
            "EQUALS_ONLY==\n"
            "URL=https://example.invalid/?a=b=c\n"
            "PLAIN=dummy-value\n"
        )
        self.assertEqual(self.filter_env("EMPTY=\n" + values + "EMPTY_2=\n"), values)

    def test_all_empty_inputs_produce_empty_output_without_failure(self):
        for content in ("", "BETTER_AUTH_SECRET=\n", "FIRST=\nSECOND=\n"):
            with self.subTest(content=content):
                self.assertEqual(self.filter_env(content), "")


if __name__ == "__main__":
    unittest.main()
