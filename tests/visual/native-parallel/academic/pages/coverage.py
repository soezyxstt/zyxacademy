"""Regenerate route crosswalk from local source and recorded web and device captures."""
import csv,json,re,pathlib,urllib.parse,subprocess,datetime
from hashlib import sha256
R=pathlib.Path('.');P=R/'tests/visual/native-parallel/academic/pages'
rows=list(csv.DictReader((R/'plans/native-parallel/routes.tsv').open(),delimiter='\t'))
paths=[x['web_source'] for x in rows if x['owner']=='academic']
routes={re.sub(r'/\([^/]+\)','',p.removeprefix('app').removesuffix('/page.tsx')):p for p in paths}
registry=(R/'packages/native-parity/academic/routes.ts').read_text()
family=dict(re.findall(r'\["([^"]+)", "(administration|courses|tutor|assessment)"\]',registry))
assert len(routes)==54 and set(routes)==set(family)
case_js = 'const {academicCases}=require("./packages/native-parity/academic/cases.ts"); process.stdout.write(JSON.stringify(academicCases));'
cases = json.loads(subprocess.check_output(['node','--import','tsx','-e',case_js],text=True))
assert len(cases)==162 and len({x['id'] for x in cases})==162
case_index = {route:{v:next(x for x in cases if x['pattern']==route and x['id'].endswith('-'+v)) for v in ('populated','empty','denied')} for route in routes}

def route_segments(path):
 path = urllib.parse.urlsplit(path).path.strip('/')
 return path.split('/') if path else []

def parameter(segment):
 return segment.startswith('[') and segment.endswith(']')

# Filesystem routing gives a literal segment priority at the first difference.
patterns = [(route, route_segments(route)) for route in routes]
patterns.sort(key=lambda item: [not parameter(segment) for segment in item[1]], reverse=True)

def resolve_route(path):
 segments = route_segments(path)
 for pattern, expected in patterns:
  if len(expected) == len(segments) and all(
   actual == target or (actual and parameter(target)) for target, actual in zip(expected, segments)
  ):
   return pattern
 return None

# Each registered example must resolve to exactly its registered route, including
# static pages that could also match a neighboring dynamic segment.
assert all(resolve_route(case['path']) == case['pattern'] for case in cases)

results=json.loads((P/'results.json').read_text()) if (P/'results.json').exists() else {'entries':[]}
original=json.loads((R/'tests/visual/native-parallel/academic/web/local-routes/manifest.json').read_text())
interactions=json.loads((P/'interactions-results.json').read_text()) if (P/'interactions-results.json').exists() else {'entries':[]}
flows={}
for f in (R/'.maestro/native-parallel/academic').glob('*.yaml'):
 paths=[]
 for link in re.findall(r'(?:openLink:|#\s*fixture:)\s*(\S+)',f.read_text()):
  params=urllib.parse.parse_qs(urllib.parse.urlsplit(link).query);paths+=params.get('path',[])
 for pattern in dict.fromkeys(resolve_route(path) for path in paths):
  if pattern:
   description = ' (synthetic TutorSchedule editor)' if f.name == 'tutor-schedule.yaml' else ''
   flows.setdefault(pattern,[]).append(f.as_posix()+description)

