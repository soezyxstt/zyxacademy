#!/usr/bin/env python3
"""Bounded, staging-only control-plane inventory candidate. Review before use."""
import json
import os
import re
import signal
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

PROJECT = 'zyx-academy'
SERVICE = 'projects/zyx-academy/locations/asia-east1/services/zyx-academy'
INNGEST_ENV = 'staging-40f1da25'
INNGEST_APP = 'zyx-academy'
DENO_APP = 'zyx-background-staging'
DENO_HOST = 'zyx-background-staging.soezyxst.deno.net'
REGION = 'projects/zyx-academy/locations/asia-east1'
DENO_REVISION_PATH = '/v2/apps/' + DENO_APP + '/revisions'
DENO_REVISION_IDS = set()
GOOGLE_STAGING_JOBS = set()
TIMEOUT = 4
SAFE = re.compile(r'^[A-Za-z0-9_.:/@-]{1,256}$')
HOST = re.compile(r'^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class BudgetExceeded(Exception):
    pass


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
        'api.deno.com': (DENO_REVISION_PATH,),
        'cloudscheduler.googleapis.com': ('/v1/' + REGION + '/jobs',),
        'eventarc.googleapis.com': ('/v1/' + REGION + '/triggers',),
        'cloudtasks.googleapis.com': ('/v2/' + REGION + '/queues',),
    }
    allowed['run.googleapis.com'] += ('/v2/' + REGION + '/jobs',)
    match = re.fullmatch(r'/v2/revisions/([A-Za-z0-9_-]{1,128})/timelines', path)
    deno_timeline = host == 'api.deno.com' and match and match.group(1) in DENO_REVISION_IDS
    google_execution = (host == 'run.googleapis.com' and path.startswith('/v2/')
                        and path.endswith('/executions') and path[4:-11] in GOOGLE_STAGING_JOBS)
    if path not in allowed.get(host, ()) and not deno_timeline and not google_execution:
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
    emit('google', results)
    regional_complete = google_regional(token)
    if not results['revisionsComplete'] or 'iamError' in results or not regional_complete:
        raise ValueError('GOOGLE_PARTIAL')


# Documented Google list methods return nextPageToken. Masks exclude templates,
# request bodies, headers, OAuth details, task payloads and logs.
GOOGLE_COLLECTIONS = {
    'runJobs': ('run.googleapis.com', '/v2/' + REGION + '/jobs', 'jobs',
                'jobs(name,labels,reconciling,executionCount),nextPageToken'),
    'schedulerJobs': ('cloudscheduler.googleapis.com', '/v1/' + REGION + '/jobs', 'jobs',
                      'jobs(name,state,httpTarget(uri)),nextPageToken'),
    'eventarcTriggers': ('eventarc.googleapis.com', '/v1/' + REGION + '/triggers', 'triggers',
                         'triggers(name,labels,destination(cloudRun(service,region),httpEndpoint(uri))),nextPageToken,unreachable'),
    'taskQueues': ('cloudtasks.googleapis.com', '/v2/' + REGION + '/queues', 'queues',
                   'queues(name,state,httpTarget(uriOverride(scheme,host,port))),nextPageToken'),
}
EXECUTION_FIELDS = 'executions(name,runningCount,succeededCount,failedCount,cancelledCount,completionTime),nextPageToken'


def valid_cursor(value):
    return isinstance(value, str) and 0 < len(value) <= 1024 and all(32 < ord(c) < 127 for c in value)


def google_list(host, path, key, fields, token, max_pages=2):
    rows, cursor, seen = [], None, set()
    for _ in range(max_pages):
        params = {'pageSize': 100, 'fields': fields}
        if cursor:
            params['pageToken'] = cursor
        payload, _ = request(host, path, token, params)
        if (not isinstance(payload, dict) or set(payload) - {key, 'nextPageToken', 'unreachable'}
                or not isinstance(payload.get(key, []), list)):
            raise ValueError('GOOGLE_BAD_RESPONSE')
        if payload.get('unreachable'):
            raise ValueError('GOOGLE_UNREACHABLE')
        rows.extend(payload.get(key, []))
        if len(rows) > 200:
            raise ValueError('GOOGLE_RECORD_LIMIT')
        cursor = payload.get('nextPageToken')
        if cursor is None or cursor == '':
            return rows, True
        if not valid_cursor(cursor) or cursor in seen:
            raise ValueError('GOOGLE_BAD_CURSOR')
        seen.add(cursor)
    return rows, False


