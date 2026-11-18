/** Loaded only by an explicitly mounted large viewer. No React frame updates. */
import * as THREE from "three";
import { createZyraMascotModel, type MascotModelKey } from "../../lib/gamification/zyra-mascot-models";
import { getZyraGlbMascotByKey, resolveMascotAnimation, type GlbMascotKey } from "../../lib/gamification/zyra-glb-mascots";
import { disposeMascotObject, loadZyraGlbMascot } from "./zyra-glb-loader";

// A module-wide lease guarantees a single live renderer, even across studio instances.
let releaseActiveViewer: (() => void) | undefined;
export type MascotViewerKey = MascotModelKey | GlbMascotKey;
export type MascotSceneHandle = { dispose: () => void; isDisposed: () => boolean; setAnimated: (value: boolean) => void; setModel: (key: MascotViewerKey) => void; setAnimation: (name: string) => void };
export function mountMascotScene(host: HTMLElement, key: MascotViewerKey, animated: boolean, onUnavailable: () => void, onReady?: (key: MascotViewerKey) => void, animationName = "idle"): MascotSceneHandle {
  releaseActiveViewer?.();
  const surface = document.createElement("canvas");
  const context = surface.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "low-power" });
  if (!context) throw new Error("WEBGL_UNAVAILABLE");
  const renderer = new THREE.WebGLRenderer({ canvas: surface, context, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene(), root = new THREE.Group();
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 30);
  const target = new THREE.Vector3(0, 1.16, 0);
  let yaw = .22, pitch = .08;
  function aim() {
    const radius = 4.7;
    camera.position.set(Math.sin(yaw)*Math.cos(pitch)*radius, target.y + Math.sin(pitch)*radius, Math.cos(yaw)*Math.cos(pitch)*radius);
    camera.lookAt(target);
  }
  aim();
  scene.add(new THREE.HemisphereLight(0xfff5e2, 0x536b7a, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffead1, 3.2); keyLight.position.set(-3, 5, 5); scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0xd5f1ff, 1.7); fill.position.set(4, 2, 1); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd6a0, 2.4); rim.position.set(1, 3, -4); scene.add(rim);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const moving: { object: THREE.Mesh; kind: string; scaleY: number; rotation: number; phase: number }[] = [];
  let currentKey = key, requestedAnimation = animationName;
  let pendingLoad: AbortController | undefined, loadVersion = 0, modelLoaded = false;
  let mixer: THREE.AnimationMixer | undefined, clips: THREE.AnimationClip[] = [];
  let rendered = false;
  let disposed = false, frame = 0, last = 0, elapsed = 0, inView = false, dirty = true;
  let observer: IntersectionObserver | undefined, resize: ResizeObserver | undefined;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = renderer.domElement;
  canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;border-radius:inherit";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Maskot 3D. Geser atau gunakan tombol panah untuk memutar. Home untuk mengatur ulang.");
  canvas.className = "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";
  canvas.dataset.mascotModel = key;
  function canDraw() { return !disposed && inView && !document.hidden; }
  function canAnimate() { return modelLoaded && animated && !reduced.matches && canDraw(); }
  function request() { if (!frame && canDraw()) frame = requestAnimationFrame(tick); }
  function invalidate() { dirty = true; request(); }
  function updatePose(delta: number) {
    if (mixer) {
      root.position.y = 0; root.rotation.z = 0;
      if (canAnimate()) mixer.update(delta);
      return;
    }
    const t = canAnimate() ? elapsed : 0;
    root.position.y = Math.sin(t * 1.65) * .018;
    root.rotation.z = Math.sin(t * .85) * .012;
    // Brief smooth eyelid-like pupil compression. No state or allocations per frame.
    const blinkPhase = t % 5.2;
    const blink = t > 0 && blinkPhase > 4.9 ? 1 - .93 * Math.sin((blinkPhase - 4.9) / .3 * Math.PI) : 1;
    for (const part of moving) {
      if (part.kind === "blink") part.object.scale.y = part.scaleY * blink;
      else if (part.kind === "tail") part.object.rotation.y = part.rotation + Math.sin(t * 1.3) * .045;
      else part.object.rotation.z = part.rotation + Math.sin(t * 1.4 + part.phase) * .026;
    }
  }
  function tick(now: number) {
    frame = 0;
    if (!canDraw()) { last = 0; return; }
    const delta = last ? now - last : 1000/30;
    if (dirty || delta >= 1000/30 - .2) {
      elapsed += Math.min(delta / 1000, 1/15);
      last = now; dirty = false;
      try {
        updatePose(Math.min(delta / 1000, 1/15));
        renderer.render(scene, camera);
        if (modelLoaded && !rendered) { rendered=true;onReady?.(currentKey); }
      } catch { dispose(); return; }
    }
    if (canAnimate()) request();
  }
  function activity() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; last = 0;
    invalidate();
  }
  function measure() {
    const {width,height} = host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    // CSS size may vary; drawing buffer stays bounded even in oversized host layouts.
    renderer.setSize(Math.min(width, 640), Math.min(height, 640), false);
    camera.aspect = width/height; camera.updateProjectionMatrix(); invalidate();
  }
  let pointer: number | null = null, previousX = 0, previousY = 0;
  function down(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return;
    pointer = event.pointerId; previousX = event.clientX; previousY = event.clientY;
    canvas.setPointerCapture(pointer); canvas.style.cursor = "grabbing";
  }
  function move(event: PointerEvent) {
    if (pointer !== event.pointerId) return;
    yaw -= (event.clientX-previousX)*.009;
    pitch = Math.max(-.32,Math.min(.48,pitch+(event.clientY-previousY)*.006));
    previousX=event.clientX;previousY=event.clientY;aim();invalidate();
  }
  function up() {
    const captured = pointer; pointer=null;
    if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
    canvas.style.cursor="grab";
  }
  function keyboard(event: KeyboardEvent) {
    if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(event.key)) return;
    event.preventDefault();
    if(event.key==="Home") { yaw=.22;pitch=.08; }
    else if(event.key==="ArrowLeft") yaw-=.15;
    else if(event.key==="ArrowRight") yaw+=.15;
    else pitch=Math.max(-.32,Math.min(.48,pitch+(event.key==="ArrowUp"?.08:-.08)));
    aim();invalidate();
  }
  function lost(event: Event) { event.preventDefault(); dispose(); }
  function dispose() {
    if(disposed) return;
    disposed=true;
    if(frame) cancelAnimationFrame(frame);
    frame=0;up();observer?.disconnect();resize?.disconnect();
    document.removeEventListener("visibilitychange",activity);reduced.removeEventListener("change",activity);
    window.removeEventListener("resize",measure);
    canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);
    canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("lostpointercapture",up);
    canvas.removeEventListener("keydown",keyboard);canvas.removeEventListener("webglcontextlost",lost);
    pendingLoad?.abort(); loadVersion++;
    clearModel();
    scene.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();
    if(releaseActiveViewer===dispose) releaseActiveViewer=undefined;
    onUnavailable();
  }
  function clearModel() {
    if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); }
    mixer = undefined; clips = [];
    disposeMascotObject(root);
    materials.clear(); moving.length=0; root.clear();
    root.position.y=0; root.rotation.z=0; modelLoaded=false;
  }
  function setAnimation(name: string) {
    requestedAnimation=name;
    const model=getZyraGlbMascotByKey(currentKey);
    if (!model || !mixer) return;
    const selected=resolveMascotAnimation(model,name);
    const clip=clips.find(item=>item.name===selected) ?? clips.find(item=>item.name==="idle");
    mixer.stopAllAction();
    if (clip) { mixer.clipAction(clip).reset().play(); mixer.update(0); }
    canvas.dataset.mascotAnimation=clip?.name ?? "";
    last=0; invalidate();
  }
  function setModel(nextKey: MascotViewerKey) {
    if(disposed) return;
    pendingLoad?.abort();
    const version=++loadVersion;
    clearModel(); currentKey=nextKey;
    canvas.dataset.mascotModel=nextKey;
    canvas.dataset.mascotAnimation="";
    canvas.dataset.meshCount="0";
    elapsed=0; rendered=false;
    const glbModel=getZyraGlbMascotByKey(nextKey);
    if (glbModel) {
      const controller=new AbortController(); pendingLoad=controller;
      void loadZyraGlbMascot(glbModel,controller.signal).then(gltf=>{
        if (disposed || version!==loadVersion) { disposeMascotObject(gltf.scene); return; }
        // A parent transform fits each source without changing animated node transforms.
        gltf.scene.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(gltf.scene);
        const size=bounds.getSize(new THREE.Vector3()), centre=bounds.getCenter(new THREE.Vector3());
        if (![size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0)) {
          disposeMascotObject(gltf.scene); throw new Error("INVALID_MASCOT_BOUNDS");
        }
        const scale=Math.min(2.35/size.y,2.7/size.x,2.7/size.z);
        const fitted=new THREE.Group();
        fitted.scale.setScalar(scale);
        fitted.position.set(-centre.x*scale,-bounds.min.y*scale,-centre.z*scale);
        fitted.add(gltf.scene); root.add(fitted);
        clips=gltf.animations;
        mixer=new THREE.AnimationMixer(gltf.scene);
        let meshCount=0;gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh)meshCount++;});
        canvas.dataset.meshCount=String(meshCount);
        modelLoaded=true; pendingLoad=undefined;
        setAnimation(requestedAnimation); invalidate();
      }).catch(()=>{
        if(disposed || version!==loadVersion || controller.signal.aborted) return;
        pendingLoad=undefined; clearModel(); onUnavailable(); invalidate();
      });
      invalidate();
      return;
    }
    for (const part of createZyraMascotModel(nextKey as MascotModelKey).meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(part.positions,3));
      geometry.setIndex(part.indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
      let material=materials.get(part.color);
      if(!material) {
        material=new THREE.MeshStandardMaterial({color:part.color,roughness:part.roughness,metalness:part.metalness});
        materials.set(part.color,material);
      }
      const object=new THREE.Mesh(geometry,material);object.name=part.name;
      object.position.set(...part.position);object.rotation.set(...part.rotation);object.scale.set(...part.scale);
      root.add(object);
      if(part.motion) moving.push({object,kind:part.motion,scaleY:part.scale[1],rotation:part.motion==="tail"?part.rotation[1]:part.rotation[2],phase:part.position[0]<0?Math.PI:0});
    }
    canvas.dataset.meshCount=String(root.children.length);
    modelLoaded=true; invalidate();
  }
  try {
    setModel(key);
    host.appendChild(canvas);
    canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);
    canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);canvas.addEventListener("lostpointercapture",up);
    canvas.addEventListener("keydown",keyboard);canvas.addEventListener("webglcontextlost",lost);
    document.addEventListener("visibilitychange",activity);reduced.addEventListener("change",activity);
    if(typeof ResizeObserver!=="undefined") { resize=new ResizeObserver(measure);resize.observe(host); }
    else window.addEventListener("resize",measure);
    if(typeof IntersectionObserver!=="undefined") {
      observer=new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;activity();});observer.observe(host);
    } else inView=true;
    releaseActiveViewer=dispose;measure();request();
  } catch(error) { dispose();throw error; }
  return {dispose,isDisposed:()=>disposed,setModel,setAnimation,setAnimated(value) { animated=value;activity(); }};
}