def native(pattern, group):
 if group=='administration':
  end={'/admin/groups':'groups','/admin/notifications':'notifications','/admin/schedules':'schedules','/admin/tutorial-pka/registrations':'registrations','/admin/tutorial-pka/announcements':'announcements'}
  if pattern=='/admin/groups':return ('GET /api/native/academic-administration/groups, group-editor[/id] and groups/[id]/members; POST groups; PATCH groups/[id] and groups/[id]/members', 'Create and edit groups and add or remove regular members; leader changes, token-group membership and deleting an entire group remain web/fixture')
  if pattern=='/admin/users':return ('GET /api/native/academic-administration/users; PATCH users/[id]/status', 'Active Admin can activate or suspend eligible accounts with revision and receipt; role edits remain fixture; live device interaction unverified')
  if pattern=='/admin/tokens':return ('GET /api/native/academic-administration/tokens and token-editor[/id]; POST tokens; PATCH tokens/[id] for revoke', 'Issue and revoke use scoped receipts; broader token management remains fixture')
  if pattern=='/admin/tutorial-pka/schedules':return ('GET /api/native/academic-administration/sessions; PATCH sessions/[id]', 'Edits the title, scheduled time and meeting link with revision and receipt; creating schedules and other operations remain web/fixture')
  if pattern in end:
   add='; PATCH announcement text supported' if pattern.endswith('/announcements') else ''
   return ('GET /api/native/academic-administration/'+end[pattern]+add,'Other edits/broadcasts are fixture; review domain README for partial support')
  if '/review/idea/[bundleId]' in pattern:
   return (
    'GET /api/native/academic-administration/bundle/idea/[slug]/[importId]; GET and PATCH /api/native/academic-administration/bundle/idea/[slug]/[importId]/item/[ideaId]',
    'Admin can read one course-scoped Idea and save their own item decision and note. Full-bundle review, finalization, revisions, publication and artifacts beyond native read limits use the web authoring workflow.',
   )
  if '/review/product/[bundleId]' in pattern:return ('GET /api/native/academic-administration/bundle/product/[slug]/[bundleId]; PDF job/status through bundle routes','Product review and publication fixture; full renderer/download integration pending')
  return ('GET /api/native/academic-administration/alias/... resolves or redirects','Alias destination and selection require screen navigation')
 if group=='courses':
  if pattern=='/admin/courses':return ('GET /api/native/academic/admin/courses','Create course uses fixture')
  if pattern=='/admin/courses/[slug]':return ('GET /api/native/academic/admin/courses/[slug]; POST chapters; PATCH chapters/[chapterId]','Chapter create and edit use revision and receipt; delete and reorder use fixture')
  suffix=pattern.removeprefix('/admin/courses/[slug]/')
  if suffix=='settings':return ('GET and PATCH /api/native/academic/admin/courses/[slug]/settings','Only information fields saved; pricing, demo and archive use fixture')
  if suffix=='documents/[materialId]':return ('GET /api/native/academic/admin/courses/[slug]/documents[/materialId]; PATCH documents/[materialId]/metadata','Title edit for uploaded PDFs only; linked file data, publication, and other metadata stay outside this write')
  return ('GET /api/native/academic/admin/courses/[slug]/'+suffix,'Subsection changes use fixture; content renderer and AI may require web')
 if group=='assessment':
  if pattern=='/tutor/[courseId]/tryouts':return ('Alias to /tutor/[courseId]','No independent tryout route')
  if pattern=='/admin/courses/[slug]/tryouts':return ('GET and POST /api/native/academic-assessment/admin/[slug]/tryouts; PATCH tryouts/[examId]; POST tryouts/[examId]/questions','Draft metadata and bank snapshot import or removal work before submissions; publishing, deleting and direct question edits remain fixture')
  if '/attempts' in pattern:return ('GET /api/native/academic-assessment/tutor/[courseId]/attempts/[quizId]','Attachment/complex renderer dependencies')
  if '/grading' in pattern:return ('GET /api/native/academic-assessment/tutor/[courseId]/grading[/attemptId]; POST grading/[attemptId]','Quiz essay and fill-in grading uses answer revisions; attachment and complex formula renderer dependencies')
  role='tutor' if pattern.startswith('/tutor') else 'admin'; key='[courseId]' if role=='tutor' else '[slug]'
  return (f'GET /api/native/academic-assessment/{role}/{key}/quizzes and preview; POST/PATCH/DELETE /api/quiz/templates[/id]', 'Question-bank mutations use fixture; formula renderer dependency')
 if pattern=='/tutor':return ('GET /api/native/academic/tutor/dashboard','Dashboard fixture for gallery')
 if pattern=='/tutor/[courseId]':return ('GET /api/native/academic/tutor/courses/[courseId]/analytics','Refresh and full web analytics not established')
 if pattern=='/tutor/[courseId]/participants':return ('GET /api/native/academic/tutor/courses/[courseId]/participants','Participant details from read model')
 if pattern=='/tutor/[courseId]/grading':return ('GET /api/native/academic/tutor/courses/[courseId]/grading; POST /api/native/academic/tutor-support/courses/[courseId]/grading/[submissionId]', 'Connected Tutor editor submits final tryout grade and note with revision and receipt; attachments require web; live device interaction unverified')
 if pattern=='/tutor/schedule':return ('GET /api/native/academic/tutor-support/schedule; ConnectedSchedule uses POST schedule/slots and PATCH schedule/slots/[id]', 'Live slot form preserves course restrictions and validates booking history; bookings, tickets and course restriction edits require web; live device interaction unverified')
 if pattern in ('/tutor/discussions','/tutor/[courseId]/discussions'):return ('GET and POST /api/native/academic/tutor-support/[courses/courseId/]discussions','Text replies; attachment, reactions, mentions and Zyra require web')
 if pattern=='/tutor/[courseId]/materials':return ('GET /api/native/academic/tutor-support/courses/[courseId]/materials','Material management and full renderer require web')
 if pattern=='/tutor/[courseId]/videos':return ('GET /api/native/academic/tutor-support/courses/[courseId]/videos; playback URL','Upload/management and cookie-bound playback require web')
 if pattern=='/tutor/[courseId]/live':return ('GET /api/native/academic/tutor-support/courses/[courseId]/live','Realtime hosting and controls require web')
 if pattern in ('/tutor/docs','/tutor/docs/[slug]'):return ('Shared local source packages/academic/docs/tutor','Diagram rendering integration pending')
 raise AssertionError(pattern)

