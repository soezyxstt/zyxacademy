import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
from urllib.error import HTTPError
import unittest
from unittest.mock import patch

p = Path(__file__).with_name('pr333-staging-inventory.py')
spec = importlib.util.spec_from_file_location('inventory', p)
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)
TEST_ENV_ID = '12345678-1234-1234-1234-123456789abc'
TEST_ENV = {'id': TEST_ENV_ID, 'name': inv.INNGEST_ENV, 'type': 'TEST'}


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

    def test_inngest_pagination_requires_page(self):
        with patch.object(inv, 'request', return_value=({'data': []}, '')):
            with self.assertRaisesRegex(ValueError, 'INNGEST_PAGINATION_UNKNOWN'):
                inv.pages('/v2/envs', 'synthetic', {}, {})

    def test_inngest_wrong_environment_stops_before_app_query(self):
        with patch.dict(os.environ, {'INNGEST_SIGNING_KEY': 'synthetic'}, clear=True), \
             patch.object(inv, 'pages', return_value=([{'id': TEST_ENV_ID, 'name': 'other', 'type': 'TEST'}], True)), \
             patch.object(inv, 'request') as request:
            with self.assertRaisesRegex(ValueError, 'INNGEST_ENVIRONMENT_UNVERIFIED'):
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


    def test_inngest_documented_page_and_cursor(self):
        replies = [({'data': [{'id': 'a'}], 'page': {'hasMore': True, 'cursor': 'abc'}}, ''),
                   ({'data': [{'id': 'b'}], 'page': {'hasMore': False}}, '')]
        with patch.object(inv, 'request', side_effect=replies) as request:
            rows, complete = inv.pages('/v2/envs', 'synthetic', {'limit': 250}, {})
        self.assertEqual([row['id'] for row in rows], ['a', 'b'])
        self.assertTrue(complete)
        self.assertEqual(request.call_args_list[1].args[3]['cursor'], 'abc')

    def test_inngest_proto_default_false_and_ambiguous_cursor(self):
        for page in ({}, {'limit': 250}, {'hasMore': False, 'limit': 250}):
            with self.subTest(page=page), patch.object(inv, 'request', return_value=(
                    {'data': [{'id': 'a'}], 'metadata': {}, 'page': page}, '')):
                self.assertEqual(inv.pages('/v2/envs', 'synthetic', {'limit': 250}, {})[1], True)
        with patch.object(inv, 'request', return_value=({'metadata': {}, 'page': {'limit': 100}}, '')):
            self.assertEqual(inv.pages('/v2/runs', 'synthetic', {'limit': 100}, {}), ([], True))
        with patch.object(inv, 'request', return_value=({'page': {'limit': 100}}, '')), \
             contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, 'INNGEST_BAD_RESPONSE'):
                inv.pages('/v2/runs', 'synthetic', {'limit': 100}, {})
        for page in ({'cursor': 'abc'}, {'hasMore': None}, {'limit': True}, {'unknown': 'private'}):
            with self.subTest(page=page), patch.object(inv, 'request', return_value=(
                    {'data': [], 'page': page}, '')), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(ValueError, 'INNGEST_PAGINATION_UNKNOWN'):
                    inv.pages('/v2/envs', 'synthetic', {'limit': 250}, {})

    def test_inngest_environment_identity_is_bounded_and_fails_closed(self):
        cases = [([{'id': TEST_ENV_ID, 'name': 'Staging', 'type': 'TEST'}], True),
                 ([{**TEST_ENV, 'type': 'PRODUCTION'}], True),
                 ([{**TEST_ENV, 'id': 'not-a-uuid'}], True),
                 ([{**TEST_ENV, 'isArchived': True}], True),
                 ([TEST_ENV, {'id': TEST_ENV_ID, 'name': 'secret-name', 'type': 'TEST'}], True),
                 ([TEST_ENV], False)]
        for envs, complete in cases:
            with self.subTest(envs=envs, complete=complete), contextlib.redirect_stdout(io.StringIO()) as output:
                with self.assertRaisesRegex(ValueError, 'INNGEST_ENVIRONMENT_UNVERIFIED'):
                    inv.inngest_environment(envs, complete)
                self.assertNotIn('secret-name', output.getvalue())
        with contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaises(ValueError):
                inv.inngest_environment([{'id': TEST_ENV_ID, 'name': 'Staging', 'type': 'TEST'}], True)
        result = json.loads(output.getvalue())
        self.assertEqual(result['candidates'][0]['id'], TEST_ENV_ID)
        self.assertEqual(result['candidates'][0]['name'], 'Staging')
        self.assertEqual(result['headerSelection'], 'requested_not_echoed_by_environment_list')

    def test_inngest_bad_and_repeated_cursor_and_page_cap(self):
        for cursor in (None, '', 'x' * 1025, 'with space'):
            with self.subTest(cursor=cursor), patch.object(inv, 'request', return_value=(
                    {'data': [], 'page': {'hasMore': True, 'cursor': cursor}}, '')):
                with self.assertRaisesRegex(ValueError, 'INNGEST_BAD_CURSOR'):
                    inv.pages('/v2/envs', 'synthetic', {}, {})
        response = ({'data': [], 'page': {'hasMore': True, 'cursor': 'same'}}, '')
        with patch.object(inv, 'request', return_value=response):
            with self.assertRaisesRegex(ValueError, 'INNGEST_BAD_CURSOR'):
                inv.pages('/v2/envs', 'synthetic', {}, {})
        with patch.object(inv, 'request', return_value=response):
            self.assertFalse(inv.pages('/v2/envs', 'synthetic', {}, {}, max_pages=1)[1])

    def test_inngest_slug_identity_requires_exact_configured_id(self):
        with contextlib.redirect_stdout(io.StringIO()):
            actual = inv.inngest_environment([{'id': inv.INNGEST_ENV, 'name': 'Staging', 'type': 'TEST'}], True)
        self.assertEqual(actual['id'], inv.INNGEST_ENV)
        for ident in ('other-staging', 'production', 'unsafe/id'):
            with self.subTest(ident=ident), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(ValueError, 'INNGEST_ENVIRONMENT_UNVERIFIED'):
                    inv.inngest_environment([{'id': ident, 'name': 'Staging', 'type': 'TEST'}], True)

    def test_unknown_shape_diagnostic_does_not_emit_values_or_unknown_key(self):
        payload = {'data': [{'id': 'secret-env-value'}],
                   'pagination': {'nextCursor': 'secret-cursor', 'secret-key': 'secret-value'},
                   'secret-top-key': 'secret-top-value'}
        with patch.object(inv, 'request', return_value=(payload, '')), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaisesRegex(ValueError, 'INNGEST_BAD_RESPONSE'):
                inv.pages('/v2/envs', 'synthetic', {}, {})
        rendered = output.getvalue()
        self.assertIn('"dataCount":1', rendered)
        self.assertIn('"pagination"', rendered)
        self.assertNotIn('secret', rendered)
        self.assertNotIn('synthetic', rendered)

    def test_inngest_rejects_wrong_app_before_function_or_run_calls(self):
        with patch.dict(os.environ, {'INNGEST_SIGNING_KEY': 'synthetic'}, clear=True), \
             patch.object(inv, 'pages', return_value=([TEST_ENV], True)) as pages, \
             patch.object(inv, 'request', return_value=({'data': {'id': 'other'}}, '')):
            with self.assertRaisesRegex(ValueError, 'INNGEST_APP_MISMATCH'):
                inv.inngest()
            self.assertEqual(pages.call_count, 1)

    def test_inngest_scoped_metadata_only(self):
        env = [TEST_ENV]
        funcs = [{'id': 'fn', 'slug': 'fn', 'app': {'id': inv.INNGEST_APP},
                  'isPaused': False, 'isArchived': False, 'private': 'secret-function'}]
        runs = [{'id': 'run1', 'status': 'RUNNING', 'app': {'id': inv.INNGEST_APP},
                 'function': {'id': 'fn'}, 'output': {'secret': 'secret-output'}}]
        with patch.dict(os.environ, {'INNGEST_SIGNING_KEY': 'synthetic'}, clear=True), \
             patch.object(inv, 'pages', side_effect=[(env, True), (funcs, True), (runs, True)]), \
             patch.object(inv, 'request', return_value=({'data': {'id': inv.INNGEST_APP,
                    'latestSync': {'url': 'https://user:pass@example.com/path?secret=token'}}}, '')), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            inv.inngest()
        result = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(result['latestSyncOrigin'], 'https://example.com')
        self.assertEqual(result['runCounts']['RUNNING'], 1)
        self.assertNotIn('secret', output.getvalue())
        self.assertNotIn('pass', output.getvalue())
        self.assertNotIn('synthetic', output.getvalue())

    def test_inngest_actual_envelope_and_header_on_each_read(self):
        replies = [
            ({'data': [TEST_ENV], 'metadata': {}, 'page': {'limit': 250}}, ''),
            ({'data': {'id': inv.INNGEST_APP}}, ''),
            ({'data': [{'id': 'fn', 'app': {'id': inv.INNGEST_APP}}],
              'metadata': {}, 'page': {'limit': 100}}, ''),
            ({'metadata': {}, 'page': {'limit': 100}}, '')]
        with patch.dict(os.environ, {'INNGEST_SIGNING_KEY': 'synthetic'}, clear=True), \
             patch.object(inv, 'request', side_effect=replies) as request, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            inv.inngest()
        records = [json.loads(row) for row in output.getvalue().splitlines()]
        self.assertEqual(records[0]['candidates'][0]['id'], TEST_ENV_ID)
        self.assertEqual(records[1]['runCounts'], {'RUNNING': 0, 'QUEUED': 0, 'PAUSED': 0})
        self.assertTrue(records[1]['functionsComplete'])
        self.assertTrue(records[1]['runsPageExhausted'])
        for call in request.call_args_list:
            headers = call.kwargs.get('headers') or call.args[4]
            self.assertEqual(headers, {'X-Inngest-Env': inv.INNGEST_ENV})

    def test_deno_link_rejects_foreign_host_path_auth_and_query(self):
        path = inv.DENO_REVISION_PATH
        self.assertEqual(inv.deno_next('<' + path + '?cursor=abc&limit=40>; rel="next"'),
                         {'cursor': 'abc', 'limit': '40'})
        for url in ('https://evil.example' + path + '?cursor=x',
                    'https://user@api.deno.com' + path + '?cursor=x',
                    'http://api.deno.com' + path + '?cursor=x',
                    'https://api.deno.com/v2/apps/other/revisions?cursor=x',
                    path + '?cursor=x&token=private',
                    path + '?cursor=x&cursor=y',
                    path + '?cursor=',
                    path + '?cursor=x#fragment'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                inv.deno_next('<' + url + '>; rel="next"')

    def test_deno_multiple_pages_complete_and_page_cap_partial(self):
        first = [{'id': 'rev1', 'status': 'succeeded', 'deleted_at': None}]
        second = [{'id': 'rev2', 'status': 'failed', 'deleted_at': '2026-01-01T00:00:00Z'}]
        timeline = ([{'slug': 'production', 'domains': [{'domain': inv.DENO_HOST}]}], '')
        next_link = '<' + inv.DENO_REVISION_PATH + '?cursor=next&limit=40>; rel="next"'
        for final_link, expected_complete in (('', True), ('<' + inv.DENO_REVISION_PATH + '?cursor=third>; rel="next"', False)):
            responses = [(first, next_link), (second, final_link), timeline, timeline]
            with self.subTest(complete=expected_complete), patch.dict(os.environ, {'DENO_DEPLOY_TOKEN': 'synthetic'}, clear=True), \
                 patch.object(inv, 'DENO_PAGE_BUDGET', 2), \
                 patch.object(inv, 'request', side_effect=responses) as request, \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                if expected_complete:
                    inv.deno()
                else:
                    with self.assertRaisesRegex(ValueError, 'DENO_PARTIAL'):
                        inv.deno()
                result = json.loads(output.getvalue())
                self.assertEqual(result['revisionsComplete'], expected_complete)
                self.assertEqual(result['revisionDetailsComplete'], expected_complete)
                self.assertTrue(result['listedRevisionDetailsComplete'])
                self.assertEqual([r['deletionState'] for r in result['revisions']], ['ACTIVE', 'DELETED'])
                self.assertEqual(request.call_count, 4)

    def test_deno_lists_all_pages_before_selective_timeline_inspection(self):
        pages = []
        for page_index in range(3):
            rows = [{'id': f'rev{page_index * 40 + i}', 'status': 'succeeded',
                     'deleted_at': None if i == 0 else '2026-01-01T00:00:00Z'} for i in range(40)]
            link = ('<' + inv.DENO_REVISION_PATH + f'?cursor=c{page_index}&limit=40>; rel="next"'
                    if page_index < 2 else '')
            pages.append((rows, link))
        timeline = ([{'slug': 'production', 'domains': [{'domain': inv.DENO_HOST}]}], '')
        with patch.object(inv, 'DENO_TIMELINE_BUDGET', 80), \
             patch.dict(os.environ, {'DENO_DEPLOY_TOKEN': 'synthetic'}, clear=True), \
             patch.object(inv, 'request', side_effect=pages + [timeline] * 80) as request, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaisesRegex(ValueError, 'DENO_PARTIAL'):
                inv.deno()
        result = json.loads(output.getvalue())
        self.assertTrue(result['revisionListExhausted'])
        self.assertFalse(result['revisionDetailsComplete'])
        self.assertFalse(result['revisionsComplete'])
        self.assertEqual(result['revisionsListed'], 120)
        self.assertEqual(result['timelinesInspected'], 80)
        self.assertEqual(result['timelineError'], 'DENO_TIMELINE_LIMIT')
        self.assertIsNone(result['revisions'][-1]['timelines'])
        self.assertEqual([c.args[1] for c in request.call_args_list[:3]], [inv.DENO_REVISION_PATH] * 3)
        self.assertEqual([c.args[1].split('/')[3] for c in request.call_args_list[3:6]], ['rev0', 'rev40', 'rev80'])

    def test_deno_timeline_requires_listed_revision(self):
        inv.DENO_REVISION_IDS.clear()
        with self.assertRaisesRegex(ValueError, 'ENDPOINT_NOT_ALLOWED'):
            inv.request('api.deno.com', '/v2/revisions/foreign/timelines', 'synthetic')

    def test_deno_current_revision_volume_fits_bounded_detail_budget(self):
        rows = [{'id': f'rev{i}', 'status': 'succeeded', 'deleted_at': None} for i in range(107)]
        pages = [(rows[:40], '<' + inv.DENO_REVISION_PATH + '?cursor=a&limit=40>; rel="next"'),
                 (rows[40:80], '<' + inv.DENO_REVISION_PATH + '?cursor=b&limit=40>; rel="next"'),
                 (rows[80:], '')]
        timeline = ([{'slug': 'production', 'domains': [{'domain': inv.DENO_HOST}]}], '')
        with patch.dict(os.environ, {'DENO_DEPLOY_TOKEN': 'synthetic'}, clear=True), \
             patch.object(inv, 'request', side_effect=pages + [timeline] * 107) as request, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            inv.deno()
        result = json.loads(output.getvalue())
        self.assertTrue(result['revisionsComplete'])
        self.assertEqual(result['timelinesInspected'], 107)
        self.assertEqual(request.call_count, 110)

    def test_no_redirect_no_error_body_and_get_only(self):
        handler = inv.NoRedirect()
        self.assertIsNone(handler.redirect_request(None, None, 302, '', {}, 'https://evil.example'))
        error = HTTPError('https://example', 302, 'secret error', {}, io.BytesIO(b'secret response'))
        with patch.object(inv, 'build_opener') as opener, contextlib.redirect_stderr(io.StringIO()) as stderr:
            opener.return_value.open.side_effect = error
            with self.assertRaisesRegex(ValueError, 'HTTP_302') as raised:
                inv.request('api.deno.com', inv.DENO_REVISION_PATH, 'synthetic')
            sent = opener.return_value.open.call_args.args[0]
            self.assertEqual(sent.get_method(), 'GET')
            self.assertEqual(sent.full_url, 'https://api.deno.com' + inv.DENO_REVISION_PATH)
            self.assertNotIn('secret', str(raised.exception) + stderr.getvalue())

    def test_google_structured_403_reason_is_allowlisted_and_redacted(self):
        def denied(reason, body_override=None):
            body = body_override if body_override is not None else json.dumps({'error': {
                'code': 403, 'message': 'secret-message', 'details': [
                    {'@type': 'type.googleapis.com/google.rpc.ErrorInfo', 'reason': reason,
                     'metadata': {'principal': 'secret-principal'}}]}}).encode()
            return HTTPError('https://example', 403, 'secret-message', {}, io.BytesIO(body))
        for reason, expected in [('SERVICE_DISABLED', 'SERVICE_DISABLED'),
                                 ('IAM_PERMISSION_DENIED', 'IAM_PERMISSION_DENIED'),
                                 ('secret-reason', 'UNKNOWN')]:
            with self.subTest(reason=reason), patch.object(inv, 'build_opener') as opener:
                opener.return_value.open.side_effect = denied(reason)
                with self.assertRaises(inv.GoogleForbidden) as raised:
                    inv.request('cloudscheduler.googleapis.com', '/v1/' + inv.REGION + '/jobs', 'synthetic')
                self.assertEqual(raised.exception.reason, expected)
                self.assertEqual(str(raised.exception), 'HTTP_403')
                self.assertNotIn('secret', str(raised.exception) + raised.exception.reason)
        for body in (b'not json', b'x' * 65537, b'{"error":{"code":403,"details":[{"reason":"SERVICE_DISABLED"}]}}'):
            with patch.object(inv, 'build_opener') as opener:
                opener.return_value.open.side_effect = denied(None, body)
                with self.assertRaises(inv.GoogleForbidden) as raised:
                    inv.request('cloudtasks.googleapis.com', '/v2/' + inv.REGION + '/queues', 'synthetic')
                self.assertEqual(raised.exception.reason, 'UNKNOWN')

    def test_google_regional_emits_only_sanitized_structured_reason(self):
        replies = [({}, ''), inv.GoogleForbidden('SERVICE_DISABLED'),
                   inv.GoogleForbidden('IAM_PERMISSION_DENIED'), inv.GoogleForbidden('secret-reason')]
        with patch.object(inv, 'request', side_effect=replies), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertFalse(inv.google_regional('synthetic'))
        records = [json.loads(x) for x in output.getvalue().splitlines()]
        self.assertEqual([row['reason'] for row in records[1:4]],
                         ['SERVICE_DISABLED', 'IAM_PERMISSION_DENIED', 'UNKNOWN'])
        self.assertNotIn('secret', output.getvalue())

    def test_google_field_masks_exclude_sensitive_fields(self):
        for _, (_, path, _, fields) in inv.GOOGLE_COLLECTIONS.items():
            self.assertIn(inv.REGION, path)
            for forbidden in ('template', 'container', 'headers', 'oauth', 'oidc', 'body',
                              'queryOverride', 'pathOverride', 'payload'):
                self.assertNotIn(forbidden.lower(), fields.lower())
        self.assertNotIn('template', inv.EXECUTION_FIELDS)

    def test_google_pagination_scope_classification_and_redaction(self):
        job = inv.REGION + '/jobs/stage-task'
        unknown = inv.REGION + '/jobs/production-looking-name'
        responses = [
            ({'jobs': [{'name': job, 'labels': {'env': 'staging', 'secret': 'hidden'}},
                       {'name': unknown}]}, ''),
            ({'jobs': [{'name': inv.REGION + '/jobs/cron', 'state': 'ENABLED',
                        'httpTarget': {'uri': 'https://u:pass@example.com/path?key=secret'}}]}, ''),
            ({'triggers': []}, ''), ({'queues': []}, ''),
            ({'executions': [{'name': job + '/executions/run1', 'runningCount': 1}]}, '')]
        with patch.object(inv, 'request', side_effect=responses) as request, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertFalse(inv.google_regional('synthetic'))
        records = [json.loads(x) for x in output.getvalue().splitlines()]
        self.assertEqual([x['classification'] for x in records[0]['resources']], ['STAGING', 'UNCLASSIFIED'])
        self.assertEqual(records[1]['resources'][0]['targetOrigin'], 'https://example.com')
        self.assertEqual(records[-1]['unclassifiedRunJobs'], 1)
        self.assertEqual(request.call_count, 5)
        self.assertEqual(request.call_args.args[1], '/v2/' + job + '/executions')
        for secret in ('hidden', 'pass', 'secret', 'synthetic'):
            self.assertNotIn(secret, output.getvalue())
        self.assertEqual(inv.classification({'env': 'production'}, 'https://' + inv.DENO_HOST), 'UNCLASSIFIED')

    def test_google_partial_denials_and_documented_empty_page(self):
        replies = [ValueError('HTTP_403'), ({}, ''), ({'triggers': [], 'unreachable': ['x']}, ''), ({}, '')]
        with patch.object(inv, 'request', side_effect=replies), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertFalse(inv.google_regional('synthetic'))
        records = [json.loads(x) for x in output.getvalue().splitlines()]
        self.assertEqual(records[0]['error'], 'HTTP_403')
        self.assertTrue(records[1]['complete'])
        self.assertEqual(records[2]['error'], 'GOOGLE_UNREACHABLE')
        self.assertTrue(records[3]['complete'])

    def test_google_follow_token_and_fail_bounded(self):
        host, path, key, fields = inv.GOOGLE_COLLECTIONS['runJobs']
        with patch.object(inv, 'request', side_effect=[
            ({'jobs': [], 'nextPageToken': 'a'}, ''), ({'jobs': [], 'nextPageToken': 'b'}, '')]) as request:
            rows, complete = inv.google_list(host, path, key, fields, 'synthetic')
        self.assertFalse(complete)
        self.assertEqual(request.call_args.args[3]['pageToken'], 'a')
        self.assertEqual(rows, [])


    def test_foreign_deno_next_never_receives_authorization(self):
        bad_link = '<https://evil.example' + inv.DENO_REVISION_PATH + '?cursor=x>; rel="next"'
        responses = [([{'id': 'rev1', 'status': 'succeeded'}], bad_link),
                     ([{'slug': 'production', 'domains': [{'domain': inv.DENO_HOST}]}], '')]
        with patch.dict(os.environ, {'DENO_DEPLOY_TOKEN': 'synthetic'}, clear=True), \
             patch.object(inv, 'request', side_effect=responses) as request, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaisesRegex(ValueError, 'DENO_PARTIAL'):
                inv.deno()
        self.assertEqual(request.call_count, 2)
        self.assertTrue(all(call.args[0] == 'api.deno.com' for call in request.call_args_list))
        self.assertNotIn('evil.example', output.getvalue())
        self.assertNotIn('synthetic', output.getvalue())

    def test_google_wrong_project_not_emitted_and_404_is_partial(self):
        responses = [
            ({'jobs': [{'name': 'projects/other/locations/asia-east1/jobs/staging',
                        'labels': {'env': 'staging'}}]}, ''),
            ValueError('HTTP_404'), ({}, ''), ({}, '')]
        with patch.object(inv, 'request', side_effect=responses) as request, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertFalse(inv.google_regional('synthetic'))
        self.assertEqual(request.call_count, 4)
        self.assertNotIn('projects/other', output.getvalue())
        self.assertIn('HTTP_404', output.getvalue())
        self.assertIn('GOOGLE_RESOURCE_MISMATCH', output.getvalue())

    def test_unknown_google_response_is_not_treated_as_empty(self):
        host, path, key, fields = inv.GOOGLE_COLLECTIONS['runJobs']
        with patch.object(inv, 'request', return_value=({'unexpected': 'private'}, '')):
            with self.assertRaisesRegex(ValueError, 'GOOGLE_BAD_RESPONSE'):
                inv.google_list(host, path, key, fields, 'synthetic')

    def test_workflow_is_branch_and_paths_guarded_without_dispatch(self):
        workflow = Path(__file__).parents[1] / 'workflows/pr333-staging-inventory.yml'
        content = workflow.read_text()
        self.assertIn('deployment: false', content)
        self.assertIn("github.event_name == 'push'", content)
        self.assertIn("github.repository == 'soezyxstt/zyxacademy'", content)
        self.assertIn("refs/heads/soezyxst/plan-student-achievements-social", content)
        self.assertIn('timeout-minutes: 5', content)
        self.assertIn('contents: read', content)
        self.assertNotIn('workflow_dispatch', content)


if __name__ == '__main__':
    unittest.main()
