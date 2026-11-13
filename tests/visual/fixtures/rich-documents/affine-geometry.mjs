export const polygon = [[0,0],[2,0],[2,1],[1,2],[0,1]];
export const frame = { width: 440, height: 160, origin: [180,120], scale: 40 };
export const project = ([x,y]) => [frame.origin[0]+x*frame.scale, frame.origin[1]-y*frame.scale];
export function pointRegion(index) {
  const [x,y]=project(polygon[index]), radius=26;
  let region=[[x-radius,y-radius],[x+radius,y-radius],[x+radius,y+radius],[x-radius,y+radius]];
  for(const [i,point] of polygon.entries()){
    if(i===index)continue;
    const [otherX,otherY]=project(point), dx=otherX-x, dy=otherY-y;
    const side=([px,py])=>2*(px-x)*dx+2*(py-y)*dy-dx*dx-dy*dy;
    const clipped=[];
    for(let j=0;j<region.length;j++){
      const start=region[j], end=region[(j+1)%region.length], a=side(start), b=side(end);
      if(a<=0)clipped.push(start);
      if((a<0&&b>0)||(a>0&&b<0))clipped.push(start.map((v,k)=>v+(end[k]-v)*a/(a-b)));
    }
    region=clipped;
  }
  return region;
}
export const gridLines = [
  ...Array.from({length:11},(_,i) => [[i-4,-1],[i-4,3]]),
  ...Array.from({length:5},(_,i) => [[-4,i-1],[6,i-1]]),
];