def recorded_route(entry, outcome):
 return resolve_route(outcome.get('landed') or entry['path'])

def page_cases(pattern):
 for entry in results['entries']:
  for case in entry['cases']:
   if recorded_route(entry, case) == pattern:
    yield entry, case

def redirected_entries(pattern):
 for entry in results['entries']:
  if resolve_route(entry['path']) != pattern:
   continue
  for case in entry['cases']:
   landed = case.get('landed')
   if (case.get('pass') or case.get('redirectObserved')) and landed and recorded_route(entry, case) != pattern:
    yield entry, case, landed + case.get('landedQuery', '')
 for entry in original:
  landed = entry.get('landed')
  if resolve_route(entry['path']) == pattern and landed and recorded_route(entry, entry) != pattern:
   yield {'id': entry['key']}, {'theme': 'smoke'}, landed

def references(pattern):
 out=[]
 for e,c in page_cases(pattern):
  if c.get('pass') and c.get('screenshot'):
   p=P/c['screenshot'];assert p.is_file(),p
   out.append(f"{e['id']}:{c['theme']} {p.as_posix()}")
  elif c.get('classification') or c.get('error'):
   evidence=''
   if c.get('screenshot'):
    candidate=P/c['screenshot'];assert candidate.is_file(),candidate;evidence=' '+candidate.as_posix()
   out.append(f"{e['id']}:{c['theme']} {c.get('classification', 'error; see results.json')}{evidence}")
  else:out.append(f"{e['id']}:{c['theme']} failed; see results.json")
 for e in interactions['entries']:
  if recorded_route(e,e) == pattern and e.get('pass'):
   p=P/e['screenshot'];assert p.is_file(),p;out.append(f"{e['id']}:interaction {p.as_posix()}")
 for e in original:
  if recorded_route(e,e) == pattern:
   p=R/'tests/visual/native-parallel/academic/web/local-routes'/f"{e['key']}.png";assert p.is_file();out.append(f"original:{e['key']} {p.as_posix()} (original protected smoke; see its manifest)")
 for entry,case,landed in redirected_entries(pattern):
  out.append(f"{entry['id']}:{case['theme']} redirect to {landed}")
 return '; '.join(out) or 'No protected page capture recorded'

device_reports = []
for device_path in P.parent.glob('device/*/index.json'):
 source = json.loads(device_path.read_text())
 for platform, report in source.get('platforms', {}).items():
  artifact = re.search(r'/artifacts/(\d+)$', report.get('artifactUrl', ''))
  rank = (int(artifact[1]) if artifact else 0, int(source['runId']))
  device_reports.append((rank, platform, device_path, source['revision'], report))

