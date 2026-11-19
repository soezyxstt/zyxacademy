/** Verify hashes, decode all GLBs, and check manifest geometry/animation counts.
 * node verify-web-assets.mjs OUTPUT_DIRECTORY [--decoder=/path/to/meshopt_decoder.module.js]
 * The optional decoder path tests the exact Three.js decoder shipped by the app.
 */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder as DefaultDecoder } from 'meshoptimizer';
const [rootArgument,...flags]=process.argv.slice(2);
if (!rootArgument) throw new Error('Supply an asset output directory.');
const root=path.resolve(rootArgument);
const decoderPath=flags.find((flag)=>flag.startsWith('--decoder='))?.slice('--decoder='.length);
const decoder=decoderPath ? (await import(pathToFileURL(path.resolve(decoderPath)))).MeshoptDecoder : DefaultDecoder;
await decoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':decoder});
const manifest=JSON.parse(await readFile(path.join(root,'asset-manifest.json'),'utf8'));
if (manifest.assetCount!==manifest.assets.length) throw new Error('Manifest count mismatch.');
const verified=[];
for(const entry of manifest.assets) {
  const bytes=await readFile(path.join(root,entry.path));
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==entry.bytes || sha256!==entry.sha256) throw new Error('Integrity failure: '+entry.path);
  const doc=await io.readBinary(bytes);
  const documentRoot=doc.getRoot();
  const triangles=documentRoot.listMeshes().flatMap((mesh)=>mesh.listPrimitives()).reduce((sum,primitive)=>sum+(primitive.getMode()===4?(primitive.getIndices()?.getCount()??primitive.getAttribute('POSITION').getCount())/3:0),0);
  const animations=documentRoot.listAnimations().map((animation)=>animation.getName());
  if(triangles!==entry.triangles || JSON.stringify(animations)!==JSON.stringify(entry.animationNames) || documentRoot.listNodes().length!==entry.nodes || documentRoot.listSkins().length!==entry.skins) throw new Error('Decoded content mismatch: '+entry.path);
  verified.push(entry.path);
}
const catalog=JSON.parse(await readFile(path.join(root,'web-catalog.json'),'utf8'));
for(const character of catalog.characters) for(const poster of Object.values(character.poster)) await readFile(path.join(root,poster));
console.log(JSON.stringify({ok:true,assetCount:verified.length,totalBytes:manifest.totalBytes,characters:catalog.characters.map((c)=>c.id),decoder:decoderPath??'meshoptimizer package',posters:catalog.characters.length*2},null,2));
