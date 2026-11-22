import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "nightly_firebase", Path(__file__).resolve().parents[2] / "apps/scripts/configure-nightly-firebase.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NightlyFirebaseTests(unittest.TestCase):
    def test_accepts_only_staging_nightly_and_preserves_config(self):
        for project, package, valid in [
            ("zyx-academy-staging", "com.zyx.academy.nightly", True),
            ("zyx-academy", "com.zyx.academy.nightly", False),
            ("zyx-academy-staging", "com.zyx.academy", False),
        ]:
            config = {"project_info": {"project_id": project}, "client": [
                {"client_info": {"android_client_info": {"package_name": package}}}]}
            with self.subTest(project=project, package=package), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / "nightly/google-services.json"
                if valid:
                    module.configure(json.dumps(config), target)
                    self.assertEqual(json.loads(target.read_text()), config)
                else:
                    with self.assertRaises(ValueError):
                        module.configure(json.dumps(config), target)
                    self.assertFalse(target.exists())