def classification(labels, target=None, cloud_run=None):
    # A name alone is never evidence. Conflicting explicit labels are unclassified.
    labels = labels if isinstance(labels, dict) else {}
    values = {labels[k].lower() for k in ('environment', 'env')
              if isinstance(labels.get(k), str)}
    if values and values != {'staging'}:
        return 'UNCLASSIFIED'
    if values == {'staging'} or target == 'https://' + DENO_HOST or cloud_run == ('zyx-academy', 'asia-east1'):
        return 'STAGING'
    return 'UNCLASSIFIED'


def google_resource_name(value, collection):
    pattern = re.escape(REGION + '/' + collection + '/') + r'[A-Za-z0-9_-]{1,200}'
    return value if isinstance(value, str) and re.fullmatch(pattern, value) else None


def google_regional(token):
    complete = True
    unclassified_jobs = 0
    GOOGLE_STAGING_JOBS.clear()
    for section, (host, path, key, fields) in GOOGLE_COLLECTIONS.items():
        try:
            rows, exhausted = google_list(host, path, key, fields, token)
            out, staging_jobs = [], set()
            collection = {'runJobs': 'jobs', 'schedulerJobs': 'jobs',
                          'eventarcTriggers': 'triggers', 'taskQueues': 'queues'}[section]
            for item in rows:
                if not isinstance(item, dict):
                    raise ValueError('GOOGLE_BAD_RESPONSE')
                name = google_resource_name(item.get('name'), collection)
                if not name:
                    raise ValueError('GOOGLE_RESOURCE_MISMATCH')
                target, run_target = None, None
                if section == 'schedulerJobs':
                    target = origin((item.get('httpTarget') or {}).get('uri'))
                elif section == 'eventarcTriggers':
                    destination = item.get('destination') or {}
                    target = origin((destination.get('httpEndpoint') or {}).get('uri'))
                    run = destination.get('cloudRun') or {}
                    run_target = (run.get('service'), run.get('region'))
                elif section == 'taskQueues':
                    override = (item.get('httpTarget') or {}).get('uriOverride') or {}
                    if override.get('scheme') == 'HTTPS' and override.get('port') in (None, '443', 443):
                        target = origin(override.get('host'))
                group = classification(item.get('labels'), target, run_target)
                if section == 'runJobs' and group == 'STAGING':
                    staging_jobs.add(name)
                elif section == 'runJobs':
                    unclassified_jobs += 1
                states = ('ENABLED', 'PAUSED', 'DISABLED', 'UPDATE_FAILED', 'RUNNING', 'STATE_UNSPECIFIED')
                out.append({'name': name, 'classification': group,
                            'state': item.get('state') if item.get('state') in states else None,
                            'reconciling': item.get('reconciling') if isinstance(item.get('reconciling'), bool) else None,
                            'targetOrigin': target, 'targetCloudRunService': safe(run_target[0]) if run_target else None,
                            'targetCloudRunRegion': safe(run_target[1]) if run_target else None})
            GOOGLE_STAGING_JOBS.update(staging_jobs)
            emit('google_' + section, {'resources': out, 'complete': exhausted})
            complete = complete and exhausted
        except ValueError as exc:
            emit('google_' + section, {'complete': False, 'error': str(exc)})
            complete = False
    jobs = sorted(GOOGLE_STAGING_JOBS)
    if len(jobs) > 3:
        complete = False
    for job in jobs[:3]:
        try:
            rows, exhausted = google_list('run.googleapis.com', '/v2/' + job + '/executions',
                                          'executions', EXECUTION_FIELDS, token)
            executions = []
            for row in rows:
                name = row.get('name') if isinstance(row, dict) else None
                if not isinstance(name, str) or not re.fullmatch(re.escape(job) + r'/executions/[A-Za-z0-9_-]{1,200}', name):
                    raise ValueError('GOOGLE_RESOURCE_MISMATCH')
                counts = {k: row.get(k) if type(row.get(k)) is int else None
                          for k in ('runningCount', 'succeededCount', 'failedCount', 'cancelledCount')}
                executions.append({'name': name, **counts, 'completionTime': safe(row.get('completionTime'))})
            emit('google_runExecutions', {'job': job, 'executions': executions, 'complete': exhausted})
            complete = complete and exhausted
        except ValueError as exc:
            emit('google_runExecutions', {'job': job, 'complete': False, 'error': str(exc)})
            complete = False
    complete = complete and unclassified_jobs == 0
    emit('google_regional_summary', {'complete': complete, 'stagingJobsFound': len(jobs),
                                    'unclassifiedRunJobs': unclassified_jobs,
                                    'executionJobsInspected': min(len(jobs), 3),
                                    'unclassifiedExecutions': 'not_queried'})
    return complete


