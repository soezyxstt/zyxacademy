import { setup } from './shared.js';
import { affine } from './models.js';
import { polygon, frame, project, gridLines, pointRegion } from './affine-geometry.mjs';

setup();
const main=document.querySelector('main');
let a=1,b=0,tx=0,selected=0;
const xy=point=>project(point).join(',');
const line=([start,end])=>`M${xy(start)} L${xy(end)}`;
const transform=point=>affine(point,a,b,tx,0);
main.innerHTML=`<style>
  [data-point] { cursor: pointer; outline: none; }
  [data-point]:focus-visible .point-focus { stroke: var(--accent); stroke-width: 3; stroke-opacity: 1; }
  [data-point] .point-focus { fill: var(--background); fill-opacity: .08; stroke: var(--foreground); stroke-opacity: .35; stroke-dasharray: 3 3; }
  @media print { .point-focus { display: none; } }
  [data-affine-scene] text { font-size: 26px; paint-order: stroke; stroke: var(--background); stroke-width: 4px; stroke-linejoin: round; }
  .affine-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 14px; }
  .affine-legend span::before { content: ''; display: inline-block; width: 18px; margin-right: 5px; vertical-align: middle; border-top: 2px solid var(--foreground); }
  .affine-legend [data-image-key]::before { border-color: var(--primary); border-top-style: dashed; }
</style>
<div class="affine-legend" aria-label="Legenda"><span>Asal</span><span data-image-key>Hasil</span></div>
<svg data-affine-scene viewBox="0 0 ${frame.width} ${frame.height}" role="group" aria-label="Poligon dan grid asal serta hasil transformasi afin">
  <g data-original-grid fill="none" stroke="var(--border)" stroke-width="1">${gridLines.map((points,i)=>`<path data-grid-line="${i}" d="${line(points)}"/>`).join('')}</g>
  <g data-image-grid fill="none" stroke="var(--primary)" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="4 3">${gridLines.map((_,i)=>`<path data-grid-line="${i}"/>`).join('')}</g>
  <path data-axes d="M${xy([-4,0])} L${xy([6,0])} M${xy([0,-1])} L180,8" fill="none" stroke="var(--foreground)" stroke-width="1.5"/>
  <path data-axis-ticks d="M220,115 v10 M175,80 h10 M414,114 l6,6 -6,6 M174,14 l6,-6 6,6" fill="none" stroke="var(--foreground)" stroke-width="2"/>
  <polygon data-original-polygon points="${polygon.map(xy).join(' ')}" fill="var(--muted)" fill-opacity=".65" stroke="var(--foreground)" stroke-width="2"/>
  <polygon data-image-polygon fill="var(--primary)" fill-opacity=".3" stroke="var(--primary)" stroke-width="2.5"/>
  <circle data-image-point r="5" fill="var(--primary)" stroke="var(--background)" stroke-width="2" pointer-events="none"/>
  ${polygon.map((point,i)=>`<g data-point="${i}" role="button" tabindex="0" aria-label="Pilih titik ${i+1}, asal (${point.join(', ')})"><polygon class="point-focus" points="${pointRegion(i).map(p=>p.join(',')).join(' ')}"/><circle data-point-mark cx="${project(point)[0]}" cy="${project(point)[1]}" r="3.5" fill="var(--foreground)" stroke="var(--background)" stroke-width="1.5" pointer-events="none"/></g>`).join('')}
  <g data-axis-labels fill="var(--foreground)" pointer-events="none"><text x="148" y="148">0</text><text x="213" y="148">1</text><text x="151" y="85">1</text><text x="387" y="108">+x</text><text x="189" y="27">+y</text></g>
</svg>
<p data-coordinate aria-live="polite"></p>
<div class="controls"><label>Skala x <input data-a type="range" min="-1" max="2" step="0.1" value="1"> <output data-a-value></output></label><label>Geser x oleh y <input data-b type="range" min="-1" max="1" step="0.1" value="0"> <output data-b-value></output></label><label>Translasi x <input data-tx type="range" min="-1" max="1" step="0.1" value="0"> <output data-tx-value></output></label><button data-reset>Ulangi</button></div>
<p data-invertibility aria-live="polite"></p>`;
const q=selector=>main.querySelector(selector);
const points=main.querySelectorAll('[data-point]');
const imageGrid=main.querySelectorAll('[data-image-grid] [data-grid-line]');
const format=n=>Number(n.toFixed(2)).toString();
function draw(){
  imageGrid.forEach((path,i)=>path.setAttribute('d',line(gridLines[i].map(transform))));
  q('[data-image-polygon]').setAttribute('points',polygon.map(point=>xy(transform(point))).join(' '));
  const image=transform(polygon[selected]), [cx,cy]=project(image);
  q('[data-image-point]').setAttribute('cx',cx);q('[data-image-point]').setAttribute('cy',cy);
  points.forEach((point,i)=>{point.setAttribute('aria-pressed',String(i===selected));point.querySelector('[data-point-mark]').setAttribute('r',i===selected?'5':'3.5')});
  q('[data-coordinate]').textContent=`Titik ${selected+1}: asal (${polygon[selected].map(format).join(', ')}), hasil (${image.map(format).join(', ')})`;
  for(const [key,value] of Object.entries({a,b,tx}))q(`[data-${key}-value]`).textContent=value.toFixed(1);
  q('[data-invertibility]').textContent=a===0?'Skala nol meratakan poligon, sehingga transformasi tidak memiliki invers.':'Transformasi dapat dibalik karena skala x tidak nol.';
}
main.addEventListener('input',event=>{
  if(event.target.matches('[data-a]'))a=+event.target.value;
  else if(event.target.matches('[data-b]'))b=+event.target.value;
  else if(event.target.matches('[data-tx]'))tx=+event.target.value;
  else return;
  draw();
});
function selectPoint(point){selected=+point.dataset.point;draw()}
main.addEventListener('click',event=>{
  const point=event.target.closest('[data-point]');
  if(point)selectPoint(point);
  if(event.target.closest('[data-reset]')){
    a=1;b=tx=selected=0;
    q('[data-a]').value=a;q('[data-b]').value=b;q('[data-tx]').value=tx;
    draw();q('[data-reset]').focus();
  }
});
main.addEventListener('keydown',event=>{
  const point=event.target.closest('[data-point]');
  if(point && (event.key==='Enter' || event.key===' ')){event.preventDefault();selectPoint(point)}
});
draw();
const labelObserver=new ResizeObserver(()=>{
  const width=q('[data-affine-scene]').getBoundingClientRect().width;
  if(width)q('[data-affine-scene]').querySelectorAll('text').forEach(label=>{label.style.fontSize=14*frame.width/width+'px'});
});
labelObserver.observe(q('[data-affine-scene]'));
addEventListener('pagehide',()=>labelObserver.disconnect(),{once:true});