# A queued job can upload its artifact after a newer workflow started.
latest_device_reports = {}
latest_rendered_reports = {}
prior_ios_report = None
for _, platform, device_path, revision, report in sorted(device_reports):
 observation = (device_path, revision, report)
 if platform == 'ios':
  prior_ios_report = latest_device_reports.get(platform)
 latest_device_reports[platform] = observation
 if report.get('routeEvidence') and report.get('routeCaptureCounts', {}).get('captured'):
  latest_rendered_reports[platform] = observation
device_platforms = {}
device_interactions = {}
for platform, (device_path, _, report) in latest_rendered_reports.items():
 route_evidence = report.get('routeEvidence')
 if route_evidence:
  evidence_path = device_path.parent/route_evidence
  evidence = json.loads(evidence_path.read_text())
  device_platforms[platform] = (evidence_path, {case['id']: case['status'] for case in evidence['cases']})
 interaction_evidence = report.get('reviewedInteractionOutcomes')
 if interaction_evidence:
  outcome_path = device_path.parent/interaction_evidence
  for flow in json.loads(outcome_path.read_text()):
   for segment in flow['segments']:
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(segment['fixture']).query)
    pattern = resolve_route(query['path'][0])
    if pattern:
     outcome = segment.get('outcome') or segment['status']
     entry = f"{flow['flow']} segment {segment['segment']} {outcome}"
     device_interactions.setdefault(pattern, []).append((platform, entry, outcome_path))


def device_observation(pattern, markdown=False, platform_filter=None):
 parts=[]
 for platform, name in (('android', 'Android'), ('ios', 'iOS')):
  if platform_filter and platform_filter != platform:
   continue
  if platform not in device_platforms:
   archive = latest_device_reports.get(platform)
   if archive:
    device_path, _, report = archive
    observed = report.get('observation', 'no device captures')
    link = f'../device/{device_path.parent.name}/index.json'
    parts.append(f'[{name}]({link}): {observed}' if markdown else f'{name}: {observed} ({device_path.as_posix()})')
   else:
    parts.append(f'{name}: no archived observation')
   continue
  evidence_path, statuses = device_platforms[platform]
  outcomes = {scenario: statuses.get(case['id'], 'absent') for scenario, case in case_index[pattern].items()}
  states = ', '.join(f'{scenario} {status}' for scenario, status in outcomes.items())
  link = f'../device/{evidence_path.parent.parent.name}/{platform}/{evidence_path.name}'
  parts.append(f'[{name}]({link}): {states}' if markdown else f'{name}: {states} ({evidence_path.as_posix()})')
  latest_path, _, latest_report = latest_device_reports[platform]
  if latest_path != latest_rendered_reports[platform][0]:
   status = latest_report.get('observation', 'latest archived attempt has no stamped route captures')
   parts.append(f'{name}: {status} ({latest_path.as_posix()})' if not markdown else
                f'[{name} latest run](../device/{latest_path.parent.name}/index.json): {status}')
  for source_platform, entry, outcome_path in device_interactions.get(pattern, []):
   if source_platform == platform:
    relative = f'../device/{outcome_path.parent.parent.name}/{platform}/{outcome_path.name}'
    parts.append(f'[Direct fixture entries]({relative}): {entry}' if markdown else f'{entry} ({outcome_path.as_posix()})')
 return '; '.join(parts)

denied_manifest = P/'denied/manifest.json'
denied_entries = {}
if denied_manifest.is_file():
 for entry in json.loads(denied_manifest.read_text())['entries']:
  pattern = entry['pattern']
  assert pattern in routes and pattern not in denied_entries
  assert resolve_route(entry['requestedPath']) == pattern
  denied_entries[pattern] = entry

def verified_denial(entry):
 if not entry or entry['status'] != 'pass' or entry['classification'] not in ('redirected', 'forbidden'):
  return False
 identity = entry.get('identity', {})
 return (identity.get('status') == 200 and identity.get('accountId') == 'academic-student'
  and identity.get('roles') == ['murid'] and entry.get('successfulProtectedReads') == [])

