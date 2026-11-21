import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ZYRA_GLB_MASCOTS, getZyraGlbMascot, getZyraGlbSuitSrc, resolveMascotAnimation } from "../../lib/gamification/zyra-glb-mascots";
import { ZYRA_AVATARS } from "../../lib/gamification/zyra-cosmetics";
import { COSMETIC_CATALOG } from "../../lib/gamification/catalog";

const root = "public/gamification/mascots/v10.1";
const manifest = JSON.parse(readFileSync(`${root}/asset-manifest.json`, "utf8")) as {
  assetCount: number; totalBytes: number;
  assets: { path: string; bytes: number; sha256: string; animationNames: string[]; kind: string }[];
};

function readGlb(bytes: Buffer) {
  expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  expect(bytes.toString("ascii", 16, 20)).toBe("JSON");
  return JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12))) as {
    buffers?: { uri?: string }[]; images?: { uri?: string; bufferView?: number }[];
    animations?: { name?: string }[]; skins?: unknown[]; asset: { extras?: Record<string, unknown> };
  };
}

test("all 153 web assets match their hashes and keep embedded dependencies", () => {
  expect(manifest.assets).toHaveLength(153);
  expect(manifest.assetCount).toBe(manifest.assets.length);
  expect(new Set(manifest.assets.map(asset => asset.path)).size).toBe(153);
  let total = 0;
  for (const asset of manifest.assets) {
    expect(asset.path.startsWith("models/")).toBe(true);
    expect(asset.path).not.toContain("..");
    const bytes = readFileSync(path.join(root, asset.path));
    total += bytes.length;
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    const json = readGlb(bytes);
    expect((json.buffers ?? []).every(buffer => !buffer.uri)).toBe(true);
    expect((json.images ?? []).every(image => !image.uri && typeof image.bufferView === "number")).toBe(true);
    expect((json.animations ?? []).map(clip => clip.name)).toEqual(asset.animationNames);
  }
  expect(total).toBe(manifest.totalBytes);
});

test("each purchasable character resolves both models, both posters and only supported preview clips", () => {
  expect(ZYRA_GLB_MASCOTS).toHaveLength(4);
  for (const model of ZYRA_GLB_MASCOTS) {
    expect(ZYRA_AVATARS.filter(avatar => avatar.glbCharacter === model.character)).toHaveLength(1);
    const json = readGlb(readFileSync(`public${model.src}`));
    expect(json.skins?.length).toBeGreaterThan(0);
    expect(json.animations?.map(clip => clip.name).sort()).toEqual([...model.animations].sort());
    expect(model.previewAnimations.every(name => model.animations.includes(name))).toBe(true);
    expect(existsSync(`public${model.headSrc}`)).toBe(true);
    expect(existsSync(`public${model.poster}`)).toBe(true);
    expect(existsSync(`${root}/posters/${model.character}-head.webp`)).toBe(true);
    expect(resolveMascotAnimation(model, "../../untrusted.glb")).toBe("idle");
    expect(resolveMascotAnimation(model, "happy")).toBe("happy");
    // Prop-dependent clips stay out of this initial viewer.
    expect(resolveMascotAnimation(model, "giveFlowers")).toBe("idle");
  }
  expect(getZyraGlbMascot("unknown")).toBeUndefined();
  expect(getZyraGlbMascot(null)).toBeUndefined();
});

test("the crocodile asset preserves the repaired neck provenance", () => {
  const json = readGlb(readFileSync(`${root}/models/crocodile-full.glb`));
  expect(json.asset.extras?.zyraNeckRepair).toMatchObject({ version: "10.1", method: "skinned_neck_bridge" });
});

test("all 35 wardrobe concepts retain a valid file for each of the four characters", () => {
  const catalog = JSON.parse(readFileSync(`${root}/web-catalog.json`, "utf8")) as {
    components: { id: string; slot: string; assets: Record<string, string> }[];
  };
  expect(catalog.components).toHaveLength(35);
  for (const item of catalog.components) for (const model of ZYRA_GLB_MASCOTS) {
    const file = item.assets[model.character];
    expect(file).toBeTruthy();
    expect(manifest.assets.some(asset => asset.path === file)).toBe(true);
  }
  const outfits = catalog.components.filter(item => item.slot === "outfit");
  const suits = COSMETIC_CATALOG.filter(item => item.slot === "pet_suit" && item.active);
  expect(suits.map(item => item.id).sort()).toEqual(outfits.map(item => `pet-suit-${item.id}`).sort());
  for (const outfit of outfits) for (const { character } of ZYRA_GLB_MASCOTS) {
    expect(getZyraGlbSuitSrc(character, outfit.id)).toBe(`/gamification/mascots/v10.1/${outfit.assets[character]}`);
  }
  expect(getZyraGlbSuitSrc("cat", "none")).toBeUndefined();
  expect(getZyraGlbSuitSrc("cat", "../base-full")).toBeUndefined();
});
