/** Original, texture-free Indonesian wildlife sculptures. Units are metres.
 * Closed curved surfaces, not image planes. This data can be passed to a GLB exporter.
 * Keep this module free of Three so mesh integrity can be tested without WebGL.
 */
export const MASCOT_MODEL_KEYS = ["komodo", "jalak", "harimau", "orangutan", "anoa", "bekantan", "cenderawasih", "penyu", "badak", "elang"] as const;
export type MascotModelKey = (typeof MASCOT_MODEL_KEYS)[number];
type Vec3 = [number, number, number];
export type MascotMesh = {
  name: string; positions: number[]; indices: number[]; color: string;
  position: Vec3; rotation: Vec3; scale: Vec3; roughness: number; metalness: number;
  motion?: "blink" | "tail" | "wing";
};
export type MascotModel = { key: MascotModelKey; meshes: MascotMesh[] };
type Ring = [number, number, number, number?]; // y, x radius, z radius, z centre
const cream = "#fff0d2", ink = "#26343b", gold = "#dfa83e", teal = "#287e7a";
const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const mul = (a: Vec3, n: number): Vec3 => [a[0]*n, a[1]*n, a[2]*n];
const sub = (a: Vec3, b: Vec3): Vec3 => add(a, mul(b,-1));
const unit = (a: Vec3): Vec3 => mul(a,1/(Math.hypot(...a)||1));
const cross = (a: Vec3,b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// Catmull-Rom interpolation provides continuous sculpted silhouettes.
function curve(points: Vec3[], steps = 24): Vec3[] {
  return Array.from({length:steps+1},(_,i) => {
    const t=i/steps*(points.length-1), k=Math.min(Math.floor(t),points.length-2), f=t-k;
    const p0=points[Math.max(0,k-1)],p1=points[k],p2=points[k+1],p3=points[Math.min(points.length-1,k+2)];
    return [0,1,2].map(a => .5*((2*p1[a])+(-p0[a]+p2[a])*f+(2*p0[a]-5*p1[a]+4*p2[a]-p3[a])*f*f+(-p0[a]+3*p1[a]-3*p2[a]+p3[a])*f*f*f)) as Vec3;
  });
}
function surface(rings: Vec3[][]): Pick<MascotMesh,"positions"|"indices"> {
  const positions=rings.flat(2), indices:number[]=[], sides=rings[0].length;
  for(let y=0;y<rings.length-1;y++) for(let x=0;x<sides;x++) {
    const a=y*sides+x,b=y*sides+(x+1)%sides,c=a+sides,d=b+sides;
    indices.push(a,c,b,b,c,d);
  }
  // Separate centre vertices close both ends, including truncated profiles.
  for(const [row,reverse] of [[0,true],[rings.length-1,false]] as const) {
    const centre=mul(rings[row].reduce(add,[0,0,0]),1/sides), index=positions.length/3;
    positions.push(...centre);
    for(let x=0;x<sides;x++) {
      const a=row*sides+x,b=row*sides+(x+1)%sides;
      indices.push(index, reverse?a:b, reverse?b:a);
    }
  }
  return {positions,indices};
}
export function createZyraMascotModel(key: MascotModelKey): MascotModel {
  if (!MASCOT_MODEL_KEYS.includes(key)) throw new Error("Unknown mascot model");
  const meshes:MascotMesh[]=[];
  function mesh(name:string, geometry:Pick<MascotMesh,"positions"|"indices">,color:string,position:Vec3=[0,0,0],rotation:Vec3=[0,0,0],motion?:MascotMesh["motion"]) {
    const result={name,...geometry,color,position,rotation,scale:[1,1,1] as Vec3,roughness:.48,metalness:0,motion};
    meshes.push(result); return result;
  }
  function profile(name:string, rings:Ring[], color:string, position:Vec3=[0,0,0], rotation:Vec3=[0,0,0]) {
    // Interpolate each radius and the fore/aft offset independently.
    const a=curve(rings.map(r=>[r[1],r[0],r[2]]),20), b=curve(rings.map(r=>[0,r[0],r[3]||0]),20);
    return mesh(name,surface(a.map((r,i)=>Array.from({length:24},(_,j)=>{
      const t=j/24*Math.PI*2;return [Math.max(.002,r[0])*Math.cos(t),r[1],Math.max(.002,r[2])*Math.sin(t)+b[i][2]] as Vec3;
    }))),color,position,rotation);
  }
  function oval(name:string,position:Vec3,scale:Vec3,color:string,rotation:Vec3=[0,0,0],motion?:MascotMesh["motion"]) {
    const shape=surface(Array.from({length:15},(_,i)=>Array.from({length:20},(_,j)=>{
      const v=.001+(Math.PI-.002)*i/14,u=2*Math.PI*j/20;
      return [Math.sin(v)*Math.cos(u),-Math.cos(v),Math.sin(v)*Math.sin(u)] as Vec3;
    })));
    const m=mesh(name,shape,color,position,rotation,motion);m.scale=scale;return m;
  }
  function sweep(name:string, points:Vec3[], radius:number, color:string, taper=.25, flatten=1, motion?:MascotMesh["motion"]) {
    const path=curve(points,18),origin=points[0];
    const rings=path.map((p,i)=>{
      const tangent=unit(sub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));
      const ref:Vec3=Math.abs(tangent[1])>.9?[1,0,0]:[0,1,0];
      const u=unit(cross(ref,tangent)),v=cross(u,tangent),t=i/(path.length-1);
      const r=radius*(1-(1-taper)*t)*Math.min(1,.12+i*.65,.12+(path.length-1-i)*.65);
      return Array.from({length:12},(_,j)=>sub(add(p,add(mul(u,Math.cos(j/12*Math.PI*2)*r),mul(v,Math.sin(j/12*Math.PI*2)*r*flatten))),origin));
    });
    return mesh(name,surface(rings),color,origin,[0,0,0],motion);
  }
  function eyes(y:number,z:number,spread:number,mask?:string) {
    for(const s of [-1,1]) {
      if(mask) oval(`eye-mask-${s}`,[s*spread,y,z-.025],[.155,.19,.08],mask);
      oval(`eye-white-${s}`,[s*spread,y,z+.025],[.093,.112,.056],cream);
      oval(`pupil-${s}`,[s*spread+.015,y+.006,z+.077],[.049,.066,.024],ink,[0,0,0],"blink");
      oval(`eye-light-${s}`,[s*spread+.002,y+.029,z+.098],[.016,.019,.008],"#ffffff",[0,0,0],"blink");
      sweep(`brow-${s}`,[[s*spread-.095,y+.15,z],[s*spread,y+.17,z+.012],[s*spread+.085,y+.14,z]],.018,ink);
    }
  }
  function book(position:Vec3, color=teal) {
    // Thick rounded page block and individual raised bindings.
    oval("field-journal-cover",position,[.24,.29,.065],color,[0,0,-.12]);
    oval("field-journal-pages",add(position,[.015,0,.047]),[.195,.245,.027],cream,[0,0,-.12]);
    sweep("journal-binding",[add(position,[-.17,-.21,.065]),add(position,[-.195,0,.065]),add(position,[-.22,.2,.065])],.025,gold);
    for(let i=0;i<3;i++) sweep(`journal-line-${i}`,[add(position,[-.1,.08-i*.065,.079]),add(position,[.11,.06-i*.065,.079])],.007,"#aa9976");
  }
  function scarf(y:number,width:number,color=teal) {
    sweep("scarf-collar",[[-width,y,-.08],[-width,y,.23],[0,y-.06,.43],[width,y,.23],[width,y,-.08]],.075,color,1);
    sweep("scarf-fold",[[.12,y-.04,.45],[.2,y-.26,.49],[.12,y-.4,.46]],.075,color,.6,.45);
    sweep("scarf-stitch",[[.12,y-.25,.529],[.14,y-.34,.505]],.009,gold);
  }
  function feet(color:string,spread=.29,y=.23) {
    for(const s of [-1,1]) {
      sweep(`leg-${s}`,[[s*spread,.78,0],[s*spread*1.1,.48,.02],[s*spread,y,.11]],.16,color,.8);
      oval(`foot-${s}`,[s*spread,y,.22],[.2,.13,.3],color);
      for(let i=0;i<3;i++) oval(`toe-${s}-${i}`,[s*spread+(i-1)*.09,y,.46],[.034,.04,.075],cream);
    }
  }
  function leaf(name:string,points:Vec3[],width:number,color:string,motion?:MascotMesh["motion"]) {
    return sweep(name,points,width,color,.04,.22,motion);
  }
  const bird=key==="jalak"||key==="cenderawasih"||key==="elang";
  if(bird) {
    const myna=key==="jalak", eagle=key==="elang", body=myna?"#f4ead8":eagle?"#855136":"#913c30";
    profile("pear-shaped-breast",[[.35,.09,.1],[.55,.32,.24],[.95,.44,.34],[1.25,.34,.29],[1.5,.2,.21]],body);
    profile("neck-and-crown",[[1.12,.19,.17],[1.45,.27,.24],[1.75,.36,.29],[2.02,.26,.23],[2.12,.025,.035]],myna?cream:eagle?"#e8d6ac":"#e8bc49");
    for(const s of [-1,1]) {
      sweep(`bird-leg-${s}`,[[s*.18,.48,0],[s*.18,.24,.03],[s*.18,.15,.12]],.048,gold,.85);
      for(let i=-1;i<=1;i++) sweep(`bird-toe-${s}-${i}`,[[s*.18,.15,.09],[s*.18+i*.07,.11,.24],[s*.18+i*.09,.1,.34]],.025,gold,.3);
      for(let i=0;i<4;i++) leaf(`wing-feather-${s}-${i}`,[[s*.29,1.31,.01],[s*(.55+i*.045),1.02-i*.035,.04],[s*(.46+i*.07),.61-i*.04,-.01]],.15,myna?(i>1?ink:cream):eagle?(i%2?"#ac7542":"#654331"):(i%2?"#da8b2b":"#a63f2c"),"wing");
    }
    // Beaks are curved solid sweeps with depth and hooked tips.
    sweep("upper-beak",[[0,1.72,.22],[0,1.68,.46],[0,1.57,eagle?.62:.58]],eagle?.145:.105,eagle?gold:"#77745d",.04,.7);
    sweep("lower-beak",[[0,1.57,.24],[0,1.54,.43],[0,1.56,.53]],.075,"#b2a17a",.05,.45);
    eyes(1.8,.259,.18,myna?"#439fc1":undefined);
    if(myna) for(let i=-1;i<=1;i++) leaf(`crest-${i}`,[[i*.08,2,.0],[i*.13,2.28,-.08],[i*.16,2.27,-.24]],.085,cream);
    if(eagle) for(let i=-1;i<=1;i++) leaf(`crown-feather-${i}`,[[i*.11,1.99,-.04],[i*.1,2.2,-.12],[i*.09,2.27,-.16]],.075,"#573a2c");
    if(!myna&&!eagle) {
      for(let i=-3;i<=3;i++) leaf(`paradise-plume-${i}`,[[i*.055,.69,-.21],[i*.19,1.1,-.41],[i*.23,1.9,-.48],[i*.24,2.25-Math.abs(i)*.15,-.35]],.14,i%2?"#e4a62e":"#f4d681","tail");
      for(const s of [-1,1]) sweep(`ribbon-tail-${s}`,[[s*.08,.58,-.2],[s*.5,.27,-.3],[s*.7,.55,-.23]],.022,ink,.35,1,"tail");
    } else for(let i=-1;i<=1;i++) leaf(`tail-feather-${i}`,[[i*.09,.6,-.17],[i*.15,.4,-.46],[i*.18,.3,-.67]],.13,myna?ink:"#54382c","tail");
    scarf(1.32,.28,eagle?"#427b7a":"#bd583e");
    // Ornithologist's brass compass, with a raised needle.
    oval("compass-case",[.03,.91,.355],[.13,.13,.044],gold);
    oval("compass-face",[.03,.91,.39],[.103,.103,.012],cream);
    leaf("compass-needle",[[.03,.83,.411],[.045,.91,.42],[.03,.99,.411]],.025,teal);
  } else if(key==="penyu") {
    profile("shell-dome",[[.36,.06,.08],[.52,.42,.29],[.9,.57,.39],[1.23,.45,.31],[1.48,.08,.08]],"#42776d",[0,0,-.1]);
    profile("plastron",[[.43,.03,.03],[.6,.33,.075],[1,.39,.09],[1.32,.2,.05],[1.38,.02,.01]],"#e8c588",[0,0,.25]);
    // Raised carapace seams wrap around the shell, visible when orbiting.
    for(let i=0;i<5;i++) sweep(`shell-ridge-${i}`,[[0,.5+i*.16,-.43],[.32,.56+i*.14,-.4],[.48,.62+i*.12,-.22]],.025,"#b6ba76",.8);
    for(const s of [-1,1]) {
      leaf(`front-flipper-${s}`,[[s*.37,1.16,0],[s*.68,.91,.12],[s*.82,.59,.25],[s*.71,.47,.28]],.2,"#79a78c","wing");
      leaf(`hind-flipper-${s}`,[[s*.3,.56,-.04],[s*.43,.28,.06],[s*.38,.17,.27]],.15,"#79a78c");
    }
    sweep("turtle-neck",[[0,1.23,.06],[0,1.48,.22],[0,1.63,.32]],.2,"#79a78c",.9);
    oval("turtle-head",[0,1.73,.3],[.34,.28,.33],"#83b196");
    oval("turtle-snout",[0,1.62,.55],[.21,.12,.14],"#b0c9a0");
    eyes(1.79,.566,.17);
    sweep("turtle-smile",[[-.12,1.6,.66],[0,1.57,.688],[.12,1.6,.66]],.012,teal);
    scarf(1.39,.21,"#ce7941");book([.09,.85,.41]);
  } else if(key==="komodo") {
    profile("komodo-torso",[[.3,.13,.14],[.6,.39,.3],[1.02,.39,.28],[1.31,.25,.21],[1.57,.19,.18]],"#64907d");
    profile("komodo-throat",[[.66,.1,.04],[.94,.24,.06],[1.23,.16,.055],[1.48,.1,.025]],"#b3c69b",[0,0,.26]);
    sweep("komodo-tail",[[0,.52,-.17],[.49,.36,-.3],[.8,.38,-.12],[.87,.58,.18]],.22,"#64907d",.025,1,"tail");
    oval("komodo-skull",[0,1.7,.04],[.34,.31,.3],"#64907d");
    profile("long-monitor-muzzle",[[-.14,.19,.21],[-.06,.28,.33],[.08,.27,.32],[.15,.15,.18]],"#7da18a",[0,1.61,.32]);
    eyes(1.82,.27,.21);
    for(const s of [-1,1]) oval(`nostril-${s}`,[s*.13,1.69,.619],[.027,.018,.012],ink);
    sweep("monitor-smile",[[-.24,1.57,.51],[0,1.53,.64],[.24,1.57,.51]],.014,"#3f6257");
    for(let i=0;i<7;i++) oval(`dorsal-scale-${i}`,[0,.72+i*.16,-.24],[.07,.085,.06],"#497363");
    feet("#64907d");
    for(const s of [-1,1]) sweep(`monitor-arm-${s}`,[[s*.29,1.25,.03],[s*.49,.97,.12],[s*.32,.82,.39]],.12,"#64907d",.65);
    scarf(1.4,.23);book([-.05,.88,.42],"#aa5c3e");
  } else {
    const tiger=key==="harimau", orang=key==="orangutan", monkey=key==="bekantan", anoa=key==="anoa";
    const color=tiger?"#d68b39":orang?"#b85c32":monkey?"#b97645":anoa?"#53534b":"#82949a";
    profile("sculpted-torso",[[.3,.13,.16],[.49,.34,.27],[.83,.42,.3],[1.16,.36,.25],[1.39,.21,.18]],color);
    profile("belly-patch",[[.48,.06,.025],[.7,.25,.04],[1.05,.24,.045],[1.24,.09,.018]],tiger?cream:monkey?"#ecd2ab":orang?"#d58a55":"#a6a486",[0,0,.28]);
    profile("cheek-and-crown",[[1.28,.15,.16],[1.43,.35,.28],[1.7,.43,.32],[1.94,.33,.27],[2.06,.06,.06]],color);
    feet(color,anoa?.3:.28);
    for(const s of [-1,1]) {
      sweep(`arm-${s}`,[[s*.31,1.23,.02],[s*(orang?.64:.47),.91,.1],[s*(orang?.57:.36),orang?.42:.71,.32]],orang?.15:.12,color,.7);
      oval(`hand-${s}`,[s*(orang?.57:.36),orang?.44:.72,.34],[.13,.14,.11],orang||monkey?"#dca47c":color);
      if(tiger) {
        oval(`round-ear-${s}`,[s*.34,1.99,0],[.135,.15,.09],ink);
        oval(`ear-inner-${s}`,[s*.34,2.005,.07],[.08,.09,.025],cream);
      } else if(orang||monkey) {
        oval(`primate-ear-${s}`,[s*.4,1.69,.015],[.1,.14,.075],"#d69a72");
      } else {
        leaf(`long-ear-${s}`,[[s*.3,1.87,0],[s*.51,2,.005],[s*.59,2.08,-.06]],.14,color);
        leaf(`ear-inset-${s}`,[[s*.37,1.92,.04],[s*.49,2,.044],[s*.55,2.045,0]],.075,"#c1b5a0");
      }
    }
    if(orang||monkey) {
      oval("facial-mask",[0,1.67,.254],[.33,.29,.105],"#dcaa82");
      oval("primate-muzzle",[0,1.49,.35],[.21,.11,.09],"#e4b48e");
      eyes(1.78,.34,.16);
      if(monkey) {
        // The pendulous proboscis is a distinct curved, volumetric nose.
        profile("proboscis",[[-.22,.04,.055],[-.14,.12,.12],[.01,.09,.13],[.15,.045,.055]],"#d69b77",[0,1.61,.43],[.12,0,0]);
        sweep("proboscis-tail",[[0,.52,-.24],[.54,.34,-.38],[.79,.57,-.15],[.65,.82,.03]],.07,color,.08,1,"tail");
      } else {
        oval("nose",[0,1.62,.386],[.075,.046,.025],"#814b3d");
        for(let i=-2;i<=2;i++) leaf(`crown-lock-${i}`,[[i*.075,2,.01],[i*.08,2.12,-.03],[i*.11,2.09,-.1]],.06,color);
        // Long swept cheek locks, not spherical fur clumps.
        for(const s of [-1,1]) for(let i=0;i<3;i++) leaf(`cheek-lock-${s}-${i}`,[[s*(.32+i*.025),1.79-i*.08,.05],[s*(.44+i*.018),1.55-i*.07,.06],[s*.32,1.34-i*.055,.1]],.095,color);
      }
      sweep("primate-smile",[[-.11,1.48,.421],[0,1.455,.45],[.11,1.48,.421]],.012,"#925b48");
    } else {
      oval("muzzle",[0,1.48,.3],[anoa?.26:.3,.18,anoa?.23:.19],tiger?cream:anoa?"#b7aa8a":"#9dadae");
      eyes(1.79,.294,.21);
      if(tiger) {
        oval("cat-nose",[0,1.56,.477],[.086,.05,.031],"#895343");
        for(const s of [-1,1]) {
          for(let i=0;i<3;i++) leaf(`cheek-stripe-${s}-${i}`,[[s*.38,1.82-i*.11,.15],[s*.31,1.78-i*.11,.28],[s*.27,1.76-i*.11,.31]],.045,ink);
          for(let i=0;i<3;i++) sweep(`whisker-${s}-${i}`,[[s*.14,1.46,.462],[s*.29,1.46+i*.025,.45],[s*.43,1.48+i*.03,.42]],.008,cream,.4);
          for(let i=0;i<3;i++) leaf(`flank-stripe-${s}-${i}`,[[s*.37,1.09-i*.16,.12],[s*.31,1.06-i*.16,.23],[s*.23,1.03-i*.16,.28]],.045,ink);
        }
        for(let i=-1;i<=1;i++) leaf(`forehead-stripe-${i}`,[[i*.1,2,.09],[i*.075,1.94,.22],[i*.06,1.87,.29]],.039,ink);
        sweep("tiger-tail",[[0,.51,-.2],[.5,.28,-.28],[.78,.43,-.15],[.75,.77,0]],.09,color,.45,1,"tail");
        for(let i=0;i<3;i++) oval(`tail-band-${i}`,[.75,.52+i*.075,-.11+i*.035],[.065,.032,.062],ink);
      } else if(anoa) {
        for(const s of [-1,1]) {
          sweep(`anoa-horn-${s}`,[[s*.23,1.98,-.02],[s*.3,2.2,-.08],[s*.28,2.35,-.2]],.075,"#d2bea0",.025);
          oval(`bovine-nostril-${s}`,[s*.13,1.49,.514],[.039,.026,.017],ink);
        }
        sweep("anoa-tail",[[0,.52,-.22],[.48,.43,-.3],[.52,.27,-.15]],.035,color,.6,1,"tail");
        leaf("tail-tuft",[[.52,.3,-.17],[.55,.21,-.12],[.5,.16,-.1]],.075,ink);
      } else {
        // Javan rhinoceros: a single short horn and folded armour.
        sweep("single-javan-horn",[[0,1.5,.4],[0,1.67,.52],[0,1.85,.48]],.12,"#d7c7a2",.015);
        for(const s of [-1,1]) for(let i=0;i<2;i++) sweep(`armour-fold-${s}-${i}`,[[s*.29,1.2-i*.23,.17],[s*.39,1.1-i*.23,.1],[s*.38,1-i*.23,-.02]],.033,"#687f86",.7);
        sweep("rhino-tail",[[0,.51,-.24],[.38,.37,-.31],[.45,.3,-.24]],.043,color,.3,1,"tail");
      }
    }
    scarf(1.3,.27,orang?"#427b7a":monkey?"#4d7898":tiger?"#3b7770":"#b46b40");
    book([orang?-.1:.06,.83,.43],orang?"#ae8945":teal);
  }
  return {key,meshes};
}