def denied_reference(pattern, markdown=False):
 entry = denied_entries.get(pattern)
 if not entry:
  return 'No Student case recorded'
 if not verified_denial(entry):
  return '[Unverified](denied/manifest.json)' if markdown else f'Unverified ({denied_manifest.as_posix()})'
 label = 'Forbidden'
 if entry['classification'] == 'redirected':
  label = f"Redirected to {entry['landedPath']}"
 screenshot = entry.get('screenshot')
 if not screenshot:
  return f'[{label}](denied/manifest.json)' if markdown else f'{label} ({denied_manifest.as_posix()})'
 image = denied_manifest.parent/screenshot
 assert image.resolve().is_relative_to(denied_manifest.parent.resolve()) and image.is_file(), image
 assert sha256(image.read_bytes()).hexdigest() == entry['screenshotSha256'], image
 return f'[{label}](denied/{screenshot})' if markdown else f'{label} ({image.as_posix()})'

student_audit_path = P/'denied/api-observations.json'
student_audit = json.loads(student_audit_path.read_text()) if student_audit_path.is_file() else {}
audit_entries = {}
for entry in student_audit.get('entries', []):
 pattern = entry['pattern']
 assert pattern in routes and pattern not in audit_entries
 assert entry['id'] == case_index[pattern]['denied']['id']
 assert resolve_route(entry['requestedPath']) == pattern
 audit_entries[pattern] = entry

diagnostic_path = P.parent/'denied-diagnostic/results.json'
denial_diagnostic = json.loads(diagnostic_path.read_text()) if diagnostic_path.is_file() else {}
diagnostic_entries = {}
if denial_diagnostic:
 assert denial_diagnostic['diagnosticOnly'] is True and denial_diagnostic['parityCredit'] is False
 for entry in denial_diagnostic['cases']:
  pattern = entry['pattern']
  assert pattern in routes and pattern not in diagnostic_entries
  assert entry['id'] == case_index[pattern]['denied']['id']
  assert entry['parityCredit'] is False
  web_path = entry['web']['requestedPath']
  android_path = entry['android']['requestedPath']
  assert resolve_route(web_path) == resolve_route(android_path) == pattern
  if entry['comparison']:
   assert web_path == android_path and entry['sameNavigationState'] is False
  diagnostic_entries[pattern] = entry

def audit_reference(pattern, markdown=False):
 entry = audit_entries.get(pattern)
 if not entry:
  return 'No Student request audit recorded'
 status = 'Rechecked' if verified_denial(entry) and entry.get('unexpectedStaffResponses') == [] else 'Unverified'
 pathname = entry['requestedPath']
 return (f'[{status} pathname](denied/api-observations.json) `{pathname}`' if markdown
  else f'{status} pathname {pathname} ({student_audit_path.as_posix()})')

def diagnostic_reference(pattern, markdown=False):
 entry = diagnostic_entries.get(pattern)
 if not entry:
  return 'No Android Student diagnostic recorded'
 web_path = entry['web']['requestedPath']
 android_path = entry['android']['requestedPath']
 if entry['comparison']:
  status = f"{entry['comparison']['differentPixels']:,} pixels differ across denial states"
  paths = f'`{android_path}`' if markdown else android_path
 else:
  status = 'Excluded from pixel measurement'
  paths = f'web `{web_path}`, Android `{android_path}`' if markdown else f'web {web_path}, Android {android_path}'
 return (f'[{status}](../denied-diagnostic/results.json) {paths}' if markdown
  else f'{status} {paths} ({diagnostic_path.as_posix()})')

