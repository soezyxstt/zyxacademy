#!/usr/bin/env python3
"""Bounded, staging-only control-plane inventory candidate. Review before use."""
import json
import os
import re
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

PROJECT = 'zyx-academy'
SERVICE = 'projects/zyx-academy/locations/asia-east1/services/zyx-academy'
INNGEST_ENV = 'staging-40f1da25'
INNGEST_APP = 'zyx-academy'
DENO_APP = 'zyx-background-staging'
DENO_HOST = 'zyx-background-staging.soezyxst.deno.net'
TIMEOUT = 4
SAFE = re.compile(r'^[A-Za-z0-9_.:/@-]{1,256}$')
HOST = re.compile(r'^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def safe(value):
    return value if isinstance(value, str) and SAFE.fullmatch(value) else None


def origin(value):
    if not isinstance(value, str):
        return None
    try:
        u = urlsplit(value if '://' in value else 'https://' + value)
        host = u.hostname
        if u.scheme != 'https' or not host or not HOST.fullmatch(host) or u.port not in (None, 443):
            return None
        return 'https://' + host
    except ValueError:
        return None


def request(host, path, token, params=None, headers=None):
    allowed = {
        'run.googleapis.com': ('/v2/' + SERVICE, '/v2/' + SERVICE + '/revisions', '/v2/' + SERVICE + ':getIamPolicy'),
        'api.inngest.com': ('/v2/envs', '/v2/apps/' + INNGEST_APP, '/v2/apps/' + INNGEST_APP + '/functions', '/v2/runs'),
        'api.deno.com': ('/v2/apps/' + DENO_APP + '/revisions',),
    }
    deno_timeline = host == 'api.deno.com' and re.fullmatch(r'/v2/revisions/[A-Za-z0-9_-]{1,128}/timelines', path)
    if path not in allowed.get(host, ()) and not deno_timeline:
        raise ValueError('ENDPOINT_NOT_ALLOWED')
    url = 'https://' + host + path
    if params:
        url += '?' + urlencode(params, doseq=True)
    req = Request(url, method='GET', headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json', **(headers or {})})
    try:
        with build_opener(NoRedirect).open(req, timeout=TIMEOUT) as response:
            if response.status != 200:
                raise ValueError('UNEXPECTED_HTTP_STATUS')
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                raise ValueError('RESPONSE_LIMIT')
            return json.loads(body), response.headers.get('Link', '')
    except HTTPError as exc:
        raise ValueError('HTTP_' + str(exc.code)) from None
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        raise ValueError('NETWORK_OR_RESPONSE_ERROR') from None


def emit(section, data):
    text = json.dumps({'inventory': section, **data}, separators=(',', ':'), ensure_ascii=True)
    print(text)
    # The only emitted file is the GitHub step summary, containing the same sanitized JSON.
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as out:
            out.write('```json\n' + text + '\n```\n')


def key_guard():
    try:
        key = json.loads(os.environ.get('GCP_SERVICE_ACCOUNT_KEY', ''))
        # Read identity metadata only. Do not print or inspect private-key contents.
        email = key.get('client_email') if isinstance(key, dict) else None
        if (not isinstance(key, dict) or key.get('type') != 'service_account'
                or key.get('project_id') != PROJECT or not isinstance(email, str)
                or not re.fullmatch(r'[a-z0-9][a-z0-9-]*@zyx-academy\.iam\.gserviceaccount\.com', email)):
            raise ValueError('IDENTITY_MISMATCH')
    except (ValueError, TypeError):
        raise ValueError('GOOGLE_IDENTITY_GUARD_FAILED') from None
    emit('google_identity_guard', {'project': PROJECT, 'result': 'matched'})


def google():
    config = subprocess.run(['gcloud', 'config', 'get-value', 'project', '--quiet'], capture_output=True, text=True, timeout=8, check=False)
    if config.returncode or config.stdout.strip() != PROJECT:
        raise ValueError('GOOGLE_CONFIG_PROJECT_MISMATCH')
    auth = subprocess.run(['gcloud', 'auth', 'print-access-token', '--quiet'], capture_output=True, text=True, timeout=8, check=False)
    if auth.returncode or not auth.stdout.strip():
        raise ValueError('GOOGLE_AUTH_UNAVAILABLE')
    token = auth.stdout.strip()
    fields = 'name,uid,generation,observedGeneration,uri,urls,traffic,trafficStatuses,scaling,latestReadyRevision,latestCreatedRevision,reconciling,ingress,invokerIamDisabled,defaultUriDisabled'
    service, _ = request('run.googleapis.com', '/v2/' + SERVICE, token, {'fields': fields})
    if service.get('name') != SERVICE:
        raise ValueError('GOOGLE_SERVICE_MISMATCH')
    def traffic(items):
        return [{'revision': safe(x.get('revision')), 'tag': safe(x.get('tag')),
                 'percent': x.get('percent') if isinstance(x.get('percent'), int) else None,
                 'type': safe(x.get('type')), 'origin': origin(x.get('uri'))}
                for x in items if isinstance(x, dict)]
    scaling = service.get('scaling') or {}
    results = {
        'project': PROJECT, 'service': SERVICE, 'uid': safe(service.get('uid')),
        'generation': safe(service.get('generation')), 'observedGeneration': safe(service.get('observedGeneration')),
        'origins': sorted({x for x in [origin(service.get('uri')), *[origin(y) for y in service.get('urls', [])]] if x}),
        'latestReadyRevision': safe(service.get('latestReadyRevision')),
        'latestCreatedRevision': safe(service.get('latestCreatedRevision')),
        'reconciling': service.get('reconciling'), 'ingress': safe(service.get('ingress')),
        'invokerIamDisabled': service.get('invokerIamDisabled'), 'defaultUriDisabled': service.get('defaultUriDisabled'),
        'scaling': {k: scaling.get(k) for k in ('scalingMode', 'manualInstanceCount', 'minInstanceCount', 'maxInstanceCount')},
        'traffic': traffic(service.get('traffic', [])), 'trafficStatuses': traffic(service.get('trafficStatuses', [])),
    }
    try:
        revs, _ = request('run.googleapis.com', '/v2/' + SERVICE + '/revisions', token,
                          {'pageSize': 100, 'fields': 'revisions(name,uid,generation,scaling,scalingStatus),nextPageToken'})
        results['revisions'] = [{'name': safe(x.get('name')), 'uid': safe(x.get('uid')),
                                 'generation': safe(x.get('generation')),
                                 'scaling': {k: (x.get('scaling') or {}).get(k) for k in ('minInstanceCount', 'maxInstanceCount')},
                                 'scalingStatus': {k: (x.get('scalingStatus') or {}).get(k) for k in ('desiredMinInstanceCount',)}}
                                for x in revs.get('revisions', []) if isinstance(x, dict)]
        results['revisionsComplete'] = not bool(revs.get('nextPageToken'))
    except ValueError as exc:
        results['revisionsError'] = str(exc)
        results['revisionsComplete'] = False
    try:
        iam, _ = request('run.googleapis.com', '/v2/' + SERVICE + ':getIamPolicy', token,
                         {'fields': 'bindings(role,members,condition)'})
        # Do not print human identities or service-account email addresses.
        bindings = []
        for x in iam.get('bindings', []):
            members = x.get('members', [])
            bindings.append({'role': safe(x.get('role')), 'conditional': bool(x.get('condition')),
                             'public': 'allUsers' in members, 'authenticatedPublic': 'allAuthenticatedUsers' in members,
                             'stagingServiceAccounts': sum(isinstance(m, str) and m.startswith('serviceAccount:') and m.endswith('@zyx-academy.iam.gserviceaccount.com') for m in members),
                             'otherPrincipals': sum(isinstance(m, str) and m not in ('allUsers', 'allAuthenticatedUsers') and not (m.startswith('serviceAccount:') and m.endswith('@zyx-academy.iam.gserviceaccount.com')) for m in members)})
        results['serviceIamBindings'] = bindings
        results['serviceIamInheritedPoliciesIncluded'] = False
    except ValueError as exc:
        results['iamError'] = str(exc)
    results['otherRegionalResources'] = 'not_queried_scope_unverified'
    emit('google', results)
    if not results['revisionsComplete'] or 'iamError' in results:
        raise ValueError('GOOGLE_PARTIAL')


def pages(path, token, params, headers, max_pages=3):
    rows = []
    cursor = None
    for _ in range(max_pages):
        query = dict(params)
        if cursor:
            query['cursor'] = cursor
        payload, _ = request('api.inngest.com', path, token, query, headers)
        if not isinstance(payload.get('data'), list):
            raise ValueError('INNGEST_BAD_RESPONSE')
        rows.extend(payload['data'])
        page = payload.get('page')
        if not isinstance(page, dict) or not isinstance(page.get('hasMore'), bool):
            raise ValueError('INNGEST_PAGINATION_UNKNOWN')
        if not page.get('hasMore'):
            return rows, True
        cursor = page.get('cursor')
        if not isinstance(cursor, str) or not cursor or len(cursor) > 1024:
            raise ValueError('INNGEST_BAD_CURSOR')
    return rows, False


def inngest():
    token = os.environ.get('INNGEST_SIGNING_KEY', '')
    if not token:
        raise ValueError('INNGEST_CREDENTIAL_UNAVAILABLE')
    headers = {'X-Inngest-Env': INNGEST_ENV}
    environments, complete = pages('/v2/envs', token, {'limit': 250}, headers)
    if not complete or len(environments) != 1 or environments[0].get('id') != INNGEST_ENV:
        raise ValueError('INNGEST_ENVIRONMENT_MISMATCH')
    app, _ = request('api.inngest.com', '/v2/apps/' + INNGEST_APP, token, headers=headers)
    app = app.get('data') or {}
    if app.get('id') != INNGEST_APP:
        raise ValueError('INNGEST_APP_MISMATCH')
    funcs, functions_complete = pages('/v2/apps/' + INNGEST_APP + '/functions', token, {'limit': 100}, headers)
    runs, runs_complete = pages('/v2/runs', token, {'limit': 100, 'appId': INNGEST_APP,
                                'status': ['RUNNING', 'QUEUED', 'PAUSED']}, headers)
    for row in funcs:
        if (row.get('app') or {}).get('id') != INNGEST_APP:
            raise ValueError('INNGEST_FUNCTION_SCOPE_MISMATCH')
    for row in runs:
        if (row.get('app') or {}).get('id') != INNGEST_APP or row.get('status') not in ('RUNNING', 'QUEUED', 'PAUSED'):
            raise ValueError('INNGEST_RUN_SCOPE_MISMATCH')
    emit('inngest', {
        'environment': INNGEST_ENV, 'app': INNGEST_APP, 'archived': app.get('isArchived'),
        'latestSyncOrigin': origin((app.get('latestSync') or {}).get('url')),
        'functionCount': app.get('functionCount'),
        'functions': [{'id': safe(x.get('id')), 'slug': safe(x.get('slug')),
                       'paused': x.get('isPaused'), 'archived': x.get('isArchived'),
                       'triggerTypes': [safe(t.get('type')) for t in x.get('triggers', []) if isinstance(t, dict)]}
                      for x in funcs if isinstance(x, dict)],
        'functionsComplete': functions_complete,
        'runs': [{'id': safe(x.get('id')), 'status': safe(x.get('status')),
                  'functionId': safe((x.get('function') or {}).get('id')),
                  'queuedAt': safe(x.get('queuedAt')), 'startedAt': safe(x.get('startedAt')),
                  'isDeferred': x.get('isDeferred')} for x in runs if isinstance(x, dict)],
        'runsPageExhausted': runs_complete, 'runTimeRange': 'api_default_unspecified',
        'queuedSteps': 'not_available_from_run_list',
    })
    if not functions_complete or not runs_complete:
        raise ValueError('INNGEST_PARTIAL')


def deno():
    token = os.environ.get('DENO_DEPLOY_TOKEN', '')
    if not token:
        raise ValueError('DENO_CREDENTIAL_UNAVAILABLE')
    # List endpoints contain no environment variable values per Deno v2 OpenAPI.
    revisions, link = request('api.deno.com', '/v2/apps/' + DENO_APP + '/revisions', token, {'limit': 20})
    if not isinstance(revisions, list) or len(revisions) > 20:
        raise ValueError('DENO_BAD_RESPONSE')
    output = []
    matched = False
    for r in revisions:
        rev = safe(r.get('id')) if isinstance(r, dict) else None
        if not rev or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', rev):
            raise ValueError('DENO_BAD_REVISION_ID')
        timelines, _ = request('api.deno.com', '/v2/revisions/' + rev + '/timelines', token)
        if not isinstance(timelines, list):
            raise ValueError('DENO_BAD_TIMELINES')
        timeline_rows = []
        for t in timelines:
            hosts = sorted({origin(d.get('domain')) for d in t.get('domains', []) if isinstance(d, dict)} - {None})
            matched = matched or 'https://' + DENO_HOST in hosts
            timeline_rows.append({'slug': safe(t.get('slug')), 'origins': hosts})
        output.append({'id': rev, 'status': safe(r.get('status')), 'createdAt': safe(r.get('created_at')),
                       'deletedAt': safe(r.get('deleted_at')), 'timelines': timeline_rows})
    if not matched:
        raise ValueError('DENO_ORGANIZATION_HOST_UNVERIFIED')
    complete = not bool(link and 'rel="next"' in link)
    emit('deno', {'expectedHost': DENO_HOST, 'app': DENO_APP, 'revisions': output,
                  'revisionsComplete': complete, 'cronAndExecutions': 'not_exposed_by_documented_endpoints'})
    if not complete:
        raise ValueError('DENO_PARTIAL')


def main():
    commands = {'google-key-guard': key_guard, 'google': google, 'inngest': inngest, 'deno': deno}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        raise ValueError('INVALID_COMMAND')
    commands[sys.argv[1]]()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        code = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r'[A-Z0-9_]{1,64}', str(exc)) else 'INVENTORY_FAILED'
        print(json.dumps({'inventoryError': code}), file=sys.stderr)
        sys.exit(1)
