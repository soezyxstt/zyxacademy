import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { getZyraGlbSuitSrc, type GlbMascot } from "@/lib/gamification/zyra-glb-mascots";

/** Each viewer owns its parsed scene. Only immutable HTTP assets use the browser cache. */
async function loadAsset(src: string, signal: AbortSignal): Promise<GLTF> {
  const [{ GLTFLoader }, { MeshoptDecoder }, response] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
    fetch(src, { signal, credentials: "omit" }),
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

export async function loadZyraGlbMascot(model: GlbMascot, signal: AbortSignal, suit = "none", prop: "cycle" | "giveFlowers" | null = null): Promise<GLTF> {
  const body = await loadAsset(model.src, signal);
  const suitSrc = getZyraGlbSuitSrc(model.character, suit);
  const base = model.src.slice(0, model.src.lastIndexOf("/") + 1);
  try {
    if (suitSrc) {
      const outfit = await loadAsset(suitSrc, signal);
      const bones = new Map<string, THREE.Bone>();
      body.scene.traverse(node => { if (node instanceof THREE.Bone) bones.set(node.name, node); });
      body.scene.add(outfit.scene);
      outfit.scene.traverse(mesh => {
        if (!(mesh instanceof THREE.SkinnedMesh)) return;
        const skeleton = mesh.skeleton;
        skeleton.bones = skeleton.bones.map(bone => bones.get(bone.name) ?? bone);
      });
    }
    if (prop && ((prop === "cycle" && model.character === "cat") || (prop === "giveFlowers" && model.character === "crocodile"))) {
      const bike = await loadAsset(base + "props/" + prop + ".glb", signal);
      bike.scene.userData.mascotProp = prop;
      body.scene.add(bike.scene);
      const rider = body.animations.find(clip => clip.name === prop);
      const wheels = bike.animations.find(clip => clip.name === prop);
      if (rider && wheels) rider.tracks.push(...wheels.tracks);
    }
    return body;
  } catch (error) {
    disposeMascotObject(body.scene);
    throw error;
  }
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