with (P/'coverage.tsv').open('w',newline='') as f:
 fields=['route','family','case_populated_id','case_empty_id','case_denied_id','web_source','verified_protected_web_cases','verified_student_denied_web_case','student_web_request_audit','native_student_denial_diagnostic','native_live_code_paths','native_fixture_or_dependency','native_implementation_source','native_device_scenarios_planned','native_device_executed_evidence','domain_readme']
 w=csv.DictWriter(f,fieldnames=fields,delimiter='\t',lineterminator='\n');w.writeheader()
 for route,source in routes.items():
  fam=family[route];live,fixture=native(route,fam); readme=f'packages/native-parity/academic/{fam}/README.md';implementation=f'apps/mobile-native/features/academic/{fam}/index.tsx'
  assert (R/source).is_file() and (R/readme).is_file() and (R/implementation).is_file()
  w.writerow(dict(route=route,family=fam,case_populated_id=case_index[route]['populated']['id'],case_empty_id=case_index[route]['empty']['id'],case_denied_id=case_index[route]['denied']['id'],web_source=source,verified_protected_web_cases=references(route),verified_student_denied_web_case=denied_reference(route),student_web_request_audit=audit_reference(route),native_student_denial_diagnostic=diagnostic_reference(route),native_live_code_paths=live,native_fixture_or_dependency=fixture,native_implementation_source=implementation,native_device_scenarios_planned='; '.join(flows.get(route,[])) or 'No direct fixture entry matched; indirect navigation unassessed',native_device_executed_evidence=device_observation(route),domain_readme=readme))
meta={'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'scope':'Web and implementation observations are from a changing local worktree. Device observations refer to the latest published artifact for each platform.','route_count':len(routes),'capture_manifest':'tests/visual/native-parallel/academic/pages/results.json','student_denied_manifest':denied_manifest.as_posix() if denied_manifest.is_file() else None,
 'student_web_request_audit':{'path':student_audit_path.as_posix(),'revision':student_audit['revision']} if student_audit else None,
 'native_student_denial_diagnostic':{'path':diagnostic_path.as_posix(),'android_revision':denial_diagnostic['android']['revision'],'parity_credit':False} if denial_diagnostic else None,'earlier_ios_evidence_index':prior_ios_report[0].as_posix() if prior_ios_report else None,'device_evidence_by_platform':{platform: {'index': path.as_posix(), 'revision': revision,
    **({'capture_index': latest_rendered_reports[platform][0].as_posix()} if platform in latest_rendered_reports else {})}
    for platform, (path, revision, _) in latest_device_reports.items()}}
(P/'coverage-meta.json').write_text(json.dumps(meta,indent=2)+'\n')
print('wrote',len(routes),'route rows; sources and referenced screenshots verified')

# Human-readable per-route links accompany, but do not replace, the TSV and manifests.
from collections import Counter
counts=Counter()
for e in results['entries']:
 for c in e['cases']:
  if c.get('pass'):counts['new_pass']+=1
  elif c.get('notFoundVisible'):counts['missing_ui']+=1
  elif c.get('classification','').startswith('shell-only'):counts['shell_only']+=1
  else:counts['unpassed']+=1
for e in interactions['entries']:
 counts['interaction_pass' if e.get('pass') else 'interaction_unpassed']+=1
device_links = list(latest_device_reports.items())
if prior_ios_report:
 device_links.append(('Earlier iOS', prior_ios_report))
lines=['# Protected web route evidence', '',
 f"Index generated {meta['generated_utc']}; HEAD then was `{meta['head']}` with local uncommitted changes. Captures span a changing worktree and are not attributable to one verified commit.",
 f"Current capture manifest records {counts['new_pass']} passing browser cases, {counts['missing_ui']} unseeded/missing cases with a rendered 404, {counts['shell_only']} shell-only or loading cases, and {counts['unpassed']} other unsuccessful or interrupted cases. Interaction manifest records {counts['interaction_pass']} passing and {counts['interaction_unpassed']} unsuccessful cases. The six earlier protected smoke records are listed separately. Counts are cases, not parity credit.",
 '', '[Route crosswalk and three registry case IDs](coverage.tsv) · [Protected page results](results.json) · [Interaction results](interactions-results.json) · [Original smoke manifest](../web/local-routes/manifest.json)', '',
 'Web links identify passing screenshots, shell-only/loading outcomes, or rendered 404s. Screenshots are listed under the route that rendered them. The requested route records the redirect destination. Initial HTTP 200 with a rendered 404 is identified explicitly. Device route statuses come from stamped captures. Interaction statuses are assigned to direct fixture entries. Live device operations remain unverified.', ' · '.join(f'[{platform_label} evidence index](../device/{path.parent.name}/index.json)' for platform_label, (path, _, _) in device_links), '', '| Route | Screen family | Recorded original protected web cases | Signed-in Student page denial | Student web request audit (pathname only) | Android fixture observations | Android Student denial diagnostic | iOS fixture observations |', '|---|---|---|---|---|---|---|---|']
