"""Regenerate route crosswalk from local source and recorded captures; no device claims."""
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

def matches(pattern,path):
 rx=re.escape(pattern);rx=re.sub(r'\\\[[^]]+\\\]',r'[^/]+',rx)
 return bool(re.fullmatch(rx,path))

results=json.loads((P/'results.json').read_text()) if (P/'results.json').exists() else {'entries':[]}
original=json.loads((R/'tests/visual/native-parallel/academic/web/local-routes/manifest.json').read_text())
interactions=json.loads((P/'interactions-results.json').read_text()) if (P/'interactions-results.json').exists() else {'entries':[]}
flows={}
for f in (R/'.maestro/native-parallel/academic').glob('*.yaml'):
 paths=[]
 for link in re.findall(r'openLink:\s*(\S+)',f.read_text()):
  params=urllib.parse.parse_qs(urllib.parse.urlsplit(link).query);paths+=params.get('path',[])
 for pattern in routes:
  if any(matches(pattern,path) for path in paths):flows.setdefault(pattern,[]).append(f.as_posix())

def native(pattern, group):
 if group=='administration':
  end={'/admin/users':'users','/admin/groups':'groups','/admin/tokens':'tokens','/admin/notifications':'notifications','/admin/schedules':'schedules','/admin/tutorial-pka/registrations':'registrations','/admin/tutorial-pka/announcements':'announcements','/admin/tutorial-pka/schedules':'sessions'}
  if pattern=='/admin/groups':return ('GET /api/native/academic-administration/groups and group-editor[/id]; POST groups; PATCH groups/[id]', 'Group members and deletion require further review; group create/edit client in study-group-client.ts')
  if pattern in end:
   add='; PATCH announcement text supported' if pattern.endswith('/announcements') else ''
   return ('GET /api/native/academic-administration/'+end[pattern]+add,'Other edits/broadcasts are fixture; review domain README for partial support')
  if '/review/idea/[bundleId]' in pattern:return ('GET /api/native/academic-administration/bundle/idea/[slug]/[bundleId]','Idea review, revisions and publication are fixture')
  if '/review/product/[bundleId]' in pattern:return ('GET /api/native/academic-administration/bundle/product/[slug]/[bundleId]; PDF job/status through bundle routes','Product review and publication fixture; full renderer/download integration pending')
  return ('GET /api/native/academic-administration/alias/... resolves or redirects','Alias destination and selection require screen navigation')
 if group=='courses':
  if pattern=='/admin/courses':return ('GET /api/native/academic/admin/courses','Create course uses fixture')
  if pattern=='/admin/courses/[slug]':return ('GET /api/native/academic/admin/courses/[slug]','Chapter create/edit/delete/reorder use fixture')
  suffix=pattern.removeprefix('/admin/courses/[slug]/')
  if suffix=='settings':return ('GET and PATCH /api/native/academic/admin/courses/[slug]/settings','Only information fields saved; pricing, demo and archive use fixture')
  return ('GET /api/native/academic/admin/courses/[slug]/'+suffix,'Subsection changes use fixture; content renderer and AI may require web')
 if group=='assessment':
  if pattern=='/tutor/[courseId]/tryouts':return ('Alias to /tutor/[courseId]','No independent tryout route')
  if pattern=='/admin/courses/[slug]/tryouts':return ('GET /api/native/academic-assessment/admin/[slug]/tryouts','Tryout and question mutations use fixture')
  if '/attempts' in pattern:return ('GET /api/native/academic-assessment/tutor/[courseId]/attempts/[quizId]','Attachment/complex renderer dependencies')
  if '/grading' in pattern:return ('GET /api/native/academic-assessment/tutor/[courseId]/grading[/attemptId]; POST grading/[attemptId]','Attachment and complex formula renderer dependencies')
  role='tutor' if pattern.startswith('/tutor') else 'admin'; key='[courseId]' if role=='tutor' else '[slug]'
  return (f'GET /api/native/academic-assessment/{role}/{key}/quizzes and preview; POST/PATCH/DELETE /api/quiz/templates[/id]', 'Question-bank mutations use fixture; formula renderer dependency')
 if pattern=='/tutor':return ('GET /api/native/academic/tutor/dashboard','Dashboard fixture for gallery')
 if pattern=='/tutor/[courseId]':return ('GET /api/native/academic/tutor/courses/[courseId]/analytics','Refresh and full web analytics not established')
 if pattern=='/tutor/[courseId]/participants':return ('GET /api/native/academic/tutor/courses/[courseId]/participants','Participant details from read model')
 if pattern=='/tutor/[courseId]/grading':return ('GET /api/native/academic/tutor/courses/[courseId]/grading; POST /api/native/academic/tutor-support/courses/[courseId]/grading/[submissionId]', 'Native grade editor wired via tutor/index.tsx; attachments require web; runtime unverified')
 if pattern=='/tutor/schedule':return ('GET /api/native/academic/tutor-support/schedule; slot-client.ts defines POST schedule/slots and PATCH schedule/slots/[id]', 'Slot client supplied in support-client.ts; screen consumer not yet found; other scheduling mutations fixture/web')
 if pattern in ('/tutor/discussions','/tutor/[courseId]/discussions'):return ('GET and POST /api/native/academic/tutor-support/[courses/courseId/]discussions','Text replies; attachment, reactions, mentions and Zyra require web')
 if pattern=='/tutor/[courseId]/materials':return ('GET /api/native/academic/tutor-support/courses/[courseId]/materials','Material management and full renderer require web')
 if pattern=='/tutor/[courseId]/videos':return ('GET /api/native/academic/tutor-support/courses/[courseId]/videos; playback URL','Upload/management and cookie-bound playback require web')
 if pattern=='/tutor/[courseId]/live':return ('GET /api/native/academic/tutor-support/courses/[courseId]/live','Realtime hosting and controls require web')
 if pattern in ('/tutor/docs','/tutor/docs/[slug]'):return ('Shared local source packages/academic/docs/tutor','Diagram rendering integration pending')
 raise AssertionError(pattern)

