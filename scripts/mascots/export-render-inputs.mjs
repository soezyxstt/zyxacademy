// Decode web GLBs for Blender review, preserving the exact web geometry and texture pixels.
// These large intermediates are temporary and must not be committed or deployed.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [input, output] = process.argv.slice(2).map((value) => path.resolve(value));
if (!input || !output) throw new Error('Supply the web asset directory and temporary render input directory.');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const catalog = JSON.parse(await readFile(path.join(input, 'runtime-catalog.json'), 'utf8'));
for (const character of catalog.characters) for (const variant of ['full','head']) {
  const relative = character.models[variant];
  const document = await io.read(path.join(input, relative));
  for (const extension of document.getRoot().listExtensionsUsed()) if (extension.extensionName === EXTMeshoptCompression.EXTENSION_NAME) extension.dispose();
  await document.transform(textureCompress({ encoder: sharp, targetFormat: 'png' }));
  await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
  await io.write(path.join(output, relative), document);
  console.log(relative);
}
