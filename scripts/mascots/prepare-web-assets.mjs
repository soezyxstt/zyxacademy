/**
 * Build web GLB derivatives from the recovered Zyra Studio package.
 * Usage: npm ci && node prepare-web-assets.mjs SOURCE_PACKAGE OUTPUT_DIRECTORY [--limit=N]
 * Does not simplify meshes, quantize vertices, rename nodes, remove clips, or change skinning.
 * Texture dimensions are capped at 1024 px. Color textures use WebP quality 90;
 * normal/roughness textures use lossless WebP to avoid chroma artifacts.
 * EXT_meshopt_compression encodes unchanged accessor data (no lossy filter).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [sourceArgument, outputArgument, ...flags] = process.argv.slice(2);
if (!sourceArgument || !outputArgument) throw new Error('Supply source package and output directory.');
const source = path.resolve(sourceArgument);
const output = path.resolve(outputArgument);
if (source === output || output.startsWith(source + path.sep)) throw new Error('Keep web output separate from the source package.');
const limit = Number(flags.find((flag) => flag.startsWith('--limit='))?.split('=')[1] ?? Infinity);
const index = JSON.parse(await readFile(path.join(source, 'asset-index.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(source, 'runtime-catalog.json'), 'utf8'));
await mkdir(output, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
sharp.concurrency(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const arrayHash = (array) => {
  // Sparse glTF encoding may write -0 as +0. They have the same numeric value.
  const canonical = array instanceof Float32Array || array instanceof Float64Array
    ? array.map((value) => value === 0 ? 0 : value) : array;
  return hash(Buffer.from(canonical.buffer, canonical.byteOffset, canonical.byteLength));
};

function preserveNodeTransforms(bytes, nodes) {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  if (json.nodes.length !== nodes.length) throw new Error('Unexpected node ordering after GLB write.');
  for (let i = 0; i < nodes.length; i++) {
    if ((json.nodes[i].name ?? '') !== nodes[i].name) throw new Error('Unexpected node name after GLB write.');
    // glTF Transform omits nearly-identity TRS values. Restore exact source values
    // so the export cannot subtly change bind poses accumulated through a skeleton.
    for (const field of ['translation', 'rotation', 'scale']) json.nodes[i][field] = nodes[i][field];
    delete json.nodes[i].matrix;
  }
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(paddedJson);
  const binaryChunks = buffer.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.write('glTF', 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + paddedJson.length + binaryChunks.length, 8);
  header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, paddedJson, binaryChunks]);
}

function indexHash(accessor, mode) {
  const indices = accessor?.getArray();
  if (!indices) return null;
  // Triangle compression may rotate a triangle cyclically; winding and triangle order
  // must remain identical. Normalize only that representation detail for comparison.
  if (mode !== 4) return arrayHash(indices);
  const canonical = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    const start = triangle.indexOf(Math.min(...triangle));
    for (let k = 0; k < 3; k++) canonical[i + k] = triangle[(start + k) % 3];
  }
  return arrayHash(canonical);
}

function accessorSnapshot(accessor) {
  return accessor ? {
    type: accessor.getType(), componentType: accessor.getComponentType(),
    count: accessor.getCount(), normalized: accessor.getNormalized(),
    sha256: arrayHash(accessor.getArray()),
  } : null;
}

function invariants(document) {
  const root = document.getRoot();
  const nodes = root.listNodes();
  const materials = root.listMaterials();
  const meshes = root.listMeshes();
  const skins = root.listSkins();
  return {
    assetExtras: root.getAsset().extras ?? null,
    nodes: nodes.map((node) => ({
      name: node.getName(), extras: node.getExtras(),
      translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
      weights: node.getWeights(), children: node.listChildren().map((child) => nodes.indexOf(child)),
      mesh: meshes.indexOf(node.getMesh()), skin: skins.indexOf(node.getSkin()),
    })),
    meshes: meshes.map((mesh) => ({
      name: mesh.getName(), extras: mesh.getExtras(), weights: mesh.getWeights(),
      primitives: mesh.listPrimitives().map((primitive) => ({
        mode: primitive.getMode(), material: materials.indexOf(primitive.getMaterial()),
        indices: indexHash(primitive.getIndices(), primitive.getMode()),
        attributes: Object.fromEntries(primitive.listSemantics().sort().map((semantic) => [semantic, accessorSnapshot(primitive.getAttribute(semantic))])),
        targets: primitive.listTargets().map((target) => Object.fromEntries(target.listSemantics().sort().map((semantic) => [semantic, accessorSnapshot(target.getAttribute(semantic))]))),
      })),
    })),
    skins: skins.map((skin) => ({
      name: skin.getName(), joints: skin.listJoints().map((joint) => nodes.indexOf(joint)),
      skeleton: nodes.indexOf(skin.getSkeleton()), inverseBindMatrices: accessorSnapshot(skin.getInverseBindMatrices()),
    })),
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(), extras: animation.getExtras(),
      channels: animation.listChannels().map((channel) => ({
        node: nodes.indexOf(channel.getTargetNode()), path: channel.getTargetPath(),
        interpolation: channel.getSampler().getInterpolation(),
        input: accessorSnapshot(channel.getSampler().getInput()), output: accessorSnapshot(channel.getSampler().getOutput()),
      })),
    })),
  };
}

function statistics(document) {
  const root = document.getRoot();
  let triangles = 0, vertices = 0, primitives = 0, morphTargets = 0;
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    primitives++;
    vertices += primitive.getAttribute('POSITION')?.getCount() ?? 0;
    if (primitive.getMode() === 4) triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3;
    morphTargets += primitive.listTargets().length;
  }
  return { triangles, vertices, primitives, morphTargets, meshes: root.listMeshes().length,
    nodes: root.listNodes().length, skins: root.listSkins().length,
    animationNames: root.listAnimations().map((animation) => animation.getName()),
    textures: root.listTextures().map((texture) => ({ name: texture.getName(), mimeType: texture.getMimeType(), size: texture.getSize(), bytes: texture.getImage()?.byteLength ?? 0 })),
  };
}

const assets = [];
for (const entry of index.assets.slice(0, limit)) {
  const relative = entry.path;
  if (path.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error('Unsafe source path: ' + relative);
  const inputBytes = await readFile(path.join(source, relative));
  if (hash(inputBytes) !== entry.sha256) throw new Error('Source checksum mismatch: ' + relative);
  const document = await io.readBinary(inputBytes);
  const before = invariants(document);
  await document.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], pattern: /Albedo|BaseColor|Color/i, quality: 90, effort: 75 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], pattern: /^(?!.*(?:Albedo|BaseColor|Color)).*$/i, lossless: true, effort: 75 }),
  );
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const outputBytes = preserveNodeTransforms(await io.writeBinary(document), before.nodes);
  const roundtrip = await io.readBinary(outputBytes);
  const after = invariants(roundtrip);
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(before)), JSON.parse(JSON.stringify(after)))) {
    await writeFile(path.join(output, 'invariant-failure.json'), JSON.stringify({ path: relative, before, after }, null, 2));
    throw new Error('Geometry/rig/animation invariant changed: ' + relative);
  }
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, outputBytes);
  const stats = statistics(roundtrip);
  const record = {
    path: relative, kind: entry.kind, character: entry.character ?? null, variant: entry.variant ?? null,
    sourceBytes: inputBytes.byteLength, bytes: outputBytes.byteLength,
    sourceSha256: entry.sha256, sha256: hash(outputBytes),
    extensionsRequired: roundtrip.getRoot().listExtensionsRequired().map((extension) => extension.extensionName),
    verified: { geometry: true, nodeHierarchy: true, skinning: true, morphTargets: true, animation: true },
    ...stats,
  };
  assets.push(record);
  console.log(JSON.stringify({ path: relative, sourceBytes: record.sourceBytes, bytes: record.bytes, savedPercent: Math.round(100*(1-record.bytes/record.sourceBytes)), triangles: stats.triangles }));
}
const manifest = {
  schemaVersion: 1,
  release: '10.1-web.1',
  sourcePackage: 'Zyra-Studio-v10.1',
  sourceIndexSha256: hash(await readFile(path.join(source, 'asset-index.json'))),
  optimization: {
    compression: 'EXT_meshopt_compression, lossless accessor data; no quantization/filter/simplification',
    textures: 'EXT_texture_webp, maximum 1024px, albedo quality90, data maps lossless after resizing',
    preserved: ['triangle topology and winding', 'vertex attribute values', 'morph targets', 'joint weights', 'inverse bind matrices', 'node names and hierarchy', 'animation names, channels and keyframes', 'crocodile neck geometry'],
    limitations: ['Triangle counts and draw calls are unchanged.', 'WebP textures decode to ordinary GPU textures; this is not KTX2 GPU compression.', 'Visual comparison and target-device performance testing remain required.'],
  },
  assetCount: assets.length,
  sourceTotalBytes: assets.reduce((sum, asset) => sum + asset.sourceBytes, 0),
  totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  assets,
};
await writeFile(path.join(output, 'asset-manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
await writeFile(path.join(output, 'runtime-catalog.json'), JSON.stringify(catalog, null, 2)+'\n');
const webCatalog = structuredClone(catalog);
webCatalog.version = manifest.release;
webCatalog.sourceCatalogVersion = catalog.version;
webCatalog.assetBasePath = '/gamification/mascots/v10.1/';
for (const character of webCatalog.characters) {
  character.poster = { full: `posters/${character.id}.webp`, head: `posters/${character.id}-head.webp` };
  delete character.builder;
}
for (const item of webCatalog.items) {
  delete item.poster;
  delete item.posters;
  delete item.source;
  delete item.builder;
  item.posterPending = true;
}
await writeFile(path.join(output, 'web-catalog.json'), JSON.stringify(webCatalog, null, 2)+'\n');
console.log(JSON.stringify({ complete: true, assetCount: assets.length, sourceTotalBytes: manifest.sourceTotalBytes, totalBytes: manifest.totalBytes }));
