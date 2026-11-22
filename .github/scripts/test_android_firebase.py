import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "android_firebase", Path(__file__).resolve().parents[2] / "apps/scripts/configure-android-firebase.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AndroidFirebaseTests(unittest.TestCase):
    def test_accepts_matching_channel_and_preserves_config(self):
        for channel, project, package, valid in [
            ("nightly", "zyx-academy-staging", "com.zyx.academy.nightly", True),
            ("stable", "zyx-academy-staging", "com.zyx.academy", True),
            ("stable", "zyx-academy-staging", "com.zyx.academy.nightly", False),
            ("invalid", "zyx-academy-staging", "com.zyx.academy", False),
            ("nightly", "zyx-academy", "com.zyx.academy.nightly", False),
            ("nightly", "zyx-academy-staging", "com.zyx.academy", False),
        ]:
            config = {"project_info": {"project_id": project}, "client": [
                {"client_info": {"android_client_info": {"package_name": package}}}]}
            with self.subTest(channel=channel, project=project, package=package), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / channel / "google-services.json"
                if valid:
                    module.configure(json.dumps(config), target, channel)
                    self.assertEqual(json.loads(target.read_text()), config)
                else:
                    with self.assertRaises(ValueError):
                        module.configure(json.dumps(config), target, channel)
                    self.assertFalse(target.exists())