def shape_type(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, dict):
        return 'object'
    if isinstance(value, list):
        return 'array'
    if isinstance(value, str):
        return 'string'
    return 'number' if isinstance(value, (int, float)) else 'other'


def inngest_shape(path, payload):
    # Unknown keys may themselves contain sensitive material.
    known = ('data', 'metadata', 'page', 'pagination', 'hasMore', 'cursor', 'limit', 'nextCursor')
    obj = payload if isinstance(payload, dict) else {}
    result = {'endpoint': path, 'type': shape_type(payload),
              'topLevel': {k: shape_type(obj[k]) for k in known if k in obj},
              'unknownTopLevelKeyCount': sum(k not in known for k in obj),
              'dataCount': len(obj['data']) if isinstance(obj.get('data'), list) else None}
    for name in ('page', 'pagination'):
        page = obj.get(name)
        if isinstance(page, dict):
            result[name] = {'keys': {k: shape_type(page[k]) for k in known if k in page},
                            'unknownKeyCount': sum(k not in known for k in page),
                            'hasMore': page.get('hasMore') if type(page.get('hasMore')) is bool else None}
    emit('inngest_shape', result)


def pages(path, token, params, headers, max_pages=3):
    # The v2 spec documents page.hasMore and page.cursor for these lists.
    # Missing pagination is not completion, even on a short page.
    rows, cursor, seen = [], None, set()
    for _ in range(max_pages):
        query = dict(params)
        if cursor:
            query['cursor'] = cursor
        payload, link = request('api.inngest.com', path, token, query, headers)
        if not isinstance(payload, dict) or not isinstance(payload.get('data'), list):
            inngest_shape(path, payload)
            raise ValueError('INNGEST_BAD_RESPONSE')
        if len(payload['data']) > params.get('limit', 100):
            raise ValueError('INNGEST_RECORD_LIMIT')
        page = payload.get('page')
        if not isinstance(page, dict) or type(page.get('hasMore')) is not bool or link:
            inngest_shape(path, payload)
            raise ValueError('INNGEST_PAGINATION_UNKNOWN')
        rows.extend(payload['data'])
        if not page['hasMore']:
            return rows, True
        cursor = page.get('cursor')
        if not valid_cursor(cursor) or cursor in seen:
            raise ValueError('INNGEST_BAD_CURSOR')
        seen.add(cursor)
    return rows, False


