import sqlite3, secrets, os, json, hmac, hashlib, base64, urllib.parse, sys
from pathlib import Path
Path('artifacts/coding-live').mkdir(parents=True, exist_ok=True)
c=sqlite3.connect('/tmp/zyx-coding-live.db')
assert c.execute('pragma database_list').fetchone()[2]=='/tmp/zyx-coding-live.db'
print('Local database, existing users:',c.execute('select count(*) from user').fetchone()[0])
# Synthetic data only. No external connections.
for i in range(int(sys.argv[1]) if len(sys.argv)>1 else 1, int(sys.argv[2]) if len(sys.argv)>2 else 4):
 uid=f'coding-student-{i}'
 c.execute('insert or ignore into user(id,name,email,email_verified,role) values(?,?,?,?,?)',(uid,'Mahasiswa Python',f'coding-{i}@example.test',1,'student'))
 c.execute('insert or ignore into pengguna(id,status) values(?,?)',(uid,'active'))
 c.execute("insert or ignore into peran(id,code) values('role-murid','murid')")
 c.execute('insert or ignore into pengguna_peran(id,pengguna_id,peran_id,source) values(?,?,?,?)',(f'membership-{i}',uid,'role-murid','local-synthetic'))
 c.execute("insert or ignore into courses(id,title,category) values('coding-course','Berpikir komputasi dengan Python','Teknik Informatika')")
 c.execute("insert or ignore into mata_kuliah(id,code,title,legacy_course_id) values('coding-course','PY-SYNTH','Berpikir komputasi dengan Python','coding-course')")
 c.execute("insert or ignore into pendaftaran_murid(id,pengguna_id,mata_kuliah_id,status) values(?,?,'coding-course','active')",(f'enroll-{i}',uid))
 token=secrets.token_urlsafe(32)
 c.execute("insert or replace into session(id,user_id,token,expires_at) values(?,?,?,?)",(f'coding-session-{i}',uid,token,2000000000))
 signed=token+'.'+base64.b64encode(hmac.new(os.environ['BETTER_AUTH_SECRET'].encode(),token.encode(),hashlib.sha256).digest()).decode()
 state={'cookies':[{'name':'better-auth.session_token','value':urllib.parse.quote(signed,safe=''),'domain':'127.0.0.1','path':'/','expires':2000000000,'httpOnly':True,'secure':False,'sameSite':'Lax'}],'origins':[]}
 p=Path(f'artifacts/coding-live/auth-{i}.json');p.write_text(json.dumps(state));p.chmod(0o600)
c.commit()
print('Synthetic local identities and course ready')

import sqlite3,json,base64
c=sqlite3.connect('/tmp/zyx-coding-live.db')
p={'problemId':'sum-even','version':1,'courseId':'coding-course','language':'python','title':'Jumlah bilangan genap','prompt':'Baca n dan tampilkan jumlah bilangan genap dari 1 hingga n, termasuk n.','learningObjectives':['Memahami batas perulangan dan akumulasi'],'starterCode':'n = int(input())\ntotal = 0\nfor angka in range(0, n, 2):\n    total += angka\nprint(total)','publicTests':[{'id':'public-6','stdin':'6','expectedStdout':'12\n'}],'limits':{'timeoutMs':1000,'maxOutputChars':8000},'referenceSolution':'n = int(input())\nprint(sum(range(0, n + 1, 2)))\n# REFERENCE_CANARY_83271','solutionExplanation':'Batas akhir n harus ikut dihitung.','privateTests':[{'id':'hidden-canary-93817','stdin':'937','expectedStdout':'219492\n'}],'misconceptions':[{'id':'range-end','description':'Kemungkinan mengira batas stop pada range ikut diproses.','diagnosticQuestion':'Apakah nilai stop ikut dihasilkan range?'}]}
c.execute("insert or replace into coding_problems(id,version,course_id,status,snapshot,creator_id) values('sum-even',1,'coding-course','published',?,'coding-student-1')",(json.dumps(p),))
c.execute("insert or ignore into artikel(id,mata_kuliah_id,slug,title,content_markdown,source_hash,generation_hash,creator_id,status) values('coding-article','coding-course','coding','Batas perulangan','Materi sintetis lokal','synthetic','synthetic','coding-student-1','published')")
payload=base64.urlsafe_b64encode(json.dumps({'parts':[{'id':'exercise','kind':'coding_exercise','problem':{'problemId':'sum-even','version':1}}]}).encode()).decode().rstrip('=')
c.execute("insert or replace into blok_artikel(id,artikel_id,block_key,block_type,order_index,content,generation_hash,status) values('coding-block','coding-article','coding','text',0,?,'synthetic','published')",('<!--__ZYX_V4_BLOCK_PAYLOAD__:'+payload+'-->',))
c.commit();print('Seeded local problem and published article locator')

c.execute("insert or ignore into live_quiz_sessions(id,course_id,tutor_id,code,questions_snapshot) values('coding-session','coding-course','coding-student-1','PYTEST','[]')")
c.commit()
