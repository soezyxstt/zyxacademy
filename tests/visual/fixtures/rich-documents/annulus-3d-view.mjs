import { annulusDesignParams, annulusDesignModel } from './annulus-design.mjs';

// The axial dimension is compressed for legibility; both radii use the same scale.
export function annulus3DGeometry(params) {
  const p = annulusDesignParams(params), ratio = p.innerDiameterM / p.outerDiameterM;
  const point = (x, r, angle) => [x, r * Math.cos(angle), r * Math.sin(angle)];
  const faces = [], segments = 36, axial = 20, start = Math.PI / 4, sweep = 3 * Math.PI / 2;
  for (let i = 0; i < segments; i++) {
    const a = start + sweep * i / segments, b = start + sweep * (i + 1) / segments;
    for (let j = 0; j < axial; j++) {
      const x = -2 + 4 * j / axial, y = -2 + 4 * (j + 1) / axial;
      for (const [r, kind] of [[1, 'outer'], [ratio, 'inner']]) faces.push({ kind, fraction: (j + .5) / axial, points: [point(x,r,a),point(y,r,a),point(y,r,b),point(x,r,b)] });
    }
    for (const x of [-2, 2]) faces.push({ kind: 'gap', fraction: (x + 2) / 4, points: [point(x,ratio,a),point(x,1,a),point(x,1,b),point(x,ratio,b)] });
  }
  for (const angle of [start, start + sweep]) {
    faces.push({ kind: 'cut', points: [point(-2,ratio,angle),point(2,ratio,angle),point(2,1,angle),point(-2,1,angle)] });
  }
  return { innerRadius: ratio, outerRadius: 1, faces };
}

export function annulus3DProject(point, camera) {
  const [x,y,z] = point, cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const horizontal = x * cy - y * sy, depth = x * sy + y * cy;
  return { x: horizontal, y: z * cp - depth * sp, depth: z * sp + depth * cp };
}

export function annulus3DFrame(geometry, camera, width, height) {
  const projected = geometry.faces.flatMap(face => face.points.map(point => annulus3DProject(point, camera)));
  const xs = projected.map(p => p.x), ys = projected.map(p => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), bottom = Math.min(...ys), top = Math.max(...ys);
  return { scale: Math.min((width - 64) / (right - left), (height - 64) / (top - bottom)), x: (left + right) / 2, y: (bottom + top) / 2 };
}

