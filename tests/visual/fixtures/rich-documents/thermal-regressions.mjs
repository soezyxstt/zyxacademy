import assert from 'node:assert/strict';
import { thermalCreateModel } from './thermal.mjs';
import { mountThermal, thermalViewMesh, thermalViewRotation, thermalViewProbeOnSurface } from './thermal-view.mjs';
import { annulusDesignModel } from './annulus-design.mjs';
import { mountAnnulus3D, annulus3DGeometry } from './annulus-3d-view.mjs';

const textDrawn=[], labelBoxes=[], fills=[];const noop = () => {};
let transform, stack=[], path=[];
const ctx = new Proxy({
  fillText:(text,x,y)=>{textDrawn.push(text);if(['Masuk','Keluar','T dinding'].includes(text)||text.startsWith('q'))labelBoxes.push({x,y,width:text.length*7})},measureText: text => ({width:text.length*7}),
  setTransform:(...args)=>{transform=args}, transform:(...args)=>{transform=args}, save:()=>stack.push(transform), restore:()=>{transform=stack.pop()},
  beginPath:()=>{path=[]}, moveTo:(x,y)=>path.push([x,y]), lineTo:(x,y)=>path.push([x,y]),
  createLinearGradient:(...args)=>({args,transform,stops:[],addColorStop(offset,color){this.stops.push({offset,color})}}),
  fill(){fills.push({style:this.fillStyle,path:[...path],paintTransform:transform})},
  fillRect(x,y,width,height){const [ax,ay,rx,ry,ox,oy]=transform;fills.push({style:this.fillStyle,path:[[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(([u,v])=>[ax*u+rx*v+ox,ay*u+ry*v+oy]),paintTransform:transform})}
},{get:(o,k)=>o[k] ?? noop,set:(o,k,v)=>(o[k]=v,true)});
class Element {
  constructor() { this.dataset={};this.style={};this.listeners={};this.attributes={};this.children=[];this.value=''; }
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
  dispatchEvent(event){Object.defineProperty(event,'target',{value:this,configurable:true});if(event.type==='keydown')this.onkeydown?.(event);for(const fn of this.listeners[event.type]??[])fn(event);}
  setAttribute(k,v){this.attributes[k]=v}
  append(child){this.children.push(child)}
  querySelector(s){return this.nodes?.[s] ?? null}
  querySelectorAll(){return []}
  getBoundingClientRect(){return {width:400,height:280,left:0,top:0}}
  getContext(){return ctx}
  setPointerCapture(){}
  hasPointerCapture(){return false}
}
const label=()=>{const el=new Element();el.nodes={input:new Element(),output:new Element(),select:new Element()};return el};
globalThis.document={createElement:label};
globalThis.window={devicePixelRatio:1};
globalThis.ResizeObserver=class{observe(){} disconnect(){}};
let frameCallback;globalThis.requestAnimationFrame=fn=>(frameCallback=fn,1);globalThis.cancelAnimationFrame=noop;
const flush=()=>{const fn=frameCallback;frameCallback=null;fn?.()};
globalThis.addEventListener=noop;globalThis.getComputedStyle=()=>({getPropertyValue:()=>''});
globalThis.parent={};
function key(el,k){el.dispatchEvent({type:'keydown',key:k,preventDefault:noop})}
function thermalHost(){
  const host=new Element(),root=new Element(), controls=new Element();const history=new Element();history.nodes=Object.fromEntries(['[data-history-marker]','[data-history-center]','[data-history-corner]'].map(k=>[k,new Element()]));root.nodes={canvas:new Element(),'.history':history,'.controls':controls,'.ticks':new Element(),'.readouts':new Element(),'.tip':new Element(),'.print-time':new Element(),'.axis-field':null};
  controls.append=el=>{controls.children.push(el);if(el.className==='axis-field')root.nodes['.axis-field']=el};
  host.nodes={'.thermal':root};return {host,root,controls};
}
function annulusHost(){
  const host=new Element();host.nodes={};for(const k of ['canvas','svg','[data-graph]','[data-result]','[data-error]','[data-recover]','[data-position]','.ann3-position','.ann3-layout'])host.nodes[k]=new Element();
  host.querySelectorAll=()=>[];return host;
}
const brick={dimensionsM:[.06,.10,.20],initialC:30,ambientC:1200,hWm2K:80,kWmK:1.9,rhoKgM3:2400,cpJkgK:1130,initialTimeS:1800,maxTimeS:5400};
const {host,root,controls}=thermalHost(), thermal=mountThermal(host,brick), time=controls.children[0].nodes.input;
key(time,'Home');for(let i=0;i<5;i++)key(time,'ArrowRight');assert.equal(thermal.getState().timeS,300);
for(let i=0;i<25;i++)key(time,'ArrowRight');assert.equal(thermal.getState().timeS,1800);
const model=thermalCreateModel(brick), close=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);
for(const [t,center,corner] of [[0,30,30],[300,132.5,991.4],[1800,956.6,1177.5]]){close(model.temperatureAt([0,0,0],t),center,.1);close(model.temperatureAt([.03,.05,.1],t),corner,.1)}
const history=root.nodes['.history'];
const paths=['center','corner'].map(name=>[...history.innerHTML.match(new RegExp(`data-history-curve="${name}" d="([^"]+)"`))[1].matchAll(/([ML])([-\d.]+) ([-\d.]+)/g)].map(([,command,x,y])=>({command,x:+x,y:+y})));
function interpolate(path,x){for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(b.command==='L'&&a.x<=x&&x<=b.x&&b.x>a.x)return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x)}return null}
let maxHistoryError=0;
for(const t of [1,5,15,30,45,60,300,1800])for(const [index,point] of [[0,[0,0,0]],[1,[.03,.05,.1]]]){const y=interpolate(paths[index],38+350*t/5400);assert.notEqual(y,null,`missing history at ${t}s`);const expected=model.temperatureAt(point,t),actual=30+(140-y)*1170/108;maxHistoryError=Math.max(maxHistoryError,Math.abs(actual-expected));close(actual,expected,2)}
assert.ok(paths.every(path=>path.length<300&&path.filter(p=>p.command==='M').length>=2),'bounded cached paths must break across unconverged early series');
thermal.actions.setTime(.0001);assert.equal(model.evaluate([0,0,0],.0001).converged,false);assert.match(root.nodes['.readouts'].innerHTML,/Deret belum konvergen/);assert.equal(history.nodes['[data-history-center]'].attributes.visibility,'hidden');assert.equal(interpolate(paths[0],38+350*.0001/5400),null,'curve must not bridge unconverged time');
const htmlBefore=history.innerHTML;thermal.actions.setTime(15);assert.equal(history.innerHTML,htmlBefore,'history is cached across time changes');
for(const [t,c,k] of [[0,30,30],[300,132.5,991.4],[1800,956.6,1177.5]]){thermal.actions.setTime(t);close(Number(root.nodes['.history'].nodes['[data-history-center]'].attributes['data-temperature']),c,.1);close(Number(root.nodes['.history'].nodes['[data-history-corner]'].attributes['data-temperature']),k,.1)}
thermal.actions.reset();thermal.actions.setProbe([.03,0,-.01]);thermal.actions.setSlice(-.05);close(thermal.getState().probeM[2],-.05,1e-12);thermal.actions.reset();thermal.actions.setSlice(.065);thermal.actions.setAxis('x');close(thermal.getState().sliceM,.0195,1e-12);close(thermal.getState().probeM[0],.0195,1e-12);
assert.match(root.nodes['.readouts'].innerHTML,/0,0195/);
const slice=controls.children[2].nodes.input;
assert.equal(slice.attributes['aria-label'],'Posisi irisan x (meter)');
assert.equal(slice.attributes['aria-valuetext'],'x 0,0195 meter');
key(slice,'ArrowRight');assert.equal(slice.attributes['aria-valuetext'],'x 0,01956 meter');
for(const [axis,half] of [['x',.03],['y',.05],['z',.1]]){thermal.actions.setAxis(axis);thermal.actions.setSlice(-half);close(thermal.getState().probeM['xyz'.indexOf(axis)],-half,1e-12);thermal.actions.setSlice(half);close(thermal.getState().probeM['xyz'.indexOf(axis)],half,1e-12);thermal.actions.setSlice(-half);close(thermal.getState().probeM['xyz'.indexOf(axis)],-half,1e-12)}
const occlusionPoint=[.03,-.009375,-.059375],cut=thermalViewMesh(brick.dimensionsM,{axis:2,positionM:0,cut:true,resolution:32});
const visibleAt=yaw=>thermalViewProbeOnSurface(occlusionPoint,cut.bounds,cut.cells.filter(c=>thermalViewRotation(c.normal,yaw,24)[2]>1e-8));
assert.equal(visibleAt(35),true);assert.equal(visibleAt(-40),false);
thermal.actions.reset();thermal.actions.setProbe(occlusionPoint);flush();assert.doesNotMatch(root.nodes['.readouts'].innerHTML,/Probe tertutup arah pandang/);
const stable=thermal.getState();for(let i=0;i<5;i++)key(root.nodes.canvas,'ArrowLeft');flush();assert.equal(thermal.getState().yawDeg,-40);assert.match(root.nodes['.readouts'].innerHTML,/data-probe-occluded role="status">Probe tertutup arah pandang/);assert.match(root.nodes.canvas.attributes['aria-label'],/Probe tertutup arah pandang/);assert.deepEqual(thermal.getState().probeM,stable.probeM);assert.equal(thermal.getState().probeTemperatureC,stable.probeTemperatureC);root.nodes.canvas.dispatchEvent({type:'pointerdown',button:0,pointerId:1,clientX:10,clientY:20});root.nodes.canvas.dispatchEvent({type:'pointermove',pointerId:1,clientX:197.5,clientY:20});root.nodes.canvas.dispatchEvent({type:'pointerup',pointerId:1,clientX:197.5,clientY:20});flush();assert.equal(thermal.getState().yawDeg,35);assert.deepEqual(thermal.getState().probeM,stable.probeM);assert.doesNotMatch(root.nodes['.readouts'].innerHTML,/Probe tertutup arah pandang/);
const before=thermal.getState();thermal.actions.rotate(60,20);const after=thermal.getState();assert.equal(after.timeS,before.timeS);assert.deepEqual(after.probeM,before.probeM);assert.equal(after.sliceM,before.sliceM);thermal.actions.reset();assert.equal(thermal.getState().timeS,1800);assert.match(root.nodes['.readouts'].innerHTML,/1\.177,5/);
const input={innerDiameterM:.025,outerDiameterM:.1,massFlowKgS:.05,cpJkgK:4186,hWm2K:64.2,inletC:25,targetOutletC:95,wallC:125,probeFraction:1};
for(const [flow,length] of [[.05,49.98],[.1,99.96]]){const m=annulusDesignModel({...input,massFlowKgS:flow});close(m.lengthM,length,.01);close(m.probe.heatFluxWm2,1926,.01);close(m.heatW,flow*4186*70,1e-8)}
const ann=annulusHost(),api=mountAnnulus3D(ann,input),graph=ann.nodes.svg;
let maxAnnulusError=0, maxColorError=0;
for(const target of [95,124.999999,124.99999999999999]){
  fills.length=0;api.actions.setParams({massFlowKgS:.2,targetOutletC:target});const m=api.getState().model;assert.equal(m.graphProfile.length,41);close(m.graphProfile.at(-1).xM,Math.min(120,m.lengthM),1e-9);
  const geometry=annulus3DGeometry({...input,massFlowKgS:.2,targetOutletC:target}), colored=geometry.faces.filter(face=>face.kind==='cut');
  const painted=fills.filter(fill=>fill.style?.stops&&JSON.stringify(fill.style.args)==='[0,0,1,0]');assert.equal(colored.length,2);assert.equal(painted.length,2);assert.ok(geometry.faces.length<1600);
  for(const face of painted){
    const gradient=face.style;assert.deepEqual(face.paintTransform,gradient.transform);assert.deepEqual(gradient.args,[0,0,1,0]);assert.equal(gradient.stops.length,321);
    const [ax,ay,rx,ry,ox,oy]=gradient.transform, [a,b,c,d]=face.path;
    for(const [actual,expected] of [[ox,a[0]],[oy,a[1]],[ox+ax,b[0]],[oy+ay,b[1]],[ox+rx,d[0]],[oy+ry,d[1]],[ox+ax+rx,c[0]],[oy+ay+ry,c[1]]])close(actual,expected,1e-8);
    for(const [i,stop] of gradient.stops.entries()){assert.ok(Number.isFinite(stop.offset)&&stop.offset>=0&&stop.offset<=1);if(i)assert.ok(stop.offset>=gradient.stops[i-1].offset);assert.match(stop.color,/^rgb\(\d+,\d+,\d+\)$/);const expected=125-100*Math.exp(-64.2*Math.PI*.025*stop.offset*m.lengthM/(.2*4186));close(25+100*(Number(stop.color.match(/\d+/)[0])-65)/165,expected,.31)}
  }
  const graphPath=[...ann.nodes['[data-graph]'].innerHTML.match(/<path d="(M48,185[^"]+)" fill="none" stroke="var\(--primary\)"/)[1].matchAll(/([ML])([-\d.e+]+),([-\d.e+]+)/g)].map(([,command,x,y])=>({command,x:+x,y:+y}));
  for(const x of [1.5,29.3,60,88.5,119]){assert.ok(m.lengthM>x);const y=interpolate(graphPath,48+330*x/120);assert.notEqual(y,null);const line=25+(185-y)*100/145;const expected=125-100*Math.exp(-64.2*Math.PI*.025*x/(.2*4186));maxAnnulusError=Math.max(maxAnnulusError,Math.abs(line-expected));close(line,expected,.1);
    for(const face of painted){const stops=face.style.stops, fraction=x/m.lengthM, i=stops.findIndex(stop=>stop.offset>=fraction);assert.ok(i>0);const a=stops[i-1],b=stops[i],t=(fraction-a.offset)/(b.offset-a.offset), red=color=>Number(color.match(/\d+/)[0]);const colorC=25+100*(red(a.color)+(red(b.color)-red(a.color))*t-65)/165;maxColorError=Math.max(maxColorError,Math.abs(colorC-expected));close(colorC,expected,2)} }
  for(const x of [0,1,2]){if(x===0)key(graph,'Home');else key(graph,'ArrowRight');close(api.getState().model.probe.xM,x,1e-9);close(Number(ann.nodes['[data-position]'].value),x,1e-9)}
  key(graph,'End');close(api.getState().model.probe.xM,m.lengthM,1e-9);assert.match(ann.nodes['[data-result]'].textContent,/posisi di luar grafik/);key(graph,'Home');assert.match(ann.nodes['[data-graph]'].innerHTML,/<circle/);
}
for(const target of [-99.999999, 499.999999, 499.99999999999994]) {
  const p={...input,inletC:-100,wallC:500,targetOutletC:target},m=annulusDesignModel(p);
  assert.equal(m.colorStops.length,321);
  for(const [i,stop] of m.colorStops.entries()){assert.ok([stop.fraction,stop.bulkC].every(Number.isFinite));assert.ok(stop.fraction>=0&&stop.fraction<=1);if(i)assert.ok(stop.fraction>=m.colorStops[i-1].fraction);const expected=500-600*Math.exp(-p.hWm2K*Math.PI*p.innerDiameterM*stop.fraction*m.lengthM/(p.massFlowKgS*p.cpJkgK));close(stop.bulkC,expected,1e-9)}
}
api.actions.reset();
assert.ok(textDrawn.includes('125 \u00b0C'));textDrawn.length=0;api.actions.setParams({targetOutletC:90});assert.ok(textDrawn.includes('125 \u00b0C'));api.actions.reset();
assert.match(ann.nodes['[data-result]'].textContent,/x 49\.98 m; fluks lokal 1926/);assert.match(ann.nodes['[data-graph]'].innerHTML,/120 m/);
assert.match(ann.nodes['[data-graph]'].innerHTML,/<text x="378" y="205" text-anchor="end" font-size="12">120 m/);
key(graph,'Home');close(api.getState().model.probe.xM,0,1e-12);for(let i=0;i<25;i++)key(graph,'ArrowRight');close(api.getState().model.probe.xM,25,1e-10);key(graph,'End');close(api.getState().params.probeFraction,1,1e-12);
graph.dispatchEvent({type:'pointerdown',clientX:48+(330*api.getState().model.lengthM/120)*.5,pointerId:1});close(api.getState().params.probeFraction,.5,1e-12);
const x25=48+330*25/120;graph.dispatchEvent({type:'pointerdown',clientX:x25,pointerId:1});close(api.getState().model.probe.xM,25,1e-10);const marker1=ann.nodes['[data-graph]'].innerHTML.match(/<circle cx="([^"]+)/)[1];api.actions.setParams({massFlowKgS:.1});graph.dispatchEvent({type:'pointerdown',clientX:x25,pointerId:1});close(api.getState().model.probe.xM,25,1e-10);assert.equal(ann.nodes['[data-graph]'].innerHTML.match(/<circle cx="([^"]+)/)[1],marker1);
api.actions.setParams({massFlowKgS:.2,probeFraction:1});const position=ann.nodes['[data-position]'];key(position,'Home');for(let i=0;i<150;i++)key(position,'ArrowRight');close(api.getState().model.probe.xM,150,1e-9);key(position,'End');close(api.getState().model.probe.xM,api.getState().model.lengthM,1e-9);for(const x of [0,100,150,api.getState().model.lengthM]){position.value=String(x);position.dispatchEvent({type:'input'});close(api.getState().model.probe.xM,x,1e-10);const expected=125-100*Math.exp(-64.2*Math.PI*.025*x/(.2*4186));close(api.getState().model.probe.bulkC,expected,1e-10);close(api.getState().model.probe.heatFluxWm2,64.2*(125-expected),1e-8)}assert.match(ann.nodes['[data-result]'].textContent,/posisi di luar grafik/);assert.doesNotMatch(ann.nodes['[data-graph]'].innerHTML,/<circle/);key(graph,'Home');assert.match(ann.nodes['[data-graph]'].innerHTML,/<circle/);const physics=api.getState().model;key(ann.nodes.canvas,'ArrowRight');assert.deepEqual(api.getState().model,physics);api.actions.reset();close(api.getState().model.lengthM,49.98,.01);assert.equal(api.getState().params.probeFraction,1);
for(const direction of [...Array(21).fill('ArrowRight'),...Array(6).fill('ArrowUp'),...Array(12).fill('ArrowDown')]){
  labelBoxes.length=0;key(ann.nodes.canvas,direction);assert.equal(labelBoxes.length,4);
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const a=labelBoxes[i],b=labelBoxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y<=b.y-13||b.y<=a.y-13,'Annulus labels overlap');}
}
console.log(`thermal regressions passed; max history error ${maxHistoryError.toFixed(4)} C; max annulus graph error ${maxAnnulusError.toFixed(4)} C; max annulus color error ${maxColorError.toFixed(4)} C`);
