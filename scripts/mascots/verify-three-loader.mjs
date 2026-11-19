/**
 * Parse every packaged GLB through the application's installed Three GLTFLoader.
 * Play each character clip at three times and verify finite skinned vertices.
 * This is a CPU/loader check, not a browser, shader, GPU, or screenshot test.
 * Node has no ImageBitmap: sharp decodes image metadata and the shim supplies
 * width/height only. No texture pixels are uploaded to a GPU in this test.
 * Usage: node verify-three-loader.mjs ASSET_DIRECTORY APPLICATION_DIRECTORY
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const [assetArgument, appArgument] = process.argv.slice(2);
if (!assetArgument || !appArgument) throw new Error('Supply asset and application directories.');
const assets = path.resolve(assetArgument);
const application = path.resolve(appArgument);
let decodedImages = 0;
globalThis.self = globalThis;
globalThis.createImageBitmap = async (blob) => {
  const metadata = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Image has invalid dimensions.');
  decodedImages++;
  return { width: metadata.width, height: metadata.height, close() {} };
};
if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class extends Event {
  constructor(type, values = {}) { super(type); Object.assign(this, values); }
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith('blob:') && !url.startsWith('data:')) throw new Error('Unexpected external resource: ' + url);
  return nativeFetch(input, options);
};

const threeRoot = path.join(application, 'node_modules/three');
const [{ GLTFLoader }, { MeshoptDecoder }, { AnimationMixer, Vector3, REVISION }] = await Promise.all([
  import(pathToFileURL(path.join(threeRoot, 'examples/jsm/loaders/GLTFLoader.js'))),
  import(pathToFileURL(path.join(threeRoot, 'examples/jsm/libs/meshopt_decoder.module.js'))),
  import(pathToFileURL(path.join(threeRoot, 'build/three.module.js'))),
]);
await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const manifest = JSON.parse(await readFile(path.join(assets, 'asset-manifest.json'), 'utf8'));
const results = [];
let clipChecks = 0;
let posedVertexChecks = 0;
for (const entry of manifest.assets) {
  const bytes = await readFile(path.join(assets, entry.path));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await loader.parseAsync(buffer, '');
  if (JSON.stringify(gltf.animations.map((clip) => clip.name)) !== JSON.stringify(entry.animationNames)) throw new Error('Three animation names mismatch: ' + entry.path);
  const skinnedMeshes = [];
  let triangles = 0;
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    if (object.isSkinnedMesh) {
      if (object.skeleton.bones.length !== object.skeleton.boneInverses.length) throw new Error('Invalid skin: ' + entry.path);
      skinnedMeshes.push(object);
    }
  });
  if (triangles !== entry.triangles) throw new Error('Three geometry count mismatch: ' + entry.path);
  let poses = 0;
  if (entry.kind === 'character') {
    const mixer = new AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip);
      action.reset().play();
      for (const time of [0, clip.duration * .5, clip.duration * .99]) {
        mixer.setTime(time);
        gltf.scene.updateMatrixWorld(true);
        for (const mesh of skinnedMeshes) {
          mesh.skeleton.update();
          for (const value of mesh.skeleton.boneMatrices) if (!Number.isFinite(value)) throw new Error('Non-finite bone matrix: ' + entry.path + ':' + clip.name);
          const count = mesh.geometry.attributes.position.count;
          for (const index of [0, Math.floor(count / 2), count - 1]) {
            const point = mesh.getVertexPosition(index, new Vector3());
            mesh.localToWorld(point);
            if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Non-finite skinned vertex: ' + entry.path + ':' + clip.name);
            posedVertexChecks++;
          }
        }
        poses++;
      }
      clipChecks++;
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
  }
  results.push({ path: entry.path, triangles, skinnedMeshes: skinnedMeshes.length, clips: gltf.animations.length, checkedPoses: poses });
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}
console.log(JSON.stringify({
  ok: true, threeRevision: REVISION, assetCount: results.length,
  characterClipsChecked: clipChecks, posedVertexChecks, decodedImages,
  imageShim: 'sharp validates actual embedded image format/dimensions; ImageBitmap returns dimensions only',
  gpuRender: false, browserValidation: false,
  assets: results,
}, null, 2));
