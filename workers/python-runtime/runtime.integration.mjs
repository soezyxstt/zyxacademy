import { strict as assert } from "node:assert";
import { startPython } from "./runtime.mjs";
const root=process.env.WASI_TEST_ROOT;
const options={executable:process.env.WASI_EXECUTABLE || `${root}/wasmtime-v50.0.1-x86_64-linux/wasmtime`,wasm:`${root}/python.wasm`,library:`${root}/lib`};
const waitFor=async(fn,limit=15000)=>{const end=Date.now()+limit;while(!fn()&&Date.now()<end)await new Promise(r=>setTimeout(r,30));assert.ok(fn(),"timed out waiting for output")};
let out="", err="";
const p=await startPython({...options,code:'a=input("Nama: "); b=input("Kota: "); print("Halo",a,b,flush=True)',onOutput:(channel,b)=>{if(channel==="stdout")out+=b;else err+=b}});
await waitFor(()=>out.includes('Nama:'));
await new Promise(r=>setTimeout(r,6500));
p.input('Ayu\n');await waitFor(()=>out.includes('Kota:'));
await new Promise(r=>setTimeout(r,6500));p.input('Bandung\n');
const result=await p.done;assert.equal(result.code,0);assert.match(out,/Halo Ayu Bandung/);assert.equal(result.cleanupFailed,false);console.log('interactive delayed inputs: PASS');
let denied='';const a=await startPython({...options,code:'open("/lib/marker", "w").write("x")',onOutput:(ch,b)=>{if(ch==='stderr')denied+=b}});const ar=await a.done;assert.notEqual(ar.code,0);assert.match(denied,/PermissionError/);assert.equal(ar.cleanupFailed,false);console.log('runtime library write denied: PASS');
let started="";const loop=await startPython({...options,code:'print("mulai", flush=True)\nwhile True: pass',onOutput:(_ch,b)=>{started+=b}});await waitFor(()=>started.includes("mulai"));loop.stop();const lr=await loop.done;assert.equal(lr.stopped,true);assert.equal(lr.cleanupFailed,false);console.log('stop and cleanup: PASS');

let output = "";
const flood = await startPython({ ...options, code: 'print("x" * 100000)', maxOutput: 1000, onOutput: (_channel, bytes) => { output += bytes.toString(); } });
const fr = await flood.done;
assert.equal(fr.outputLimit, true);
assert.ok(Buffer.byteLength(output) <= 1000);
assert.equal(fr.cleanupFailed, false);
console.log('output limit and cleanup: PASS');
await assert.rejects(() => startPython({ ...options, code: 'x'.repeat(64001) }), /Invalid source/);
console.log('source limit: PASS');


let trap="";const exhausted=await startPython({...options,code:'while True: pass',onOutput:(ch,b)=>{if(ch==="stderr")trap+=b}});const er=await exhausted.done;assert.notEqual(er.code,0);assert.match(trap,/fuel consumed/);assert.equal(er.cleanupFailed,false);console.log('fuel limit and cleanup: PASS');

let isolation = "";
const inspect = await startPython({ ...options, code: 'import os, socket\nprint("fork", hasattr(os, "fork"))\nprint("hostfile", os.path.exists("/etc/passwd"))\ntry:\n socket.socket()\n print("socket open")\nexcept OSError:\n print("socket blocked")\nprint("hostsecret", os.environ.get("HOST_SECRET", "absent"))', onOutput: (_ch,b) => { isolation += b; } });
const ir=await inspect.done;
assert.equal(ir.code,0);assert.match(isolation,/fork False/);assert.match(isolation,/hostfile False/);assert.match(isolation,/socket blocked/);assert.match(isolation,/hostsecret absent/);assert.equal(ir.cleanupFailed,false);
console.log('filesystem, environment, child and network: PASS');
let memerr = "";
const memory = await startPython({ ...options, code: 'x=bytearray(300000000)', onOutput: (ch,b) => { if(ch==='stderr') memerr += b; } });
const mr = await memory.done;
assert.notEqual(mr.code,0);assert.match(memerr,/MemoryError|memory/i);assert.equal(mr.cleanupFailed,false);
console.log('WASM memory bound: PASS');
let first="", second="";
const [s1,s2]=await Promise.all([
  startPython({ ...options, code: 'print("A",input("one: "),flush=True)', onOutput: (_ch,b) => { first += b; } }),
  startPython({ ...options, code: 'print("B",input("two: "),flush=True)', onOutput: (_ch,b) => { second += b; } }),
]);
await waitFor(()=>first.includes('one:') && second.includes('two:'),30000);
s1.input('first\n');s2.input('second\n');
const [r1,r2]=await Promise.all([s1.done,s2.done]);
assert.equal(r1.code,0);assert.equal(r2.code,0);assert.equal(r1.cleanupFailed,false);assert.equal(r2.cleanupFailed,false);
assert.match(first,/A first/);assert.doesNotMatch(first,/second/);assert.match(second,/B second/);assert.doesNotMatch(second,/first/);
console.log('two concurrent sessions remain separate: PASS');
