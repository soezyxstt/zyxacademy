import assert from 'node:assert/strict';
import { captureMatches } from './capture-match.mjs';
import { affine, linked, milkCircuit, milkMachine, sampling, rotorResponse, rotorStations } from './models.js';
import { polygon, frame, project, gridLines, pointRegion } from './affine-geometry.mjs';
import { playbackAllowed } from './shared.js';
import { thermalCreateModel } from './thermal.mjs';
import { annulusDesignModel } from './annulus-design.mjs';
const capture={documentSha256:'html',printSha256:'png'};
assert.equal(captureMatches(capture,'html','png'),true);
assert.equal(captureMatches(capture,'changed','png'),false);
assert.equal(captureMatches(capture,'html','changed'),false);
assert.equal(captureMatches(null,'html','png'),false);
assert.equal(captureMatches(capture,'html',null),false);
const route=[2,1,3,4,7,6,5];
assert.equal(new Set(route).size,7);
assert.ok(route.slice(1).every((room,i)=>linked(route[i],room)));
assert.equal(linked(1,5),false);
for(const a of [false,true])for(const b of [false,true]){
  assert.equal(milkMachine(a,b),!(a||b));
  assert.equal(milkCircuit(a,b),a&&b);
}
assert.equal(sampling(16).se,95);
assert.equal(sampling(64).se,47.5);
assert.deepEqual(affine([2,3],2,.5,1,-1),[6.5,2]);
assert.deepEqual(polygon,[[0,0],[2,0],[2,1],[1,2],[0,1]]);
assert.deepEqual(project([0,0]),frame.origin);
assert.deepEqual(project([1,0]),[frame.origin[0]+frame.scale,frame.origin[1]]);
assert.deepEqual(project([0,1]),[frame.origin[0],frame.origin[1]-frame.scale]);
assert.ok(gridLines.some(([p,q])=>p[0]===0 && q[0]===0));
assert.ok(gridLines.some(([p,q])=>p[1]===0 && q[1]===0));
for(const a of [-1,2])for(const b of [-1,1])for(const tx of [-1,1])for(const [x,y] of polygon){
  const expected=[a*x+b*y+tx,y], actual=affine([x,y],a,b,tx,0);
  assert.deepEqual(actual,expected);
  const [px,py]=project(actual);
  assert.ok(px>=9 && px<=frame.width-9 && py>=9 && py<=frame.height-9);
}
assert.deepEqual(affine([2,1],2,1,1,0),[6,1]);
assert.deepEqual(affine([2,1],-1,-1,-1,0),[-4,1]);
assert.deepEqual(affine([2,1],1,1,0,0),[3,1]);
assert.deepEqual(affine([2,1],-1,0,0,0),[-2,1]);
assert.deepEqual(affine([2,1],0,1,1,0),[2,1]);
const originGrid=gridLines.find(([p,q])=>p[0]===0 && q[0]===0);
assert.deepEqual(originGrid.map(p=>project(affine(p,2,1,1,0))),[[180,160],[340,0]]);
assert.deepEqual(project(affine([0,0],2,1,1,0)),[220,120]);
for(const [i,point] of polygon.entries()){
  const [x,y]=project(point), region=pointRegion(i);
  assert.ok(region.length>=3);
  for(const [px,py] of region){
    assert.ok(px>=0 && px<=frame.width && py>=0 && py<=frame.height);
    const distance=Math.hypot(px-x,py-y);
    for(const [j,other] of polygon.entries())if(i!==j){
      const [ox,oy]=project(other);
      assert.ok(distance<=Math.hypot(px-ox,py-oy)+1e-9);
    }
  }
}
const insideRegion=(region,[x,y])=>region.every((p,i)=>{
  const q=region[(i+1)%region.length];
  return (q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0])>=-1e-9;
});
for(const width of [220,277])for(const [i,point] of polygon.entries()){
  const [x,y]=project(point);
  for(const [dx,dy] of [[-8,0],[8,0],[0,-8],[0,8]]){
    const sample=[x+dx*frame.width/width,y+dy*frame.width/width];
    assert.deepEqual(polygon.map((_,j)=>insideRegion(pointRegion(j),sample)),polygon.map((_,j)=>i===j));
  }
}
for(const ratio of [.8,1,1.5])for(const time of [0,.3,1.2]){const v=rotorResponse(ratio,time);assert.ok(Math.abs(v.J*v.acc+v.C*v.v+v.K*v.theta-v.L*v.F*Math.sin(v.psi))<1e-9)}
for(const hidden of [false,true])for(const active of [false,true])for(const reduced of [false,true])assert.equal(playbackAllowed(hidden,active,reduced),!hidden&&active&&!reduced);
for(const ratio of [.8,1,1.5])for(const time of [0,.3,1.2]){
  const v=rotorResponse(ratio,time), G=v.L*rotorStations.beamCenter, machine=v.L*rotorStations.machine, IG=v.m1*v.L**2/12;
  const beamForce=-v.m1*G*v.acc, machineForce=-v.M*machine*v.acc, couple=-IG*v.acc;
  assert.equal(rotorStations.damper,1/4);assert.equal(G,v.L/2);assert.equal(machine,v.L);
  assert.ok(Math.abs(beamForce*G+machineForce*machine+couple+v.J*v.acc)<1e-9);
  const Fy=v.F*Math.sin(v.psi), Fk=v.K*v.theta/G, Fc=v.C*v.v/(v.L/4);
  const Hy=-Fy+Fk+Fc-beamForce-machineForce;
  assert.ok(Math.abs(Hy+Fy-Fk-Fc+beamForce+machineForce)<1e-9);
  assert.ok(Math.abs(v.L*Fy-G*Fk-v.L/4*Fc+beamForce*G+machineForce*machine+couple)<1e-9);
}
const brick=thermalCreateModel({dimensionsM:[.06,.1,.2],initialC:30,ambientC:1200,hWm2K:80,kWmK:1.9,rhoKgM3:2400,cpJkgK:1130});
assert.equal(brick.temperatureAt([0,0,0],0),30);
assert.ok(Math.abs(brick.temperatureAt([0,0,0],1800)-956.6)<.2);
assert.ok(Math.abs(brick.temperatureAt([.03,.05,.1],1800)-1177.5)<.2);
const params={innerDiameterM:.025,outerDiameterM:.1,massFlowKgS:.05,cpJkgK:4186,hWm2K:64.2,inletC:25,targetOutletC:95,wallC:125};
const once=annulusDesignModel(params),twice=annulusDesignModel({...params,massFlowKgS:.1});
assert.ok(Math.abs(once.lengthM-49.98)<.1);assert.ok(Math.abs(twice.lengthM-2*once.lengthM)<1e-10);assert.ok(Math.abs(once.profile.at(-1).bulkC-95)<1e-10);
console.log('Route, milk truth table, sampling, affine, rotor residual, thermal and annulus checks passed');