rendered_routes=[]
redirect_only=[]
for route,source in routes.items():
 links=[]
 rendered=False
 for e,c in page_cases(route):
  if c.get('screenshot') and (c.get('pass') or c.get('notFoundVisible') or c.get('classification','').startswith('shell-only')):
   candidate=P/c['screenshot'];assert candidate.is_file()
   tag=e['id']+' '+c['theme']+(' 404 UI, HTTP '+str(c.get('status')) if c.get('notFoundVisible') else ' shell-only or loading' if c.get('classification','').startswith('shell-only') else '')
   links.append('['+tag+']('+c['screenshot']+')')
   rendered=rendered or bool(c.get('pass'))
 for e in interactions['entries']:
  if recorded_route(e,e) == route and e.get('pass'):
   candidate=P/e['screenshot'];assert candidate.is_file();links.append('['+e['id']+']('+e['screenshot']+')')
   rendered=True
 for e in original:
  if recorded_route(e,e) == route:
   candidate=R/'tests/visual/native-parallel/academic/web/local-routes'/f"{e['key']}.png";assert candidate.is_file()
   links.append('['+e['key']+' smoke](../web/local-routes/'+e['key']+'.png)')
   rendered=True
 redirects=list(redirected_entries(route))
 if rendered:rendered_routes.append(route)
 elif redirects:redirect_only.append(route)
 for entry,case,landed in redirects:
  links.append(f"{entry['id']} {case['theme']} redirected to `{landed}`")
 lines.append('| `'+route+'` | '+family[route]+' | '+('; '.join(links) if links else 'Not captured or no passing screenshot')+' | '+denied_reference(route, markdown=True)+' | '+audit_reference(route, markdown=True)+' | '+device_observation(route, markdown=True, platform_filter='android')+' | '+diagnostic_reference(route, markdown=True)+' | '+device_observation(route, markdown=True, platform_filter='ios')+' |')
unmatched=[route for route in routes if route not in rendered_routes and route not in redirect_only]
lines.extend(['', '## Protected route coverage', '',
 f'Protected screenshots show route content for {len(rendered_routes)} of {len(routes)} routes. '
 f'The report records redirect destinations for {len(redirect_only)} additional routes.',
 '',
 ('Routes with redirect evidence only are ' + ', '.join(f'`{route}`' for route in redirect_only) + '.') if redirect_only else 'All verified redirects also have rendered content.',
 '',
 ('No passing content or redirect evidence was recorded for ' + ', '.join(f'`{route}`' for route in unmatched) + '.') if unmatched else 'Every route has passing content or a verified redirect.',
])
if denied_entries:
 denied_count=sum(bool(verified_denial(entry)) for entry in denied_entries.values())
 lines.extend(['', f'Signed-in Student page denial is verified for {denied_count} of {len(routes)} routes. '
  'The browser observer tracks same-origin 2xx responses only under `/api/admin` and `/api/tutor`. [Student manifest](denied/manifest.json)'])
if student_audit:
 audit_summary = student_audit['summary']
 lines.extend(['', f'A separate signed-in Student audit at `{student_audit["revision"][:8]}` rechecked '
  f'{audit_summary["passed"]} of {len(routes)} routes and recorded {audit_summary["observedRequests"]:,} same-origin requests '
  f'through hydrated page load. The audit retains pathnames and strips query strings. It recorded {audit_summary["unexpectedStaffResponses"]} unexpected staff responses. '
  '[Sanitized request audit](denied/api-observations.json)'])
if denial_diagnostic:
 totals = denial_diagnostic['totals']
 lines.extend(['', f'The Android Student diagnostic compared {totals["compared"]} exact requested-path pairs and '
  f'excluded {totals["excluded"]} with different concrete paths. The browser landed on the public homepage and '
  'Android displayed its in-app denial. These measurements carry zero parity credit. '
  '[Student denial diagnostic](../denied-diagnostic/README.md)'])
(P/'summary.md').write_text('\n'.join(lines)+'\n')
