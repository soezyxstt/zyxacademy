import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createZyraMascotModel, MASCOT_MODEL_KEYS } from "../../lib/gamification/zyra-mascot-models";
import { ZYRA_AVATARS } from "../../lib/gamification/zyra-cosmetics";

for(const key of MASCOT_MODEL_KEYS) test(`${key}: closed, outward-facing 3D solids within the mesh budget`,()=>{
  const model=createZyraMascotModel(key);
  const names=new Set<string>();
  let triangles=0;
  for(const mesh of model.meshes) {
    expect(names.has(mesh.name)).toBe(false);names.add(mesh.name);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3)).toBe(true);
    expect(mesh.scale.every(n=>n>0&&Number.isFinite(n))).toBe(true);
    for(let axis=0;axis<3;axis++) {
      const values=mesh.positions.filter((_,i)=>i%3===axis);
      expect(Math.max(...values)-Math.min(...values)).toBeGreaterThan(.0001);
    }
    const edges=new Map<string,number>();let volume=0;
    for(let i=0;i<mesh.indices.length;i+=3) {
      const ids=mesh.indices.slice(i,i+3);
      for(let j=0;j<3;j++) {
        const a=ids[j],b=ids[(j+1)%3],edge=a<b?`${a}:${b}`:`${b}:${a}`;
        edges.set(edge,(edges.get(edge)||0)+1);
      }
      const [a,b,c]=ids.map(j=>mesh.positions.slice(j*3,j*3+3));
      volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    }
    // Every edge belongs to exactly two triangles; signed volume catches inverted winding.
    expect([...edges.values()].every(count=>count===2)).toBe(true);
    expect(volume).toBeGreaterThan(0);
    triangles+=mesh.indices.length/3;
  }
  expect(model.meshes.length).toBeLessThanOrEqual(80);
  expect(triangles).toBeLessThan(60000);
  expect(model.meshes.some(m=>m.name.includes("eye"))).toBe(true);
  expect(model.meshes.some(m=>m.name.includes("journal")||m.name.includes("compass"))).toBe(true);
});

test("ten procedural models preserve the original IDs and valid local poster fallbacks",()=>{
  const procedural = ZYRA_AVATARS.filter(avatar => avatar.modelKey);
  expect(procedural).toHaveLength(10);
  expect(new Set(procedural.map(a=>a.modelKey)).size).toBe(10);
  for(const avatar of procedural) {
    expect(avatar.modelKey && MASCOT_MODEL_KEYS.includes(avatar.modelKey)).toBe(true);
    expect(existsSync(`public${avatar.src}`)).toBe(true);
  }
  for(const key of ["komodo","jalak","harimau","orangutan"] as const) {
    const avatar=ZYRA_AVATARS.find(a=>a.id===`zyra-avatar-${key}`);
    expect(avatar?.modelKey).toBe(key);
    expect(existsSync(`public/gamification/collections/mascots/${key}-v37.webp`)).toBe(true);
    expect(existsSync(`public/gamification/collections/mascots/${key}-v37.png`)).toBe(true);
  }
});

test("species have distinguishing solid anatomy, not palette-only variants",()=>{
  const signatures={komodo:"long-monitor-muzzle",jalak:"crest-0",harimau:"forehead-stripe-0",orangutan:"cheek-lock-1-0",anoa:"anoa-horn-1",bekantan:"proboscis",cenderawasih:"paradise-plume-0",penyu:"shell-dome",badak:"single-javan-horn",elang:"crown-feather-0"};
  for(const key of MASCOT_MODEL_KEYS) expect(createZyraMascotModel(key).meshes.some(m=>m.name===signatures[key])).toBe(true);
  expect(()=>createZyraMascotModel("unknown" as never)).toThrow();
});
