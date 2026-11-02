import test from 'node:test';
import assert from 'node:assert/strict';
import {startPython,reconcileSandbox} from './shared-runtime.mjs';

function fixture({killFails=false,uploadFails=false}={}) {
 const calls={killed:[],deleted:[],uploads:[],commands:[]};let data,finish;
 const done=new Promise(r=>finish=r);
 const pty={waitForConnection:async()=>{},wait:()=>done,sendInput:async()=>{},disconnect:async()=>{}};
 const sandbox={fs:{uploadFile:async(b,p)=>{if(uploadFails)throw Error('upload');calls.uploads.push([b,p])},deleteFile:async(p)=>calls.deleted.push(p),listFiles:async()=>[{name:'zyx-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},{name:'unrelated'}]},process:{executeCommand:async(c)=>{calls.commands.push(c);return {exitCode:0}},createPty:async(opts)=>{data=opts.onData;calls.ptyId=opts.id;return pty},killPtySession:async(id)=>{calls.killed.push(id);if(killFails)throw Error('kill')},listPtySessions:async()=>[{id:'zyxpty-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},{id:'unrelated'}]}};
 return {calls,sandbox,client:{get:async()=>sandbox},finish,data:(s)=>data(Buffer.from(s))};
}
const options=f=>({sandboxId:'test-id',daytona:f.client,code:'print(input())'});
test('same sandbox executes separately and removes only own session and files',async()=>{
 const f=fixture(),out=[];const run=await startPython({...options(f),onOutput:(_s,b)=>out.push(b.toString())});
 assert.equal(f.calls.uploads[0][0].toString(),'print(input())');
 const id=f.calls.ptyId.slice('zyxpty-'.length);f.data(`ZYX_START_${id}hello`);assert.deepEqual(out,['hello']);
 assert.equal(run.input('Ayu\n'),true);f.finish({exitCode:0});const result=await run.done;
 assert.equal(result.code,0);assert.equal(result.cleanupFailed,false);assert.deepEqual(f.calls.killed,[f.calls.ptyId]);assert.deepEqual(f.calls.deleted,[`/tmp/zyx-${id}`]);
});
test('stop and oversized output kill own session',async()=>{
 const f=fixture();const run=await startPython({...options(f),maxOutput:100});const id=f.calls.ptyId.slice(7);f.data(`ZYX_START_${id}${'x'.repeat(101)}`);const result=await run.done;
 assert.equal(result.outputLimit,true);assert.equal(f.calls.killed.length,1);assert.equal(f.calls.deleted.length,1);
});
test('failed process cleanup disables further runs',async()=>{
 const f=fixture({killFails:true});const run=await startPython(options(f));run.stop();assert.equal((await run.done).cleanupFailed,true);
});
test('failed upload removes its directory and any concurrently created pty',async()=>{
 const f=fixture({uploadFails:true});await assert.rejects(startPython(options(f)));assert.equal(f.calls.deleted.length,1);assert.equal(f.calls.killed.length,1);
});
test('startup reconciliation removes only owned orphan sessions and files',async()=>{
 const f=fixture();await reconcileSandbox({sandboxId:'test-id',daytona:f.client});
 assert.deepEqual(f.calls.killed,['zyxpty-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);assert.deepEqual(f.calls.deleted,['/tmp/zyx-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
});

test('nonzero Python exit with a reason is an execution error, not a runtime failure',async()=>{
 const f=fixture();const run=await startPython(options(f));f.finish({exitCode:1,error:'process exited with code 1'});const result=await run.done;
 assert.equal(result.code,1);assert.equal(result.spawnError,false);
});

test('reconciled sandbox is reused and a failed setup invalidates it',async()=>{
 const f=fixture();let lookups=0;
 const client={get:async()=>{lookups++;return f.sandbox}};
 await reconcileSandbox({sandboxId:'test-id',daytona:client});
 const first=await startPython({...options(f),daytona:client});first.stop();await first.done;
 assert.equal(lookups,1);
 const original=f.sandbox.fs.uploadFile;f.sandbox.fs.uploadFile=async()=>{throw Error('upload')};
 await assert.rejects(startPython({...options(f),daytona:client}));
 f.sandbox.fs.uploadFile=original;
 const second=await startPython({...options(f),daytona:client});second.stop();await second.done;
 assert.equal(lookups,2);
 assert.match(f.calls.commands[0],/test -x .* && \/bin\/mkdir -p /);
});


test('prepares PTY while source setup is pending',async()=>{
 const f=fixture();let release;const gate=new Promise(resolve=>{release=resolve});
 const original=f.sandbox.process.executeCommand;
 f.sandbox.process.executeCommand=async(...args)=>{await gate;return original(...args)};
 const pending=startPython(options(f));
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(f.calls.ptyId);
 assert.equal(f.calls.uploads.length,0);
 release();const run=await pending;run.stop();await run.done;
});

test('timed-out source setup fails closed and removes a late-created directory',async()=>{
 const f=fixture();let release;const gate=new Promise(resolve=>{release=resolve});
 f.sandbox.process.executeCommand=async()=>{await gate;return {exitCode:0}};
 await assert.rejects(startPython({...options(f),timeoutMs:10}),error=>error.cleanupFailed===true);
 assert.equal(f.calls.killed.length,1);
 assert.equal(f.calls.deleted.length,1);
 release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.deleted.length,2);
});

test('prepared execution waits for source before upload and cleans after cancel',async()=>{
 const f=fixture();let prepared,resolveCode;const ready=new Promise(resolve=>{prepared=resolve});const codeReady=new Promise(resolve=>{resolveCode=resolve});
 const pending=startPython({...options(f),codeReady,onPrepared:prepared});
 await ready;assert.equal(f.calls.uploads.length,0);assert.ok(f.calls.ptyId);
 resolveCode('print(42)');const run=await pending;assert.equal(f.calls.uploads[0][0].toString(),'print(42)');run.stop();await run.done;assert.equal(f.calls.deleted.length,1);
});

test('cancelled warm preparation cleans its terminal and directory',async()=>{
 const f=fixture();let prepared,rejectCode;const ready=new Promise(resolve=>{prepared=resolve});const codeReady=new Promise((_,reject)=>{rejectCode=reject});codeReady.catch(()=>{});
 const pending=startPython({...options(f),codeReady,onPrepared:prepared});await ready;rejectCode(Error('cancel'));
 await assert.rejects(pending);assert.equal(f.calls.killed.length,1);assert.equal(f.calls.deleted.length,1);
});
