"""Regenerate route crosswalk from local source and recorded web and device captures."""
import csv,json,re,pathlib,urllib.parse,subprocess,datetime
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
  end={'/admin/groups':'groups','/admin/notifications':'notifications','/admin/schedules':'schedules','/admin/tutorial-pka/registrations':'registrations','/admin/tutorial-pka/announcements':'announcements','/admin/tutorial-pka/schedules':'sessions'}
  if pattern=='/admin/groups':return ('GET /api/native/academic-administration/groups and group-editor[/id]; POST groups; PATCH groups/[id]', 'Group members and deletion require further review; group create/edit client in study-group-client.ts')
  if pattern=='/admin/users':return ('GET /api/native/academic-administration/users; PATCH users/[id]/status', 'Active Admin can activate or suspend eligible accounts with revision and receipt; role edits remain fixture; live device interaction unverified')
  if pattern=='/admin/tokens':return ('GET /api/native/academic-administration/tokens and token-editor[/id]; POST tokens; PATCH tokens/[id] for revoke', 'Issue and revoke use scoped receipts; broader token management remains fixture')
  if pattern in end:
   add='; PATCH announcement text supported' if pattern.endswith('/announcements') else ''
   return ('GET /api/native/academic-administration/'+end[pattern]+add,'Other edits/broadcasts are fixture; review domain README for partial support')
  if '/review/idea/[bundleId]' in pattern:return ('GET /api/native/academic-administration/bundle/idea/[slug]/[bundleId]','Idea review, revisions and publication are fixture')
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
  if pattern=='/admin/courses/[slug]/tryouts':return ('GET and POST /api/native/academic-assessment/admin/[slug]/tryouts; PATCH tryouts/[examId]','Create and edit draft metadata; publication, deletion and question mutations use fixture')
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
   if case.get('pass') and landed and recorded_route(entry, case) != pattern:
    yield entry, case, landed
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

device_indexes = P.parent.glob('device/*/index.json')
device_reports = [(path, json.loads(path.read_text())) for path in device_indexes]
device_path, device_report = max(device_reports, key=lambda item: int(item[1]['runId']), default=(None, {}))
device_platforms = {}
for platform, report in device_report.get('platforms', {}).items():
 route_evidence = report.get('routeEvidence')
 if route_evidence:
  evidence_path = device_path.parent/route_evidence
  evidence = json.loads(evidence_path.read_text())
  device_platforms[platform] = (evidence_path, {case['id']: case['status'] for case in evidence['cases']})

def device_observation(pattern, markdown=False):
 parts=[]
 for platform, name in (('android', 'Android'), ('ios', 'iOS')):
  if platform not in device_platforms:
   observed = 'no device captures' if platform in device_report.get('platforms', {}) else 'no archived observation for this run'
   parts.append(f'{name}: {observed}')
   continue
  evidence_path, statuses = device_platforms[platform]
  outcomes = {scenario: statuses.get(case['id'], 'absent') for scenario, case in case_index[pattern].items()}
  states = ', '.join(f'{scenario} {status}' for scenario, status in outcomes.items())
  link = f'../device/{device_path.parent.name}/{platform}/{evidence_path.name}'
  parts.append(f'[{name}]({link}): {states}' if markdown else f'{name}: {states} ({evidence_path.as_posix()})')
 return '; '.join(parts)