export function mountAnnulus3D(host, input = {}) {
  const initial = annulusDesignParams(input);
  let params = { ...initial }, camera = { yaw: -.5, pitch: .45 };
  const fields = [['innerDiameterM','Dᵢ (m)'],['outerDiameterM','Dₒ (m)'],['massFlowKgS','ṁ (kg/s)'],['targetOutletC','T keluar (°C)']];
  host.innerHTML = `<style>
    .ann3{font:14px/1.4 system-ui,sans-serif;color:#183b3a;max-width:1100px;margin:auto}.ann3 *{box-sizing:border-box}.ann3 [hidden]{display:none!important}.ann3-layout[hidden]{display:grid!important;visibility:hidden}.ann3-summary[hidden]{display:block!important;visibility:hidden}.ann3-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:12px}.ann3 canvas,.ann3 svg{display:block;width:100%;background:white;touch-action:none}.ann3 canvas{height:280px;cursor:grab}.ann3 svg{height:auto;cursor:crosshair}.ann3-fields{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px}.ann3-fields label{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;max-width:100%}.ann3 input{font:inherit;font-size:14px;color:inherit;width:82px;max-width:100%;min-height:32px;border:1px solid #bbc9c6;border-radius:5px;padding:3px 5px;background:white}.ann3 :focus-visible{outline:2px solid #1768a5;outline-offset:2px}.ann3-position{display:flex;align-items:center;gap:8px;margin-top:4px}.ann3 .ann3-position input{width:100%;flex:1;accent-color:#1768a5}.ann3-summary{font-size:13px;font-variant-numeric:tabular-nums;margin-top:6px}.ann3 button{font:inherit;color:inherit;min-height:32px;border:0;background:none;padding:0;text-decoration:underline;cursor:pointer}@media print{.ann3-fields,.ann3-position,.ann3 button,.ann3-error{display:none!important}}.ann3-error{color:#a42f24;font-size:13px;margin:6px 0 0}@media(max-width:700px){.ann3-layout{grid-template-columns:1fr;gap:4px}.ann3 canvas{height:220px}.ann3 input{width:76px}.ann3-fields{gap:6px 10px}}
  </style><section class="ann3" aria-label="Anulus"><div class="ann3-layout"><canvas tabindex="0" role="img" aria-label="Anulus 3D. Panah memutar kamera; Home mengembalikan kondisi awal."></canvas><svg tabindex="0" viewBox="0 0 400 230" role="slider" aria-valuemin="0" aria-valuemax="1" aria-label="Posisi sepanjang anulus (meter)"><g data-graph></g></svg></div><label class="ann3-position">Posisi (m)<input type="range" min="0" step="any" data-position aria-label="Posisi sepanjang anulus (meter)"></label><div class="ann3-summary" data-result aria-live="polite"></div><div class="ann3-fields">${fields.map(([key,label])=>`<label>${label}<input type="number" step="any" data-param="${key}"></label>`).join('')}</div><p class="ann3-error" data-error role="alert" hidden></p><button type="button" data-recover hidden>Atur ulang</button></section>`;
  const q = selector => host.querySelector(selector), canvas = q('canvas'), ctx = canvas.getContext('2d');
  function draw() {
    const model = annulusDesignModel(params), geometry = annulus3DGeometry(params);
    const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,rect.width,rect.height);
    // Keep the bitmap and its labels on the same background after host theme changes.
    ctx.fillStyle=getComputedStyle(host).getPropertyValue('--background').trim() || '#fff';ctx.fillRect(0,0,rect.width,rect.height);
    const frame = annulus3DFrame(geometry, camera, rect.width, rect.height);
    const screen = pt => { const v = annulus3DProject(pt,camera); return { x:rect.width/2 + (v.x-frame.x)*frame.scale, y:rect.height/2 - (v.y-frame.y)*frame.scale, depth:v.depth }; };
    const temperatureColor = t => { const k = Math.max(0,Math.min(1,(t - params.inletC) / (params.wallC - params.inletC))); return `rgb(${Math.round(65+165*k)},${Math.round(145-55*k)},${Math.round(195-130*k)})`; };
    const faces = geometry.faces.map(face => ({ ...face, projected:face.points.map(screen) }));
    faces.sort((a,b) => a.projected.reduce((s,p)=>s+p.depth,0)/4 - b.projected.reduce((s,p)=>s+p.depth,0)/4);
    for (const face of faces) {
      ctx.beginPath(); face.projected.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath();
      if (face.kind === 'cut') {
        const [a,b,,d] = face.projected, ax = b.x-a.x, ay = b.y-a.y, rx = d.x-a.x, ry = d.y-a.y;
        if (Math.abs(ax*ry-ay*rx) < 1e-8) continue;
        ctx.save(); ctx.transform(ax,ay,rx,ry,a.x,a.y);
        const gradient = ctx.createLinearGradient(0,0,1,0);
        for (const stop of model.colorStops) gradient.addColorStop(stop.fraction,temperatureColor(stop.bulkC));
        ctx.fillStyle = gradient; ctx.fillRect(0,0,1,1); ctx.restore(); continue;
      } else ctx.fillStyle = face.kind === 'outer' ? '#aabbb8' : face.kind === 'inner' ? '#b86143' : temperatureColor(face.fraction === 0 ? params.inletC : params.targetOutletC);
      ctx.fill(); if (face.kind !== 'cut') { ctx.strokeStyle = 'rgba(40,70,67,.22)'; ctx.lineWidth = .5; ctx.stroke(); }
    }
    const heatX=Math.abs((-2+4*params.probeFraction)+.8)<.5?.2:-.8;
    const heatStart=screen([heatX,geometry.innerRadius*Math.SQRT1_2,geometry.innerRadius*Math.SQRT1_2]), heatEnd=screen([heatX,(geometry.innerRadius+(1-geometry.innerRadius)*.55)*Math.SQRT1_2,(geometry.innerRadius+(1-geometry.innerRadius)*.55)*Math.SQRT1_2]);
    const angle=Math.atan2(heatEnd.y-heatStart.y,heatEnd.x-heatStart.x);
    ctx.beginPath();ctx.moveTo(heatStart.x,heatStart.y);ctx.lineTo(heatEnd.x,heatEnd.y);ctx.lineTo(heatEnd.x-7*Math.cos(angle-.5),heatEnd.y-7*Math.sin(angle-.5));ctx.moveTo(heatEnd.x,heatEnd.y);ctx.lineTo(heatEnd.x-7*Math.cos(angle+.5),heatEnd.y-7*Math.sin(angle+.5));ctx.strokeStyle='#9b291d';ctx.lineWidth=2.5;ctx.stroke();
    const probeX = -2 + 4 * params.probeFraction;
    const a = screen([probeX,geometry.innerRadius*Math.cos(Math.PI/4),geometry.innerRadius*Math.sin(Math.PI/4)]), b = screen([probeX,Math.cos(Math.PI/4),Math.sin(Math.PI/4)]);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineWidth=3;ctx.strokeStyle='#172d2c';ctx.stroke();
    const ink=getComputedStyle(host).getPropertyValue('--foreground').trim() || '#183b3a';
    ctx.font='13px system-ui';ctx.fillStyle=ink;
    const occupied=[];
    for(const [point,label,dx,dy,outline] of [[[-2,0,0],'Masuk',-20,20,false],[[2,0,0],'Keluar',-18,20,false],[[0,geometry.innerRadius*.707,geometry.innerRadius*.707],'T dinding',8,16,true],[[0,-.707,.707],'q″ = 0',-44,-8,true]]){
      const anchor=screen(point),width=ctx.measureText(label).width;
      const candidates=[[dx,dy],[8,-12],[-width-8,16],[-width-8,-12],[8,30],[-width-8,30],...[...Array(Math.floor((rect.height-56)/18))].map((_,i)=>[dx,16+i*18-anchor.y])];
      const boxes=candidates.map(([x,y])=>({x:Math.max(8,Math.min(rect.width-width-8,anchor.x+x)),y:Math.max(16,Math.min(rect.height-40,anchor.y+y)),width}));
      const box=boxes.find(a=>occupied.every(b=>a.x+a.width+4<=b.x||b.x+b.width+4<=a.x||a.y+4<=b.y-13||b.y+4<=a.y-13)) ?? boxes[0];
      occupied.push(box);ctx.save();
      if(outline){ctx.strokeStyle=getComputedStyle(host).getPropertyValue('--background').trim() || '#fff';ctx.lineWidth=4;ctx.strokeText(label,box.x,box.y);}
      ctx.fillText(label,box.x,box.y);ctx.restore();
    }
    const cold=params.inletC+' °C',hot=params.wallC+' °C';ctx.font='13px system-ui';const keyWidth=Math.min(rect.width-28,Math.max(130,ctx.measureText(cold).width+ctx.measureText(hot).width+24));const gradient=ctx.createLinearGradient(14,0,14+keyWidth,0);gradient.addColorStop(0,'rgb(65,145,195)');gradient.addColorStop(1,'rgb(230,90,65)');ctx.fillStyle=gradient;ctx.fillRect(14,rect.height-18,keyWidth,5);ctx.fillStyle=ink;ctx.fillText(cold,14,rect.height-24);ctx.fillText(hot,14+keyWidth-ctx.measureText(hot).width,rect.height-24);
    q('[data-result]').textContent = `Panjang ${model.lengthM.toFixed(2)} m; panas ${(model.heatW/1000).toFixed(2)} kW; x ${model.probe.xM.toFixed(2)} m; fluks lokal ${model.probe.heatFluxWm2.toFixed(0)} W/m²${model.probe.xM > 120 ? `; suhu ${model.probe.bulkC.toFixed(1)} \u00b0C; posisi di luar grafik 0 sampai 120 m` : ''}`;
    canvas.setAttribute('aria-label',`Anulus 3D, probe x ${model.probe.xM.toFixed(2)} meter, suhu ${model.probe.bulkC.toFixed(2)} derajat Celsius. Panah memutar kamera; Home mengembalikan kondisi awal.`);
    const position=q('[data-position]');position.max=String(model.lengthM);position.value=String(model.probe.xM);position.setAttribute('aria-valuetext',`x ${model.probe.xM.toFixed(2)} meter, suhu ${model.probe.bulkC.toFixed(2)} derajat Celsius, fluks lokal ${model.probe.heatFluxWm2.toFixed(1)} watt per meter persegi`);
    const graphNode=q('svg');graphNode.setAttribute('aria-valuemax',String(model.lengthM));graphNode.setAttribute('aria-valuenow',String(model.probe.xM));graphNode.setAttribute('aria-valuetext',`x ${model.probe.xM.toFixed(2)} meter, suhu ${model.probe.bulkC.toFixed(2)} derajat Celsius, fluks lokal ${model.probe.heatFluxWm2.toFixed(1)} watt per meter persegi${model.probe.xM > 120 ? ', posisi di luar grafik 0 sampai 120 meter' : ''}`);
    const graphX = x => 48 + 330*x/120, graphY = t => 185 - 145*(t-params.inletC)/(params.wallC-params.inletC);
    const visibleProfile = model.graphProfile;
    const line = visibleProfile.map((p,i)=>`${i?'L':'M'}${graphX(p.xM)},${graphY(p.bulkC)}`).join(' '), px=graphX(model.probe.xM), py=graphY(model.probe.bulkC), marker=model.probe.xM<=120?`<path d="M${px} 185V${py}" stroke="var(--muted-foreground)" stroke-dasharray="4 3"/><circle cx="${px}" cy="${py}" r="5" fill="var(--accent)"/><text x="${Math.min(325,Math.max(50,px-15))}" y="${Math.max(24,py-12)}" font-size="12">${model.probe.bulkC.toFixed(1)} °C</text>`:'';
    q('[data-graph]').innerHTML = `<path d="M48 20V185H378" fill="none" stroke="var(--foreground)"/><path d="${line}" fill="none" stroke="var(--primary)" stroke-width="3"/>${marker}<text x="48" y="16" font-size="13">T rata-rata (°C)</text><text x="48" y="205" font-size="12">0</text><path d="M378 185v5" stroke="var(--foreground)"/><text x="378" y="205" text-anchor="end" font-size="12">120 m</text><text x="42" y="189" text-anchor="end" font-size="12">${params.inletC.toFixed(0)}</text><text x="255" y="32" font-size="12">T dinding ${params.wallC.toFixed(1)} °C</text><path d="M48 40H378" stroke="var(--accent)" stroke-dasharray="5 4"/>`;
  }
  function sync(editedInput) { for (const el of host.querySelectorAll('[data-param]')) { if (el !== editedInput) el.value = String(params[el.dataset.param]); if (el.dataset.param === 'targetOutletC') el.style.width = `${Math.max(10, el.value.length + 4)}ch`; } draw(); }
  const api = { getState: () => ({ params:{...params}, model:annulusDesignModel(params), camera:{...camera} }), actions: {
    setParams(next, editedInput) { const candidate = annulusDesignParams({ ...params, ...next }); annulusDesignModel(candidate); params = candidate; q('[data-error]').hidden = true; q('[data-recover]').hidden = true; q('.ann3-layout').hidden = false; q('.ann3-position').hidden = false; q('[data-result]').hidden = false; sync(editedInput); return api.getState(); },
    reset() { params = {...initial}; camera = { yaw:-.5, pitch:.45 }; q('[data-error]').hidden = true; q('[data-recover]').hidden = true; q('.ann3-layout').hidden = false; q('.ann3-position').hidden = false; q('[data-result]').hidden = false; sync(); return api.getState(); }
  }};
  for (const el of host.querySelectorAll('[data-param]')) el.addEventListener('input', () => { try { if (el.value === '') throw new RangeError('Isi nilai'); api.actions.setParams({ [el.dataset.param]:Number(el.value) }, el); } catch (error) { q('[data-error]').textContent = error.message.includes('Suhu target')?`Target harus di antara ${params.inletC} dan ${params.wallC} °C.`:error.message.replace(/^(\w+) must be within (.+) and (.+)$/,(_,key,min,max)=>`${fields.find(f=>f[0]===key)?.[1]??key}: ${min} sampai ${max}.`); q('[data-error]').hidden = false; q('[data-recover]').hidden = false; q('.ann3-layout').hidden = true; q('.ann3-position').hidden = true; q('[data-result]').hidden = true; } });
  const position=q('[data-position]');
  position.addEventListener('input',event=>api.actions.setParams({probeFraction:Math.max(0,Math.min(1,Number(event.target.value)/annulusDesignModel(params).lengthM))}));
  position.addEventListener('keydown',event=>{const direction={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1,PageUp:10,PageDown:-10}[event.key];if(direction===undefined&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();const length=annulusDesignModel(params).lengthM,x=event.key==='Home'?0:event.key==='End'?length:Math.max(0,Math.min(length,Number(position.value)+direction));api.actions.setParams({probeFraction:x/length});});
  q('[data-recover]').addEventListener('click',()=>api.actions.reset());
  const graph=q('svg');
  function pointProbe(event){const r=graph.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,((event.clientX-r.left)*400/r.width-48)/330*120/annulusDesignModel(params).lengthM));api.actions.setParams({probeFraction:fraction});}
  let probing=false;
  graph.addEventListener('pointerdown',event=>{probing=true;graph.setPointerCapture(event.pointerId);pointProbe(event);});
  graph.addEventListener('pointermove',event=>{if(probing)pointProbe(event);});
  graph.addEventListener('pointerup',()=>{probing=false;});graph.addEventListener('pointercancel',()=>{probing=false;});
  graph.addEventListener('keydown',event=>{const direction={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[event.key];if(direction===undefined&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();const length=annulusDesignModel(params).lengthM,x=event.key==='Home'?0:event.key==='End'?length:Math.max(0,Math.min(length,params.probeFraction*length+direction));api.actions.setParams({probeFraction:x/length});});
  for(const surface of [canvas,graph])surface.addEventListener('dblclick',()=>api.actions.reset());
  canvas.addEventListener('keydown', event => { if(event.key==='Home'){event.preventDefault();api.actions.reset();return;} const d = {ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]}[event.key]; if (!d) return; event.preventDefault(); camera.yaw += d[0]; camera.pitch = Math.max(-1.4,Math.min(1.4,camera.pitch+d[1])); draw(); });
  let drag = null;
  canvas.addEventListener('pointerdown', event => { drag = [event.clientX,event.clientY]; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => { if (!drag) return; camera.yaw += (event.clientX-drag[0])*.01; camera.pitch = Math.max(-1.4,Math.min(1.4,camera.pitch+(event.clientY-drag[1])*.01)); drag=[event.clientX,event.clientY]; draw(); });
  canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
  const observer = new ResizeObserver(draw); observer.observe(canvas);
  addEventListener('message',event=>{if(event.source===parent && event.data?.type==='zyx:preferences')requestAnimationFrame(draw)});
  addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  sync(); return api;
}