def inngest():
    token = os.environ.get('INNGEST_SIGNING_KEY', '')
    if not token:
        raise ValueError('INNGEST_CREDENTIAL_UNAVAILABLE')
    headers = {'X-Inngest-Env': INNGEST_ENV}
    environments, complete = pages('/v2/envs', token, {'limit': 250}, headers)
    if not complete or len(environments) != 1 or not isinstance(environments[0], dict) or environments[0].get('id') != INNGEST_ENV:
        raise ValueError('INNGEST_ENVIRONMENT_MISMATCH')
    app_payload, _ = request('api.inngest.com', '/v2/apps/' + INNGEST_APP, token, headers=headers)
    app = app_payload.get('data') if isinstance(app_payload, dict) else None
    # The documented detail path and response use the user-defined app ID.
    if not isinstance(app, dict) or app.get('id') != INNGEST_APP:
        raise ValueError('INNGEST_APP_MISMATCH')
    funcs, functions_complete = pages('/v2/apps/' + INNGEST_APP + '/functions', token, {'limit': 100}, headers)
    runs, runs_complete = pages('/v2/runs', token, {'limit': 100, 'appId': INNGEST_APP,
                                'status': ['RUNNING', 'QUEUED', 'PAUSED']}, headers)
    statuses = ('RUNNING', 'QUEUED', 'PAUSED')
    for row in funcs:
        if not isinstance(row, dict) or not isinstance(row.get('app'), dict) or row['app'].get('id') != INNGEST_APP:
            raise ValueError('INNGEST_FUNCTION_SCOPE_MISMATCH')
    for row in runs:
        if not isinstance(row, dict) or not isinstance(row.get('app'), dict) or row['app'].get('id') != INNGEST_APP or row.get('status') not in statuses:
            raise ValueError('INNGEST_RUN_SCOPE_MISMATCH')
    emit('inngest', {
        'environment': INNGEST_ENV, 'app': INNGEST_APP,
        'archived': app.get('isArchived') if type(app.get('isArchived')) is bool else None,
        'latestSyncOrigin': origin((app.get('latestSync') or {}).get('url')),
        'functionCount': app.get('functionCount') if type(app.get('functionCount')) is int else None,
        'functions': [{'id': safe(x.get('id')), 'slug': safe(x.get('slug')),
                       'paused': x.get('isPaused') if type(x.get('isPaused')) is bool else None,
                       'archived': x.get('isArchived') if type(x.get('isArchived')) is bool else None,
                       'triggerTypes': [t.get('type') if t.get('type') in ('EVENT', 'CRON') else None
                                        for t in x.get('triggers', []) if isinstance(t, dict)]}
                      for x in funcs],
        'functionsComplete': functions_complete,
        'runs': [{'id': safe(x.get('id')), 'status': x.get('status'),
                  'functionId': safe((x.get('function') or {}).get('id'))} for x in runs],
        'runCounts': {status: sum(x.get('status') == status for x in runs) for status in statuses},
        'runsPageExhausted': runs_complete, 'runTimeRange': 'api_default_unspecified',
        'queuedAndSleepingSteps': 'unknown_not_exposed_by_run_list',
    })
    if not functions_complete or not runs_complete:
        raise ValueError('INNGEST_PARTIAL')


def deno_next(link):
    if not link:
        return None
    if not isinstance(link, str) or len(link) > 4096:
        raise ValueError('DENO_BAD_LINK')
    next_urls = []
    for part in link.split(','):
        match = re.fullmatch(r'\s*<([^<>]+)>\s*;\s*rel="([a-z]+)"\s*', part)
        if not match:
            raise ValueError('DENO_BAD_LINK')
        if match.group(2) == 'next':
            next_urls.append(match.group(1))
    if len(next_urls) > 1:
        raise ValueError('DENO_BAD_LINK')
    if not next_urls:
        return None
    u = urlsplit(urljoin('https://api.deno.com' + DENO_REVISION_PATH, next_urls[0]))
    if (u.scheme != 'https' or u.netloc != 'api.deno.com' or u.path != DENO_REVISION_PATH
            or u.fragment):
        raise ValueError('DENO_FOREIGN_LINK')
    try:
        pairs = parse_qsl(u.query, keep_blank_values=True, strict_parsing=True, max_num_fields=2)
    except ValueError:
        raise ValueError('DENO_BAD_LINK') from None
    params = dict(pairs)
    if (len(params) != len(pairs) or set(params) - {'cursor', 'limit'} or 'cursor' not in params
            or not valid_cursor(params['cursor'])
            or ('limit' in params and (not params['limit'].isdigit() or not 1 <= int(params['limit']) <= 100))):
        raise ValueError('DENO_BAD_LINK')
    return params


