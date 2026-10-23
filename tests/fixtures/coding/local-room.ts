import { LiveQuizRoom } from '../../../workers/realtime/src/room';
const data = new Map<string, unknown>();
let initialized = Promise.resolve();
const context = { storage: { async get(key: string) { return data.get(key); }, async put(key: string,value: unknown) { data.set(key,structuredClone(value)); }, async delete(key: string) { data.delete(key); } }, blockConcurrencyWhile(fn: () => Promise<void>) { initialized = fn();return initialized; }, getWebSockets: () => [], getTags: () => [], acceptWebSocket() {} };
const room = new LiveQuizRoom(context as never,{ LIVE_HMAC_SECRET:process.env.LIVE_HMAC_SECRET!,NEXT_APP_URL:'',LIVE_QUIZ_ROOM:{} } as never);
await initialized;
async function post(op: string, body: unknown) { return room.fetch(new Request(`http://127.0.0.1:3001/room/coding-session/${op}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.LIVE_HMAC_SECRET}`, 'Content-Type':'application/json'},body:JSON.stringify(body)})); }
await post('init',{sessionId:'coding-session',courseId:'coding-course',questions:[{prompt:'Jumlah bilangan genap',options:[],correctIndex:0,coding:{problemId:'sum-even',version:1,maxAttempts:null,assistance:'hints',scoring:'best',durationSeconds:3600}}]});
const state=(room as unknown as {roomState:{participants:Record<string,unknown>}}).roomState;
for(let i=1;i<=3;i++) state.participants[`coding-student-${i}`]={userId:`coding-student-${i}`,name:'Mahasiswa Python',score:0,connected:true};
await post('control',{action:'start'});
Bun.serve({port:3001,hostname:'127.0.0.1',fetch:request=>room.fetch(request)});
console.log('Local real room class with synthetic storage and bootstrapped membership ready');
