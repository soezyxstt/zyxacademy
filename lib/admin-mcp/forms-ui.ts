import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const FORMS_PREVIEW_URI = "ui://zyx/forms-preview.html";
export const FORMS_SUMMARY_URI = "ui://zyx/forms-summary.html";
export const formsUiMeta = (resourceUri: string) => ({ ui: { resourceUri } });
export const FORMS_UI_MIME = "text/html;profile=mcp-app";

// All data enters via textContent or DOM properties. No remote assets, HTML interpolation,
// server tool calls, uploads, or persistence are permitted inside this simulation.
export const formsUiHtml = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>
:root {
  color-scheme: light dark;
  --background: #fff;
  --foreground: #292929;
  --action: #292929;
  --action-foreground: #fff;
  --border: #e4e4e4;
  --muted-foreground: #626262;
  --hover: #f5f5f5;
  --error: #a12626;
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  color: var(--foreground);
  background: var(--background);
}
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; }
main { max-width: 42rem; margin-inline: auto; overflow-wrap: anywhere; }
h1, h2 { font-family: var(--font-heading, ui-sans-serif, sans-serif); }
h1 { font-size: 24px; margin: 0 0 8px; }
h2 { font-size: 16px; margin: 0 0 4px; }
p { line-height: 1.5; margin: 0 0 8px; white-space: pre-wrap; }
section { border-top: 1px solid var(--border); padding-block: 12px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
legend { font-size: 14px; font-weight: 600; padding: 0; margin-bottom: 8px; }
label.choice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 36px;
  padding-block: 8px;
  font-size: 14px;
  cursor: pointer;
}
label.choice:hover { background: var(--hover); }
label.choice + label.choice { border-top: 1px solid var(--border); }
label.choice input { flex-shrink: 0; margin-top: 2px; accent-color: var(--action); }
input, textarea, select, button { font: inherit; font-size: 14px; }
input[type=text], input[type=date], input[type=time], input[type=email], textarea, select {
  display: block;
  width: 100%;
  max-width: 28rem;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  background: var(--background);
  color: inherit;
}
input[hidden] { display: none; }
select { border-color: transparent; background: var(--hover); cursor: pointer; }
textarea { min-height: 80px; }
button {
  display: block;
  min-height: 36px;
  margin-inline-start: auto;
  border: 0;
  border-radius: 6px;
  padding: 8px 12px;
  background: var(--action);
  color: var(--action-foreground);
  cursor: pointer;
}
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--action);
  outline-offset: 2px;
}
.muted, .error { font-size: 12px; }
.muted { color: var(--muted-foreground); }
.error { color: var(--error); }
.error:empty, .success:empty { display: none; }
.success { font-size: 14px; font-weight: 600; }
.grid-row { padding-block: 8px; border-top: 1px solid var(--border); }
.bar { height: 3px; background: var(--border); border-radius: 3px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--action); }
.metric { display: flex; justify-content: space-between; gap: 8px; margin: 8px 0 4px; font-size: 12px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
td, th { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
th:last-child, td:last-child { text-align: right; }
@media (prefers-color-scheme: dark) {
  :root {
    --background: #212121;
    --foreground: #f4f4f4;
    --action: #f4f4f4;
    --action-foreground: #212121;
    --border: #414141;
    --muted-foreground: #b4b4b4;
    --hover: #2c2c2c;
    --error: #ffaaaa;
  }
}
</style></head><body><main id="app"><p class="muted">Memuat data...</p></main><script>
(function(){'use strict';
const app=document.getElementById('app');
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const add=(p,tag,text,cls)=>{const n=el(tag,text,cls);p.appendChild(n);return n};
const arr=x=>Array.isArray(x)?x:[];
function choice(p,name,type,value,label){const l=add(p,'label',undefined,'choice'),i=add(l,'input');i.type=type;i.name=name;i.value=value;add(l,'span',label);return i}
function preview(data){const form=data&&data.form;if(!form){app.replaceChildren(el('p','Formulir tidak ditemukan.'));return}app.replaceChildren();add(app,'h1',form.title||'Formulir');if(form.description)add(app,'p',form.description);add(app,'p','Simulasi saja. Jawaban tidak dikirim atau disimpan.','muted');const f=add(app,'form');f.noValidate=true;const controls=[];
if(form.settings&&form.settings.collectEmail==='input'){const section=add(f,'section');const label=add(section,'label','Email');const input=add(section,'input');input.type='email';input.required=true;input.setAttribute('aria-label','Email');const error=add(section,'p','','error');error.setAttribute('role','alert');controls.push({q:{required:true,type:'EMAIL'},get:()=>input.validity.valid&&input.value.trim(),error})}
arr(form.questions).forEach((q,index)=>{const s=add(f,'section');if(q.type==='SECTION'||q.type==='STATEMENT'){add(s,'h2',q.title);if(q.description)add(s,'p',q.description);return}const fs=add(s,'fieldset');add(fs,'legend',(q.title||'Pertanyaan')+(q.required?' *':''));if(q.description&&q.showDescription!==false)add(fs,'p',q.description,'muted');const name='q'+index;let get=()=>'';
if(['TEXT','PARAGRAPH','DATE','TIME'].includes(q.type)){const i=add(fs,q.type==='PARAGRAPH'?'textarea':'input');if(i.tagName==='INPUT')i.type=q.type==='DATE'?'date':q.type==='TIME'?'time':'text';i.setAttribute('aria-label',q.title);get=()=>i.value.trim()}
else if(q.type==='FILE_UPLOAD'){add(fs,'p','Unggah berkas tidak tersedia dalam simulasi.','muted');get=()=>q.required?'unavailable':'optional'}
else if(q.type==='DROP_DOWN'){const sel=add(fs,'select');sel.setAttribute('aria-label',q.title);const empty=add(sel,'option','Pilih');empty.value='';arr(q.options).forEach(o=>{const a=add(sel,'option',o);a.value=o});if(q.otherOption&&q.otherOption.enabled){const other=add(sel,'option',q.otherOption.label||'Lainnya');other.value='__other__';const t=add(fs,'input');t.type='text';t.hidden=true;t.setAttribute('aria-label',q.otherOption.label||'Lainnya');sel.addEventListener('change',()=>{t.hidden=sel.value!=='__other__'});get=()=>sel.value==='__other__'?(t.value.trim()||'__invalid_other__'):sel.value}else get=()=>sel.value}
else if(['RADIO','CHECKBOX','SCALE','RATING'].includes(q.type)){let options=arr(q.options);if(q.type==='SCALE'||q.type==='RATING'){const low=Math.max(0,Number(q.scaleLow??1)),high=Math.min(10,Number(q.scaleHigh??5));options=Array.from({length:Math.max(0,high-low+1)},(_,i)=>String(low+i));if(q.scaleLowLabel)add(fs,'p',q.scaleLowLabel,'muted')};const inputs=options.map(o=>choice(fs,name,q.type==='CHECKBOX'?'checkbox':'radio',String(o),o));if(q.scaleHighLabel&&(q.type==='SCALE'||q.type==='RATING'))add(fs,'p',q.scaleHighLabel,'muted');if(q.otherOption&&q.otherOption.enabled){const i=choice(fs,name,q.type==='CHECKBOX'?'checkbox':'radio','other',q.otherOption.label||'Lainnya');const t=add(fs,'input');t.type='text';t.setAttribute('aria-label',q.otherOption.label||'Lainnya');inputs.push(i);get=()=>i.checked&&!t.value.trim()?'__invalid_other__':inputs.some(x=>x.checked)}else get=()=>inputs.some(x=>x.checked)}
else if(q.type==='GRID_RADIO'||q.type==='GRID_CHECKBOX'){const rows=arr(q.gridRows).map((row,j)=>{const box=add(fs,'div',undefined,'grid-row');add(box,'div',row);return arr(q.gridColumns).map(col=>choice(box,name+'r'+j,q.type==='GRID_RADIO'?'radio':'checkbox',col,col))});get=()=>rows.length>0&&rows.every(row=>row.some(i=>i.checked))}
else {add(fs,'p','Jenis pertanyaan tidak didukung.','error');get=()=>'__unsupported__'}const error=add(s,'p','','error');error.setAttribute('role','alert');controls.push({q,get,error})});
const status=add(f,'p','','success');status.setAttribute('role','status');const btn=add(f,'button','Periksa jawaban');btn.type='submit';f.addEventListener('submit',e=>{e.preventDefault();let valid=true;controls.forEach(({q,get,error})=>{const v=get();let message='';if(v==='__invalid_other__')message='Jelaskan pilihan lainnya.';else if(v==='__unsupported__')message='Jenis pertanyaan tidak didukung.';else if(q.type==='EMAIL'&&!v)message='Masukkan email yang valid.';else if(q.type==='FILE_UPLOAD'&&q.required)message='Berkas wajib tidak dapat diperiksa dalam simulasi.';else if(q.required&&!v)message='Pertanyaan ini wajib diisi.';else if(v&&typeof v==='string'&&['DATE','TIME'].includes(q.type)&&!v.trim())message='Jawaban tidak valid.';error.textContent=message;if(message)valid=false});status.textContent=valid?'Simulasi selesai. Jawaban tidak dikirim.':''});}
function summary(data){app.replaceChildren();add(app,'h1','Ringkasan respons');if(!data){add(app,'p','Ringkasan tidak tersedia.');return}const total=Math.max(0,Number(data.totalResponses)||0);add(app,'p',total+' respons','muted');if(!total){const empty=add(app,'section');add(empty,'h2','Belum ada respons');add(empty,'p','Bagikan tautan formulir kepada responden.','muted');return}arr(data.questions).forEach(q=>{const s=add(app,'section');add(s,'h2',q.title);const denominator=Math.max(0,Number(q.denominator)||0),answered=Math.max(0,Number(q.answered)||0);add(s,'p',answered+' / '+denominator+' respons menjawab','muted');const entries=Object.entries(q.counts||{});if(!entries.length)return;const table=add(s,'table');const head=add(table,'tr');add(head,'th','Pilihan');add(head,'th','Jumlah');add(head,'th','%');entries.forEach(([label,value])=>{const count=Math.max(0,Number(value)||0),pct=denominator?count/denominator*100:0;const tr=add(table,'tr');add(tr,'td',label);add(tr,'td',count);add(tr,'td',pct.toFixed(1)+'%');const metric=add(s,'div',undefined,'metric');add(metric,'span',label);add(metric,'span',pct.toFixed(1)+'%');const bar=add(s,'div',undefined,'bar');bar.setAttribute('aria-hidden','true');const fill=add(bar,'span');fill.style.width=Math.min(100,pct)+'%'});});}
let ready=false;window.addEventListener('message',event=>{if(event.source!==window.parent)return;const m=event.data;if(!m||m.jsonrpc!=='2.0')return;if(m.id===1&&m.result&&!ready){ready=true;parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*')}if(m.method==='ui/notifications/tool-result'){const result=m.params||{},payload=result.structuredContent;if(result.isError||!payload||payload.ok===false){app.replaceChildren();const error=add(app,'section');error.setAttribute('role','alert');add(error,'h1','Data tidak tersedia');add(error,'p','Jalankan ulang permintaan setelah memeriksa izin akses.','muted');return}const data=payload.data;if(data&&data.form)preview(data);else summary(data)}if(m.method==='ui/resource-teardown'&&m.id!==undefined)parent.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*')});parent.postMessage({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{appInfo:{name:'Zyx Forms',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}},'*');
})();</script></body></html>`;

export function registerFormsUi(server: McpServer): void {
  for (const [name, uri] of [["forms-preview", FORMS_PREVIEW_URI], ["forms-summary", FORMS_SUMMARY_URI]] as const) {
    server.registerResource(name, uri, { mimeType: FORMS_UI_MIME, _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } }, async () => ({ contents: [{ uri, mimeType: FORMS_UI_MIME, text: formsUiHtml, _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } }] }));
  }
}

export const formsUiResources = [FORMS_PREVIEW_URI, FORMS_SUMMARY_URI].map(uri => ({ uri, mimeType: FORMS_UI_MIME, text: formsUiHtml, _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } }));
