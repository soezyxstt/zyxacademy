import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureMatches, sourceHashes } from './rich-documents/capture-match.mjs';

const root=resolve('tests/visual/fixtures/rich-documents'), output=resolve(root,'built');
const css=await readFile('tests/visual/fixtures/rich-documents.css','utf8');
const katexLicense=await readFile('node_modules/katex/LICENSE','utf8');
const definitions={museum:['Denah museum','Jalur antarruang melalui pintu.','Denah tujuh ruang, rute awal berada di ruang 2.'],milk:['Mesin susu','Warna masukan bercabang melalui tiga mesin.','Kedua masukan awal cokelat. Dua mesin atas menghasilkan putih dan mesin akhir menghasilkan cokelat.'],mechanics:['Balok dan rotor','Gerak tunak dan diagram gaya balok.','Balok dihubungkan dengan rotor, pegas dan peredam. Waktu awal 0 detik dan rasio frekuensi 0,8.'],sampling:['Distribusi rata-rata sampel','Perbandingan histogram dan pendekatan normal.','Untuk ukuran sampel 16, standard error 95 kg dan rentang satu standard error adalah 2355 hingga 2545 kg.'],brick:['Bata berpemanas','Suhu bata dan bidang potong tiga dimensi.','Pada 30 menit, pusat bata sekitar 956,6 derajat Celsius dan sudut sekitar 1177,5 derajat Celsius.'],annulus:['Anulus berpemanas','Aliran anulus dan suhu curah sepanjang pipa.','Pada laju massa 0,05 kg per detik, panjang sekitar 49,98 m dan suhu curah keluar 95 derajat Celsius.'],affine:['Transformasi afin','Poligon asal dan hasil transformasi.','Pada keadaan awal, transformasi identitas menempatkan hasil tepat di atas poligon asal.']};
await mkdir(output,{recursive:true});
const manifest={};
for(const [id,[label,description,defaultState]] of Object.entries(definitions)){
  const result=await build({plugins:[{name:'katex-woff2',setup(build){build.onLoad({filter:/katex\.min\.css$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/,url\([^)]*\.(?:woff|ttf)\) format\([^)]*\)/g,''),loader:'css',resolveDir:resolve('node_modules/katex/dist')}));}}],entryPoints:[resolve(root,id+'.js')],bundle:true,write:false,outdir:output,format:'iife',platform:'browser',target:'es2020',minify:false,loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}});
  const js=result.outputFiles.find(file=>file.path.endsWith('.js')).text;
  const extraCss=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
  if (/<\/script/i.test(js)) throw new Error('Script cannot be embedded safely');
  const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${label}</title><style>${css}${extraCss}</style></head><body><main></main><script>${js}</script>${id==='mechanics'?`<!-- KaTeX license\n${katexLicense} -->`:''}</body></html>`;
  const bytes=Buffer.from(html,'utf8'), digest=createHash('sha256').update(bytes).digest('hex');
  let previous=null;
  try { previous=await readFile(resolve(output,id+'.html')); } catch(error) { if(error.code!=='ENOENT')throw error; }
  if(!previous?.equals(bytes)) await writeFile(resolve(output,id+'.html'),bytes);
  let print=null;
  try { print=await readFile(resolve(output,id+'.png')); } catch(error) { if(error.code!=='ENOENT')throw error; }
  if(print && !print.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`${id}: invalid PNG signature`);
  let capture=null;
  try { capture=JSON.parse(await readFile(resolve(output,id+'.capture.json'),'utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
  const printDigest=print?createHash('sha256').update(print).digest('hex'):null;
  const current=captureMatches(capture,digest,printDigest);
  manifest[id]={id,kind:'interactive_document',version:1,label,description,documentSha256:digest,documentBytes:bytes.length,printSha256:current?printDigest:null,printBytes:current?print.length:null,height:500,staticFallback:{type:'text',summary:label,content:defaultState},printCaption:defaultState};
}
await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(output,'sources.json'),JSON.stringify(await sourceHashes(root),null,2)+'\n');
console.log(`Built ${Object.keys(manifest).length} documents; ${Object.values(manifest).filter(item=>item.printSha256).length} matching print captures.`);
