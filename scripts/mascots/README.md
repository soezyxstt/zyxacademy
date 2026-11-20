# Zyra web asset preparation

This package builds web derivatives from the recovered `Zyra-Studio-v10.1` source package. It does not rebuild the characters. The source includes the repaired crocodile neck. Keep the recovered GLBs and Blender files as editing sources; deploy only the derived runtime assets.

## Output

`dist/models/` contains all 153 GLBs, preserving the recovered relative paths:

- Four characters, each with full-body and head variants: 8 files.
- 35 clothing/accessory components, each tailored for four characters: 140 files.
- Five action props: 5 files.

`dist/posters/` contains 8 transparent, 640 × 640 WebP renders of the actual web-derived characters. Full-body filenames are `cat.webp`, `tiger.webp`, `rhino.webp`, and `crocodile.webp`; the head variant adds `-head`.

`asset-manifest.json` contains every file's SHA-256 hash, source/output byte count, geometry and animation statistics, required glTF extensions, and verification results.

`web-catalog.json` retains character/variant/component/action mappings and uses the generated character poster paths. Its base path is `/gamification/mascots/v10.1/`. Look thumbnails have `posterPending: true`; their legacy PNG files were not present in the recovered HTML. `runtime-catalog.json` is the untouched recovered metadata for reference, not a deployment-ready thumbnail catalog.

## Reproduce

Requires Node.js, npm, and Blender 4.3 or newer for the poster render. The asset build itself does not require Blender.

```sh
npm ci
node prepare-web-assets.mjs /path/to/Zyra-Studio-v10.1 /path/to/output
node export-render-inputs.mjs /path/to/output /path/to/temporary-render-inputs
blender -b -t 4 --python render-posters.py -- /path/to/temporary-render-inputs /path/to/temporary-rendered-posters
node convert-posters.mjs /path/to/temporary-rendered-posters /path/to/output/posters
node verify-web-assets.mjs /path/to/output
```

To verify the exact decoder that the application ships:

```sh
node verify-web-assets.mjs /path/to/output --decoder=/path/to/app/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js
```

Do not deploy the temporary render inputs or PNG intermediates. They expand the compressed GLBs for Blender, including PNG representations of the WebP pixels, and exist only to render matching posters.

## Runtime contract

- Files use `EXT_meshopt_compression`. Configure the Three.js `GLTFLoader` with `setMeshoptDecoder(MeshoptDecoder)` or use a Drei loader that does so.
- Files with textures use `EXT_texture_webp`, which Three.js `GLTFLoader` supports. Browser WebP support is required.
- Meshes remain skinned, and node names, joint weights, inverse bind matrices, morph targets, animation channels, and keyframe data remain intact.
- Clothing is a separate skinned asset. Rebind it to the matching character's skeleton by bone names and appropriate bind matrices; do not assume a single clothing mesh fits all characters.
- glTF coordinates are Y-up. The recovered Blender metadata describing Z-up/-Y-front refers to authoring coordinates, not the exported glTF coordinate frame.
- Props can require runtime attachment logic. In particular, `giveFlowers` includes a `Paw_L` attachment marker in its extras. Merely loading that prop does not implement the attachment animation.
- Character/wardrobe ownership and LP prices belong to the app's authenticated server catalog, not to these files or their public URLs.

## What this pass changes

The build uses Meshopt's lossless accessor encoding, without quantization, vertex reordering, mesh simplification, or lossy attribute filters. It caps texture dimensions at 1024 pixels, converts albedo maps to WebP quality 90, and converts data maps such as normals and roughness to lossless WebP after resizing.

The exporter normally drops nearly-identity node transforms. The script restores the exact source translation, rotation, and scale values so accumulated skeleton transforms remain unchanged. Numeric comparisons normalize signed zero. Triangle comparisons permit the cyclic corner rotation used by the Meshopt index codec, while preserving triangle order and winding.

Every output is decoded immediately and compared against the input for vertex attributes, mesh topology, morph targets, node hierarchy/extras, skinning, and animation data. The source checksum must match the recovered package index.

Total GLB size: **173,958,500 → 84,115,964 bytes**, a **51.65% reduction**.

| Character | Full model bytes | Triangles |
| --- | ---: | ---: |
| Cat | 3,411,720 | 83,488 |
| Tiger | 5,081,616 | 121,680 |
| Rhino | 8,707,468 | 238,012 |
| Crocodile | 11,641,688 | 295,400 |

## Remaining work

- Triangle counts and draw calls are unchanged. This is a safe initial payload reduction, not a low-poly rebuild or a guarantee of smooth rendering on all phones.
- WebP is decoded to ordinary GPU textures. KTX2/Basis GPU texture compression and lower-detail character variants remain useful follow-up work.
- Test animation, camera framing, clothing fit, and performance on actual target browsers/devices.
- Create the look/component thumbnails when the wardrobe shop is integrated.
- Keep only the active character/items loaded in the 3D view and use posters for grids/small avatars.
- Preserve the crocodile neck and test the arm/jaw clearance again if future work changes topology, skinning, or clips.
