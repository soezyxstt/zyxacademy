import contextlib
import importlib.util
import io
import os
from pathlib import Path
import unittest
from unittest.mock import patch

p = Path(__file__).with_name('pr333-staging-inventory.py')
spec = importlib.util.spec_from_file_location('inventory', p)
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)


class InventoryTests(unittest.TestCase):
    def test_origin_strips_auth_query_fragment_and_path(self):
        self.assertEqual(inv.origin('https://user:password@staging.example.com/path?key=private#fragment'), 'https://staging.example.com')
        self.assertIsNone(inv.origin('http://staging.example.com/path'))
        self.assertIsNone(inv.origin('https://staging.example.com:8443/'))

    def test_endpoint_allowlist_rejects_production_and_secret_endpoints(self):
        for host, path in [('run.googleapis.com', '/v2/projects/other/locations/asia-east1/services/app'),
                           ('api.deno.com', '/v2/apps/zyx-background-staging'),
                           ('api.inngest.com', '/v2/keys/signing')]:
            with self.assertRaisesRegex(ValueError, 'ENDPOINT_NOT_ALLOWED'):
                inv.request(host, path, 'synthetic')

    def test_google_key_identity_guard_does_not_emit_key_or_email(self):
        key = '{"type":"service_account","project_id":"zyx-academy","client_email":"test@zyx-academy.iam.gserviceaccount.com","private_key":"synthetic-private-key"}'
        with patch.dict(os.environ, {'GCP_SERVICE_ACCOUNT_KEY': key}, clear=True), contextlib.redirect_stdout(io.StringIO()) as output:
            inv.key_guard()
        self.assertNotIn('synthetic-private-key', output.getvalue())
        self.assertNotIn('test@', output.getvalue())
        with patch.dict(os.environ, {'GCP_SERVICE_ACCOUNT_KEY': key.replace('zyx-academy', 'other', 1)}, clear=True):
            with self.assertRaisesRegex(ValueError, 'GOOGLE_IDENTITY_GUARD_FAILED'):
                inv.key_guard()

    def test_inngest_pagination_requires_explicit_has_more(self):
        with patch.object(inv, 'request', return_value=({'data': []}, '')):
            with self.assertRaisesRegex(ValueError, 'INNGEST_PAGINATION_UNKNOWN'):
                inv.pages('/v2/envs', 'synthetic', {}, {})

    def test_inngest_wrong_environment_stops_before_app_query(self):
        with patch.dict(os.environ, {'INNGEST_SIGNING_KEY': 'synthetic'}, clear=True), \
             patch.object(inv, 'pages', return_value=([{'id': 'wrong'}], True)), \
             patch.object(inv, 'request') as request:
            with self.assertRaisesRegex(ValueError, 'INNGEST_ENVIRONMENT_MISMATCH'):
                inv.inngest()
            request.assert_not_called()

    def test_deno_requires_known_hostname_before_output(self):
        responses = [([{'id': 'rev1', 'status': 'succeeded'}], ''),
                     ([{'slug': 'preview', 'domains': [{'domain': 'elsewhere.example'}]}], '')]
        with patch.dict(os.environ, {'DENO_DEPLOY_TOKEN': 'synthetic'}, clear=True), \
             patch.object(inv, 'request', side_effect=responses), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaisesRegex(ValueError, 'DENO_ORGANIZATION_HOST_UNVERIFIED'):
                inv.deno()
            self.assertEqual(output.getvalue(), '')

    def test_deno_outputs_known_app_without_labels_or_env(self):
        responses = [([{'id': 'rev1', 'status': 'succeeded', 'labels': {'private': 'unwanted'}}], ''),
                     ([{'slug': 'production', 'domains': [{'domain': inv.DENO_HOST}]}], '')]
        with patch.dict(os.environ, {'DENO_DEPLOY_TOKEN': 'synthetic'}, clear=True), \
             patch.object(inv, 'request', side_effect=responses), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            inv.deno()
            self.assertIn(inv.DENO_HOST, output.getvalue())
            self.assertNotIn('unwanted', output.getvalue())
            self.assertNotIn('synthetic', output.getvalue())


if __name__ == '__main__':
    unittest.main()