def references(pattern):
 out=[]
 for e in results['entries']:
  if matches(pattern,e['path']):
   for c in e['cases']:
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
  if matches(pattern,e['path']) and e.get('pass'):
   p=P/e['screenshot'];assert p.is_file(),p;out.append(f"{e['id']}:interaction {p.as_posix()}")
 for e in original:
  if matches(pattern,e['path']):
   p=R/'tests/visual/native-parallel/academic/web/local-routes'/f"{e['key']}.png";assert p.is_file();out.append(f"original:{e['key']} {p.as_posix()} (original protected smoke; see its manifest)")
 return '; '.join(out) or 'No protected page capture recorded'

with (P/'coverage.tsv').open('w',newline='') as f:
 fields=['route','family','case_populated_id','case_empty_id','case_denied_id','web_source','verified_protected_web_cases','native_live_code_paths','native_fixture_or_dependency','native_implementation_source','native_device_scenarios_planned','native_device_executed_evidence','domain_readme']
 w=csv.DictWriter(f,fieldnames=fields,delimiter='\t',lineterminator='\n');w.writeheader()
 for route,source in routes.items():
  fam=family[route];live,fixture=native(route,fam); readme=f'packages/native-parity/academic/{fam}/README.md';implementation=f'apps/mobile-native/features/academic/{fam}/index.tsx'
  assert (R/source).is_file() and (R/readme).is_file() and (R/implementation).is_file()
  w.writerow(dict(route=route,family=fam,case_populated_id=case_index[route]['populated']['id'],case_empty_id=case_index[route]['empty']['id'],case_denied_id=case_index[route]['denied']['id'],web_source=source,verified_protected_web_cases=references(route),native_live_code_paths=live,native_fixture_or_dependency=fixture,native_implementation_source=implementation,native_device_scenarios_planned='; '.join(flows.get(route,[])) or 'No direct openLink matched; indirect navigation not assessed',native_device_executed_evidence='No Android/iOS run artifact verified in this crosswalk',domain_readme=readme))
meta={'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'scope':'local worktree, including uncommitted changes; no deployment or device execution asserted','route_count':len(routes),'capture_manifest':'tests/visual/native-parallel/academic/pages/results.json'}
(P/'coverage-meta.json').write_text(json.dumps(meta,indent=2)+'\n')
print('wrote',len(routes),'route rows; sources and referenced screenshots verified')

# Human-readable per-route links accompany, but do not replace, the TSV and manifests.
from collections import Counter
counts=Counter()
for e in results['entries']:
 for c in e['cases']:
  if c.get('pass'):counts['new_pass']+=1
  elif c.get('notFoundVisible'):counts['missing_ui']+=1
  else:counts['unpassed']+=1
for e in interactions['entries']:
 counts['interaction_pass' if e.get('pass') else 'interaction_unpassed']+=1
lines=['# Protected web route evidence', '',
 f"Index generated {meta['generated_utc']}; HEAD then was `{meta['head']}` with local uncommitted changes. Captures span a changing worktree and are not attributable to one verified commit.",
 f"Current capture manifest records {counts['new_pass']} passing browser cases, {counts['missing_ui']} unseeded/missing cases with a rendered 404, and {counts['unpassed']} unsuccessful or interrupted cases. Interaction manifest records {counts['interaction_pass']} passing and {counts['interaction_unpassed']} unsuccessful cases. The six earlier protected smoke records are listed separately. Counts are cases, not parity credit.",
 '', '[Route crosswalk and three registry case IDs](coverage.tsv) · [Protected page results](results.json) · [Interaction results](interactions-results.json) · [Original smoke manifest](../web/local-routes/manifest.json)', '',
 'Every link below points to an existing capture. Missing IDs show a 404 page and are not populated-page evidence. Absence of a link means no passing screenshot has been recorded for that route. Initial HTTP 200 with a rendered 404 is identified explicitly. Device execution remains unverified.', '', '| Route | Screen family | Recorded original protected web cases |', '|---|---|---|']
for route,source in routes.items():
 links=[]
 for e in results['entries']:
  if matches(route,e['path']):
   for c in e['cases']:
    if c.get('screenshot') and (c.get('pass') or c.get('notFoundVisible')):
     candidate=P/c['screenshot'];assert candidate.is_file()
     tag=e['id']+' '+c['theme']+(' 404 UI, HTTP '+str(c.get('status')) if c.get('notFoundVisible') else '')
     links.append('['+tag+']('+c['screenshot']+')')
 for e in interactions['entries']:
  if matches(route,e['path']) and e.get('pass'):
   candidate=P/e['screenshot'];assert candidate.is_file();links.append('['+e['id']+']('+e['screenshot']+')')
 for e in original:
  if matches(route,e['path']):
   candidate=R/'tests/visual/native-parallel/academic/web/local-routes'/f"{e['key']}.png";assert candidate.is_file()
   links.append('['+e['key']+' smoke](../web/local-routes/'+e['key']+'.png)')
 lines.append('| `'+route+'` | '+family[route]+' | '+('; '.join(links) if links else 'Not captured or no passing screenshot')+' |')
(P/'summary.md').write_text('\n'.join(lines)+'\n')
