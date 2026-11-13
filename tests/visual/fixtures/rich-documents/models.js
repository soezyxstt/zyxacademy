export const edges = [[1,2],[1,3],[2,3],[2,4],[3,4],[3,5],[4,7],[5,6],[6,7]];
export const linked = (a,b) => edges.some(([x,y]) => (x===a && y===b) || (x===b && y===a));
export const milkMachine = (a,b) => !(a || b);
export const milkCircuit = (a,b) => milkMachine(milkMachine(a,a), milkMachine(b,b));
export const sampling = n => ({ se: 380 / Math.sqrt(n), mean: 2450 });
export const affine = ([x,y], a, b, tx, ty) => [a*x+b*y+tx, y+ty];
export const rotorStations = { damper: 1/4, beamCenter: 1/2, machine: 1 };
export function rotorResponse(r,t) {
  const M=500,m1=60,L=2,k=80000,m=10,e=.04,zeta=.08,me=M+m1/3,J=me*L*L,K=k*L*L/4,wn=Math.sqrt(K/J),c=16*zeta*Math.sqrt(k*me),C=c*L*L/16;
  const omega=r*wn,D=Math.hypot(1-r*r,2*zeta*r),F=m*e*omega*omega,amp=m*e*(r*r/D)/(me*L),phase=Math.atan2(2*zeta*r,1-r*r),psi=omega*t,theta=amp*Math.sin(psi-phase),v=omega*amp*Math.cos(psi-phase),acc=-omega*omega*theta;
  return {omega,F,amp,theta,v,acc,psi,J,C,K,L,M,m1};
}
