import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import WebSocket from "ws";
import { createServerApp } from "./index.mjs";
const root = process.env.WASI_TEST_ROOT;
const secret = randomBytes(32).toString("base64url"), origin = "https://staging.example.test";
const body = Buffer.from(JSON.stringify({ aud: "zyx-python-staging", exp: Math.floor(Date.now()/1000)+60, jti: randomBytes(18).toString("base64url") })).toString("base64url");
const signature = createHmac("sha256", Buffer.from(secret,"base64url")).update(body).digest("base64url");
const app = createServerApp({ secret, origin, testReady:true, assets:{ executable:process.env.WASI_EXECUTABLE, wasm:`${root}/python.wasm`,library:`${root}/lib` } });
await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/v1/terminal`,["zyx-v1",`ticket.${body}.${signature}`],{origin});
let output="", stage=0, status;
const done = new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.terminate();reject(new Error("Gateway timeout"))},60000);
  ws.on("error",reject);
  ws.on("open",()=>ws.send(JSON.stringify({type:"start",code:'a=input("Nama: "); b=input("Kota: "); print("Halo",a,b,flush=True)'})));
  ws.on("message",raw=>{
    const msg=JSON.parse(raw);
    if(msg.type==="output"){
      output+=Buffer.from(msg.data,"base64").toString();
      if(stage===0&&output.includes("Nama:")){stage=1;setTimeout(()=>ws.send(JSON.stringify({type:"input",data:"Ayu\n"})),6500)}
      if(stage===1&&output.includes("Kota:")){stage=2;setTimeout(()=>ws.send(JSON.stringify({type:"input",data:"Bandung\n"})),6500)}
    }
    if(msg.type==="result")status=msg.status;
  });
  ws.on("close",()=>{clearTimeout(timer);resolve()});
});
try { await done; assert.equal(status,"completed");assert.match(output,/Halo Ayu Bandung/);console.log("authenticated WebSocket and two delayed inputs: PASS"); }
finally { ws.terminate(); await new Promise(resolve=>app.server.close(resolve)); }