def deno():
    token = os.environ.get('DENO_DEPLOY_TOKEN', '')
    if not token:
        raise ValueError('DENO_CREDENTIAL_UNAVAILABLE')
    DENO_REVISION_IDS.clear()
    revisions, params, seen, exhausted = [], {'limit': 40}, set(), False
    problem = None
    # Two pages, 80 revisions and 80 timeline requests at most.
    deadline = time.monotonic() + 95
    for _ in range(2):
        if time.monotonic() >= deadline:
            problem = 'DENO_TIME_LIMIT'
            break
        try:
            page, link = request('api.deno.com', DENO_REVISION_PATH, token, params)
            if not isinstance(page, list) or len(page) > 40:
                raise ValueError('DENO_BAD_RESPONSE')
            for r in page:
                rev = r.get('id') if isinstance(r, dict) else None
                if not isinstance(rev, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', rev) or rev in DENO_REVISION_IDS:
                    raise ValueError('DENO_BAD_REVISION_ID')
                DENO_REVISION_IDS.add(rev)
            revisions.extend(page)
            params = deno_next(link)
            if params is None:
                exhausted = True
                break
            cursor = params['cursor']
            if cursor in seen:
                raise ValueError('DENO_BAD_LINK')
            seen.add(cursor)
            if 'limit' in params and int(params['limit']) > 40:
                raise ValueError('DENO_PAGE_LIMIT')
            params.setdefault('limit', 40)
        except ValueError as exc:
            problem = str(exc)
            break
    output, matched = [], False
    for r in revisions:
        if time.monotonic() >= deadline:
            problem = 'DENO_TIME_LIMIT'
            break
        try:
            timelines, link = request('api.deno.com', '/v2/revisions/' + r['id'] + '/timelines', token)
            if not isinstance(timelines, list) or link:
                raise ValueError('DENO_BAD_TIMELINES')
            timeline_rows = []
            for t in timelines:
                if not isinstance(t, dict) or not isinstance(t.get('domains'), list):
                    raise ValueError('DENO_BAD_TIMELINES')
                hosts = sorted({origin(d.get('domain')) for d in t['domains'] if isinstance(d, dict)} - {None})
                matched = matched or 'https://' + DENO_HOST in hosts
                timeline_rows.append({'slug': safe(t.get('slug')), 'origins': hosts})
            deletion = ('ACTIVE' if 'deleted_at' in r and r['deleted_at'] is None else
                        'DELETED' if safe(r.get('deleted_at')) else 'UNKNOWN')
            output.append({'id': r['id'], 'status': r.get('status') if r.get('status') in ('skipped', 'queued', 'building', 'succeeded', 'failed') else None,
                           'createdAt': safe(r.get('created_at')), 'deletedAt': safe(r.get('deleted_at')),
                           'deletionState': deletion,
                           'timelines': timeline_rows})
        except ValueError as exc:
            problem = str(exc)
            break
    if not matched:
        raise ValueError('DENO_ORGANIZATION_HOST_UNVERIFIED')
    complete = exhausted and len(output) == len(revisions) and problem is None
    emit('deno', {'expectedHost': DENO_HOST, 'app': DENO_APP, 'revisions': output,
                  'revisionsComplete': complete, 'revisionListExhausted': exhausted,
                  'revisionsListed': len(revisions), 'timelinesInspected': len(output),
                  'partialReason': problem if problem else (None if complete else 'DENO_PAGE_LIMIT'),
                  'cronAndExecutions': 'unknown_not_exposed_by_documented_endpoints'})
    if not complete:
        raise ValueError('DENO_PARTIAL')


def main():
    commands = {'google-key-guard': key_guard, 'google': google, 'inngest': inngest, 'deno': deno}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        raise ValueError('INVALID_COMMAND')
    # Hard ceilings include slow reads as well as request count bounds.
    budgets = {'google-key-guard': 5, 'google': 65, 'inngest': 35, 'deno': 105}
    def timed_out(_signum, _frame):
        raise BudgetExceeded()
    signal.signal(signal.SIGALRM, timed_out)
    signal.alarm(budgets[sys.argv[1]])
    commands[sys.argv[1]]()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        code = ('INVENTORY_TIME_LIMIT' if isinstance(exc, BudgetExceeded) else
                str(exc) if isinstance(exc, ValueError) and re.fullmatch(r'[A-Z0-9_]{1,64}', str(exc)) else 'INVENTORY_FAILED')
        print(json.dumps({'inventoryError': code}), file=sys.stderr)
        sys.exit(1)