with (P/'coverage.tsv').open('w',newline='') as f:
 fields=['route','family','case_populated_id','case_empty_id','case_denied_id','web_source','verified_protected_web_cases','native_live_code_paths','native_fixture_or_dependency','native_implementation_source','native_device_scenarios_planned','native_device_executed_evidence','domain_readme']
 w=csv.DictWriter(f,fieldnames=fields,delimiter='\t',lineterminator='\n');w.writeheader()
 for route,source in routes.items():
  fam=family[route];live,fixture=native(route,fam); readme=f'packages/native-parity/academic/{fam}/README.md';implementation=f'apps/mobile-native/features/academic/{fam}/index.tsx'
  assert (R/source).is_file() and (R/readme).is_file() and (R/implementation).is_file()
  w.writerow(dict(route=route,family=fam,case_populated_id=case_index[route]['populated']['id'],case_empty_id=case_index[route]['empty']['id'],case_denied_id=case_index[route]['denied']['id'],web_source=source,verified_protected_web_cases=references(route),native_live_code_paths=live,native_fixture_or_dependency=fixture,native_implementation_source=implementation,native_device_scenarios_planned='; '.join(flows.get(route,[])) or 'No direct fixture entry matched; indirect navigation unassessed',native_device_executed_evidence=device_observation(route),domain_readme=readme))
meta={'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'scope':'Web and implementation observations are from a changing local worktree. Device observations refer to the archived fixture run.','route_count':len(routes),'capture_manifest':'tests/visual/native-parallel/academic/pages/results.json','device_evidence_index':device_path.as_posix() if device_path else None,'device_evidence_revision':device_report.get('revision')}
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
lines=['# Protected web route evidence', '',
 f"Index generated {meta['generated_utc']}; HEAD then was `{meta['head']}` with local uncommitted changes. Captures span a changing worktree and are not attributable to one verified commit.",
 f"Current capture manifest records {counts['new_pass']} passing browser cases, {counts['missing_ui']} unseeded/missing cases with a rendered 404, {counts['shell_only']} shell-only or loading cases, and {counts['unpassed']} other unsuccessful or interrupted cases. Interaction manifest records {counts['interaction_pass']} passing and {counts['interaction_unpassed']} unsuccessful cases. The six earlier protected smoke records are listed separately. Counts are cases, not parity credit.",
 '', '[Route crosswalk and three registry case IDs](coverage.tsv) · [Protected page results](results.json) · [Interaction results](interactions-results.json) · [Original smoke manifest](../web/local-routes/manifest.json)', '',
 'Web links identify passing screenshots, shell-only/loading outcomes, or rendered 404s. Screenshots are listed under the route that rendered them. The requested route records the redirect destination. Initial HTTP 200 with a rendered 404 is identified explicitly. Device statuses come from stamped fixture route captures. Live device operations remain unverified.', f"[Device run index](../device/{device_path.parent.name}/index.json) · [GitHub Actions run]({device_report['runUrl']})" if device_path else 'Device evidence index unavailable.', '', '| Route | Screen family | Recorded original protected web cases | Device fixture observations |', '|---|---|---|---|']
for route,source in routes.items():
 links=[]
 for e,c in page_cases(route):
  if c.get('screenshot') and (c.get('pass') or c.get('notFoundVisible') or c.get('classification','').startswith('shell-only')):
   candidate=P/c['screenshot'];assert candidate.is_file()
   tag=e['id']+' '+c['theme']+(' 404 UI, HTTP '+str(c.get('status')) if c.get('notFoundVisible') else ' shell-only or loading' if c.get('classification','').startswith('shell-only') else '')
   links.append('['+tag+']('+c['screenshot']+')')
 for e in interactions['entries']:
  if recorded_route(e,e) == route and e.get('pass'):
   candidate=P/e['screenshot'];assert candidate.is_file();links.append('['+e['id']+']('+e['screenshot']+')')
 for e in original:
  if recorded_route(e,e) == route:
   candidate=R/'tests/visual/native-parallel/academic/web/local-routes'/f"{e['key']}.png";assert candidate.is_file()
   links.append('['+e['key']+' smoke](../web/local-routes/'+e['key']+'.png)')
 for entry,case,landed in redirected_entries(route):
  links.append(f"{entry['id']} {case['theme']} redirected to `{landed}`")
 lines.append('| `'+route+'` | '+family[route]+' | '+('; '.join(links) if links else 'Not captured or no passing screenshot')+' | '+device_observation(route, markdown=True)+' |')
(P/'summary.md').write_text('\n'.join(lines)+'\n')
