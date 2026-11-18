import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { GlbMascot } from "@/lib/gamification/zyra-glb-mascots";

/** Each viewer owns its parsed scene. Only immutable HTTP assets use the browser cache. */
export async function loadZyraGlbMascot(model: GlbMascot, signal: AbortSignal): Promise<GLTF> {
  const [{ GLTFLoader }, { MeshoptDecoder }, response] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
    fetch(model.src, { signal }),
  ]);
  if (!response.ok) throw new Error("MASCOT_ASSET_UNAVAILABLE");
  const data = await response.arrayBuffer();
  signal.throwIfAborted();
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, "");
  // Parsing cannot be aborted; release a late result instead of attaching it to a new selection.
  if (signal.aborted) {
    disposeMascotObject(gltf.scene);
    signal.throwIfAborted();
  }
  return gltf;
}

/** Geometry, materials, textures and bone textures belong to this scene, never another viewer. */
export function disposeMascotObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    }
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  const closedImages = new Set<unknown>();
  for (const texture of textures) {
    const image: unknown = texture.source?.data;
    if (image && typeof image === "object" && "close" in image && typeof image.close === "function" && !closedImages.has(image)) {
      image.close();
      closedImages.add(image);
    }
    texture.dispose();
  }
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  skeletons.forEach(skeleton => skeleton.dispose());
}
